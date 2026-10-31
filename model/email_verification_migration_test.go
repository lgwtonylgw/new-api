package model

import (
	"os"
	"path/filepath"
	"strconv"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
)

func emailVerificationMigrationDB(t *testing.T, dialect string) *gorm.DB {
	t.Helper()
	var dialector gorm.Dialector
	switch dialect {
	case "sqlite":
		dialector = sqlite.Open(filepath.Join(t.TempDir(), "migration.db"))
	case "mysql":
		dsn := os.Getenv("TEST_MYSQL_DSN")
		if dsn == "" {
			t.Skip("TEST_MYSQL_DSN is not configured")
		}
		dialector = mysql.Open(dsn)
	case "postgres":
		dsn := os.Getenv("TEST_POSTGRES_DSN")
		if dsn == "" {
			t.Skip("TEST_POSTGRES_DSN is not configured")
		}
		dialector = postgres.Open(dsn)
	}
	db, err := gorm.Open(dialector, &gorm.Config{
		NamingStrategy: schema.NamingStrategy{TablePrefix: "email_verification_migration_test_"},
	})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() {
		require.NoError(t, db.Migrator().DropTable(&Option{}))
		require.NoError(t, db.Migrator().DropTable(&User{}))
		require.NoError(t, sqlDB.Close())
	})
	require.NoError(t, db.AutoMigrate(&Option{}, &User{}))
	var version string
	versionQuery := "SELECT VERSION()"
	if dialect == "sqlite" {
		versionQuery = "SELECT sqlite_version()"
	}
	require.NoError(t, db.Raw(versionQuery).Scan(&version).Error)
	t.Logf("database: %s %s", dialect, version)
	return db
}

func TestMigrateRequiredEmailVerificationPreservesExistingInstallationChoice(t *testing.T) {
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			db := emailVerificationMigrationDB(t, dialect)
			require.NoError(t, db.Create(&Option{
				Key:   "EmailVerificationEnabled",
				Value: "false",
			}).Error)

			require.NoError(t, migrateRequiredEmailVerification(db))

			var option Option
			require.NoError(t, db.Where(&Option{Key: "EmailVerificationEnabled"}).First(&option).Error)
			require.Equal(t, "false", option.Value)
			option = Option{}
			require.NoError(t, db.Where(&Option{Key: requiredEmailVerificationMigrationKey}).First(&option).Error)
		})
	}
}

func TestMigrateRequiredEmailVerificationEnablesNewInstallation(t *testing.T) {
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			db := emailVerificationMigrationDB(t, dialect)

			require.NoError(t, migrateRequiredEmailVerification(db))
			require.NoError(t, migrateRequiredEmailVerification(db))

			var option Option
			require.NoError(t, db.Where(&Option{Key: "EmailVerificationEnabled"}).First(&option).Error)
			require.Equal(t, "true", option.Value)
		})
	}
}

func TestMigrateRequiredEmailVerificationPreservesLegacyDefault(t *testing.T) {
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		for _, deleted := range []bool{false, true} {
			t.Run(dialect+"/deleted="+strconv.FormatBool(deleted), func(t *testing.T) {
				db := emailVerificationMigrationDB(t, dialect)
				user := &User{Username: "existing-user"}
				require.NoError(t, db.Create(user).Error)
				if deleted {
					require.NoError(t, db.Delete(user).Error)
				}

				require.NoError(t, migrateRequiredEmailVerification(db))
				require.NoError(t, migrateRequiredEmailVerification(db))
				var option Option
				require.NoError(t, db.Where(&Option{Key: "EmailVerificationEnabled"}).First(&option).Error)
				require.Equal(t, "false", option.Value)
				var preserved User
				require.NoError(t, db.Unscoped().First(&preserved, user.Id).Error)
				require.Equal(t, deleted, preserved.DeletedAt.Valid)
			})
		}
	}
}

func TestMigrateRequiredEmailVerificationPreservesLaterAdminChoice(t *testing.T) {
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			db := emailVerificationMigrationDB(t, dialect)
			require.NoError(t, migrateRequiredEmailVerification(db))
			require.NoError(t, db.Model(&Option{}).
				Where(&Option{Key: "EmailVerificationEnabled"}).
				Update("value", "false").Error)

			require.NoError(t, migrateRequiredEmailVerification(db))

			var option Option
			require.NoError(t, db.Where(&Option{Key: "EmailVerificationEnabled"}).First(&option).Error)
			require.Equal(t, "false", option.Value)
		})
	}
}
