#!/usr/bin/env python3
"""Preview or remove old local new-api images; called under deploy-image.sh's lock."""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

REGISTRY = "ghcr.io/lgwtonylgw/new-api"
BACKUP_TAG = re.compile(r"^new-api-local-rollback:(\d{8}T\d{6}Z)-\d+$")
BUILD_TAG = re.compile(
    rf"^{re.escape(REGISTRY)}:sha-[0-9a-f]{{12}}-(?:amd64|arm64)-r\d+-a\d+$"
)
DIGEST = re.compile(rf"^{re.escape(REGISTRY)}@sha256:[0-9a-f]{{64}}$")


@dataclass(frozen=True)
class Image:
    image_id: str
    references: tuple[str, ...]
    retained_at: datetime | None

    @property
    def owned(self) -> bool:
        return bool(self.references) and all(owned_reference(ref) for ref in self.references)


def owned_reference(reference: str) -> bool:
    return bool(
        BACKUP_TAG.fullmatch(reference)
        or BUILD_TAG.fullmatch(reference)
        or DIGEST.fullmatch(reference)
        or reference == "new-api:production"
    )


def image_from_record(record: dict) -> Image:
    references = tuple(
        dict.fromkeys((record.get("RepoTags") or []) + (record.get("RepoDigests") or []))
    )
    retained_at = None
    try:
        created = record["Created"].replace("Z", "+00:00")
        created = re.sub(r"(\.\d{6})\d+", r"\1", created)
        retained_at = datetime.fromisoformat(created)
        if retained_at.tzinfo is None:
            retained_at = None
        else:
            for reference in references:
                match = BACKUP_TAG.fullmatch(reference)
                if match:
                    backup_time = datetime.strptime(
                        match.group(1), "%Y%m%dT%H%M%SZ"
                    ).replace(tzinfo=timezone.utc)
                    retained_at = max(retained_at, backup_time)
    except (KeyError, TypeError, ValueError):
        # Unknown age is protected rather than interpreted as an ancient image.
        retained_at = None
    return Image(record["Id"], references, retained_at)


def docker(*arguments: str) -> str:
    result = subprocess.run(
        ["docker", *arguments], capture_output=True, text=True, check=False
    )
    if result.returncode:
        raise RuntimeError(f"docker {' '.join(arguments)}: {result.stderr.strip()}")
    return result.stdout


