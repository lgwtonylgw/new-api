"""Focused retention/deletion checks; no Docker daemon or network is used."""
import contextlib
import importlib.util
import io
import json
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location(
    "cleanup_new_api_images", Path(__file__).parents[1] / "cleanup-new-api-images.py"
)
cleanup = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = cleanup
SPEC.loader.exec_module(cleanup)
NOW = datetime(2026, 11, 22, 9, 0, tzinfo=timezone.utc)


def record(number, days, tags=None):
    return {
        "Id": f"sha256:{number:064x}",
        "Created": (NOW - timedelta(days=days)).isoformat(),
        "RepoTags": tags or [],
        "RepoDigests": [f"{cleanup.REGISTRY}@sha256:{number:064x}"],
    }


class DockerFixture:
    def __init__(self, app_dir, new_container=False, foreign_reference=False):
        self.app_dir = app_dir
        self.backup = "new-api-local-rollback:20260101T000000Z-7"
        self.images = {
            row["Id"]: row
            for row in [
                record(1, 0),
                record(2, 30, [self.backup]),
                record(3, 3),
                record(4, 60, ["new-api-local-rollback:20260101T000000Z-8"]),
            ]
        }
        self.calls = []
        self.new_container = new_container
        self.foreign_reference = foreign_reference
        state = app_dir / ".release"
        state.mkdir()
        (state / "previous-image").write_text(self.backup, encoding="utf-8")

    def __call__(self, command, **_kwargs):
        args = tuple(command[1:])
        self.calls.append(args)
        if args == ("inspect", "new-api"):
            value = [{
                "Image": record(1, 0)["Id"],
                "Config": {"Labels": {
                    "com.docker.compose.service": "new-api",
                    "com.docker.compose.project.working_dir": str(self.app_dir),
                }},
            }]
        elif args == ("ps", "-aq"):
            return subprocess.CompletedProcess(command, 0, "app\n", "")
        elif args[:3] == ("inspect", "--format", "{{.Image}}"):
            return subprocess.CompletedProcess(command, 0, record(1, 0)["Id"] + "\n", "")
        elif args[:2] == ("ps", "-aq"):
            return subprocess.CompletedProcess(
                command, 0, "other-container\n" if self.new_container else "", ""
            )
        elif args == ("image", "ls", "-aq", "--no-trunc"):
            return subprocess.CompletedProcess(command, 0, "\n".join(self.images), "")
        elif args[:2] == ("image", "inspect"):
            value = []
            for reference in args[2:]:
                row = next(
                    (row for row in self.images.values()
                     if reference == row["Id"]
                     or reference in row["RepoTags"] + row["RepoDigests"]),
                    None,
                )
                if row is None:
                    return subprocess.CompletedProcess(command, 1, "", "No such image")
                if self.foreign_reference and reference == record(4, 60)["Id"] and len(args) == 3:
                    row = {**row, "RepoTags": row["RepoTags"] + ["another-service:keep"]}
                value.append(row)
        elif args[:3] == ("image", "rm", "--no-prune"):
            reference = args[3]
            for image_id, row in list(self.images.items()):
                if reference == image_id or reference in row["RepoTags"] + row["RepoDigests"]:
                    if reference in row["RepoTags"] and len(row["RepoTags"]) > 1:
                        row["RepoTags"].remove(reference)
                    else:
                        del self.images[image_id]
                    return subprocess.CompletedProcess(command, 0, "Deleted\n", "")
            raise AssertionError(f"Attempted to remove an unknown reference: {reference}")
        else:
            raise AssertionError(f"Unexpected Docker operation: {args}")
        return subprocess.CompletedProcess(command, 0, json.dumps(value), "")


class RetentionTests(unittest.TestCase):
    def candidates(self, rows, protected=None, keep=3):
        images = [cleanup.image_from_record(row) for row in rows]
        return [
            image.image_id
            for image, reason in cleanup.cleanup_plan(
                images, record(1, 0)["Id"], protected or {}, NOW, keep, 7
            )
            if reason == "remove"
        ]

    def test_keeps_three_distinct_history_images_and_removes_only_older_history(self):
        rows = [record(1, 0)] + [record(number, number * 10) for number in range(2, 6)]
        rows.append(record(2, 20))  # An alias/listing must not consume another slot.
        self.assertEqual(self.candidates(rows), [record(5, 50)["Id"]])

    def test_keeps_current_rollback_and_container_references_outside_count_limit(self):
        rows = [record(1, 100), record(2, 20), record(3, 30), record(4, 40)]
        protected = {
            record(3, 30)["Id"]: "rollback",
            record(4, 40)["Id"]: "stopped container",
        }
        self.assertEqual(self.candidates(rows, protected, keep=1), [])

    def test_minimum_age_and_recent_backup_protect_old_builds(self):
        recent_backup = "new-api-local-rollback:20261121T000000Z-5"
        rows = [record(1, 0), record(2, 1), record(3, 2), record(4, 3)]
        rows.append(record(5, 100, [recent_backup]))
        self.assertEqual(self.candidates(rows, keep=1), [])

    def test_foreign_or_manually_pinned_alias_protects_the_whole_image(self):
        for alias in ["another-service:keep", f"{cleanup.REGISTRY}:stable"]:
            with self.subTest(alias=alias):
                rows = [record(1, 0), record(2, 1), record(3, 60, [alias])]
                self.assertEqual(self.candidates(rows, keep=1), [])

    def test_unknown_timestamp_is_never_eligible_for_deletion(self):
        unknown = {**record(3, 60), "Created": "unrecognized"}
        self.assertEqual(self.candidates([record(1, 0), record(2, 1), unknown], keep=1), [])

    def test_docker_nanosecond_timestamps_are_normalized_to_microseconds(self):
        row = {**record(3, 60), "Created": "2026-09-23T09:00:00.123456789Z"}
        self.assertEqual(
            cleanup.image_from_record(row).retained_at,
            datetime(2026, 9, 23, 9, 0, 0, 123456, tzinfo=timezone.utc),
        )

    def test_invalid_or_missing_saved_rollback_stops_cleanup(self):
        with tempfile.TemporaryDirectory() as directory:
            app_dir = Path(directory).resolve()
            fixture = DockerFixture(app_dir)
            fixture.images.pop(record(2, 30)["Id"])
            with patch.object(cleanup.subprocess, "run", side_effect=fixture):
                with self.assertRaisesRegex(RuntimeError, "rollback image is missing"):
                    cleanup.protected_images(app_dir)
            self.assertFalse(any(call[:2] == ("image", "rm") for call in fixture.calls))

    def test_preview_performs_no_delete_and_apply_uses_only_scoped_unforced_removal(self):
        for apply in [False, True]:
            with self.subTest(apply=apply), tempfile.TemporaryDirectory() as directory:
                app_dir = Path(directory).resolve()
                fixture = DockerFixture(app_dir)
                argv = ["--app-dir", str(app_dir), "--keep", "1"]
                if apply:
                    argv.append("--apply")
                with patch.object(cleanup.subprocess, "run", side_effect=fixture):
                    with contextlib.redirect_stdout(io.StringIO()):
                        self.assertEqual(cleanup.main(argv), 0)
                removals = [call for call in fixture.calls if call[:2] == ("image", "rm")]
                self.assertEqual(len(removals), 1 if apply else 0)
                if apply:
                    self.assertEqual(removals[0], (
                        "image", "rm", "--no-prune",
                        "new-api-local-rollback:20260101T000000Z-8",
                    ))
                for number in [1, 2, 3]:
                    self.assertIn(record(number, 0)["Id"], fixture.images)

    def test_rechecks_new_container_uses_and_foreign_aliases_before_removal(self):
        for options in [{"new_container": True}, {"foreign_reference": True}]:
            with self.subTest(options=options), tempfile.TemporaryDirectory() as directory:
                app_dir = Path(directory).resolve()
                fixture = DockerFixture(app_dir, **options)
                with patch.object(cleanup.subprocess, "run", side_effect=fixture):
                    with contextlib.redirect_stdout(io.StringIO()):
                        self.assertEqual(cleanup.main(["--app-dir", str(app_dir), "--keep", "1", "--apply"]), 0)
                self.assertFalse(any(call[:2] == ("image", "rm") for call in fixture.calls))

    def test_all_owned_aliases_are_removed_before_the_old_image_content_is_released(self):
        with tempfile.TemporaryDirectory() as directory:
            app_dir = Path(directory).resolve()
            fixture = DockerFixture(app_dir)
            old_id = record(4, 60)["Id"]
            other_alias = "new-api-local-rollback:20260102T000000Z-9"
            fixture.images[old_id]["RepoTags"].append(other_alias)
            with patch.object(cleanup.subprocess, "run", side_effect=fixture):
                with contextlib.redirect_stdout(io.StringIO()):
                    self.assertEqual(cleanup.main(["--app-dir", str(app_dir), "--keep", "1", "--apply"]), 0)
            self.assertNotIn(old_id, fixture.images)
            removals = [call for call in fixture.calls if call[:2] == ("image", "rm")]
            self.assertEqual(removals, [
                ("image", "rm", "--no-prune", "new-api-local-rollback:20260101T000000Z-8"),
                ("image", "rm", "--no-prune", other_alias),
            ])


if __name__ == "__main__":
    unittest.main()