def inspect_image(reference: str) -> dict | None:
    result = subprocess.run(
        ["docker", "image", "inspect", reference],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode:
        if "no such image" in result.stderr.lower() or "no such object" in result.stderr.lower():
            return None
        raise RuntimeError(f"Cannot inspect image {reference}: {result.stderr.strip()}")
    records = json.loads(result.stdout)
    if len(records) != 1:
        raise RuntimeError(f"Unexpected image inspection result for {reference}")
    return records[0]


def protected_images(app_dir: Path) -> tuple[str, dict[str, str]]:
    records = json.loads(docker("inspect", "new-api"))
    container = records[0]
    labels = container["Config"].get("Labels") or {}
    original_dir = labels.get("com.docker.compose.project.working_dir")
    if (
        labels.get("com.docker.compose.service") != "new-api"
        or not original_dir
        or Path(original_dir).resolve() != app_dir
    ):
        raise RuntimeError("Run cleanup from the original new-api Compose directory.")
    current = container["Image"]
    protected = {current: "current application"}
    container_ids = docker("ps", "-aq").split()
    if container_ids:
        for image_id in docker(
            "inspect", "--format", "{{.Image}}", *container_ids
        ).split():
            protected[image_id] = "referenced by a running or stopped container"
    previous_file = app_dir / ".release" / "previous-image"
    if previous_file.exists():
        reference = previous_file.read_text(encoding="utf-8").strip()
        if not BACKUP_TAG.fullmatch(reference):
            raise RuntimeError("Invalid saved rollback reference; cleanup stopped.")
        previous = inspect_image(reference)
        if previous is None:
            raise RuntimeError("Saved rollback image is missing; cleanup stopped.")
        protected[previous["Id"]] = "saved rollback target"
    return current, protected


def cleanup_plan(
    images: list[Image],
    current: str,
    protected: dict[str, str],
    now: datetime,
    keep: int,
    min_age_days: int,
) -> list[tuple[Image, str]]:
    # Docker can list one ID more than once because aliases share content.
    unique = {image.image_id: image for image in images}
    history = sorted(
        (
            image
            for image in unique.values()
            if image.owned and image.retained_at is not None and image.image_id != current
        ),
        key=lambda image: (image.retained_at, image.image_id),
        reverse=True,
    )
    newest = {image.image_id for image in history[:keep]}
    cutoff = now - timedelta(days=min_age_days)
    plan = []
    for image in unique.values():
        if not image.owned:
            continue
        if image.image_id == current:
            reason = "current application"
        elif image.image_id in protected:
            reason = protected[image.image_id]
        elif image.retained_at is None:
            reason = "unknown retention time"
        elif image.image_id in newest:
            reason = f"among newest {keep} historical images"
        elif image.retained_at >= cutoff:
            reason = f"within {min_age_days} days"
        else:
            reason = "remove"
        plan.append((image, reason))
    return plan


def remove_image(
    planned: Image, app_dir: Path, min_age_days: int, now: datetime
) -> bool:
    # Re-check actual references and all container uses immediately before mutation.
    _, protected = protected_images(app_dir)
    record = inspect_image(planned.image_id)
    if record is None:
        return False
    image = image_from_record(record)
    if (
        image.image_id in protected
        or not image.owned
        or image.retained_at is None
        or image.retained_at >= now - timedelta(days=min_age_days)
    ):
        print(f"KEEP {image.image_id[:19]}: protection changed after preview")
        return False
    if docker("ps", "-aq", "--filter", f"ancestor={image.image_id}").strip():
        print(f"KEEP {image.image_id[:19]}: a container now uses this image")
        return False
    # Use aliases first because Docker refuses an ID with multiple tags.
    # --no-prune prevents deletion of unrelated untagged parent images.
    for reference in image.references:
        if inspect_image(image.image_id) is None:
            return True
        docker("image", "rm", "--no-prune", reference)
    remaining = inspect_image(image.image_id)
    if remaining is not None:
        refreshed = image_from_record(remaining)
        if refreshed.references:
            raise RuntimeError("Image gained another reference; stopped without forcing removal.")
        docker("image", "rm", "--no-prune", image.image_id)
    return True


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app-dir", type=Path, required=True)
    parser.add_argument("--keep", type=int, default=3)
    parser.add_argument("--min-age-days", type=int, default=7)
    parser.add_argument("--apply", action="store_true", help="Actually remove eligible local images.")
    args = parser.parse_args(argv)
    if args.keep < 1 or args.min_age_days < 1:
        parser.error("--keep and --min-age-days must both be at least 1")
    app_dir = args.app_dir.resolve()
    current, protected = protected_images(app_dir)
    image_ids = list(dict.fromkeys(docker("image", "ls", "-aq", "--no-trunc").split()))
    images = []
    for offset in range(0, len(image_ids), 100):
        records = json.loads(docker("image", "inspect", *image_ids[offset : offset + 100]))
        images.extend(image_from_record(record) for record in records)
    now = datetime.now(timezone.utc)
    plan = cleanup_plan(images, current, protected, now, args.keep, args.min_age_days)
    candidates = [image for image, reason in plan if reason == "remove"]
    print(
        f"Local image cleanup: keep={args.keep}, minimum age={args.min_age_days}d, "
        f"mode={'APPLY' if args.apply else 'PREVIEW'}"
    )
    for image, reason in plan:
        print(f"{'REMOVE' if reason == 'remove' else 'KEEP'} {image.image_id[:19]}: {reason}")
    if not args.apply:
        print(f"Preview only: {len(candidates)} image(s) eligible; nothing removed.")
        return 0
    removed = 0
    for image in candidates:
        if remove_image(image, app_dir, args.min_age_days, now):
            removed += 1
    print(f"Removed {removed} old local image(s).")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, RuntimeError, ValueError, KeyError) as error:
        print(f"Cleanup stopped: {error}", file=sys.stderr)
        sys.exit(1)
