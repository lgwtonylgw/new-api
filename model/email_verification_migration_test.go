package model

import (
	"path/filepath"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func emailVerificationMigrationDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "migration.db")), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Option{}))
	return db
}

func TestMigrateRequiredEmailVerificationEnablesExistingInstallation(t *testing.T) {
	db := emailVerificationMigrationDB(t)
	require.NoError(t, db.Create(&Option{
		Key:   "EmailVerificationEnabled",
		Value: "false",
	}).Error)

	require.NoError(t, migrateRequiredEmailVerification(db))

	var option Option
	require.NoError(t, db.First(&option, "key = ?", "EmailVerificationEnabled").Error)
	require.Equal(t, "true", option.Value)
	require.NoError(t, db.First(&option, "key = ?", requiredEmailVerificationMigrationKey).Error)
}

func TestMigrateRequiredEmailVerificationPreservesLaterAdminChoice(t *testing.T) {
	db := emailVerificationMigrationDB(t)
	require.NoError(t, migrateRequiredEmailVerification(db))
	require.NoError(t, db.Model(&Option{}).
		Where("key = ?", "EmailVerificationEnabled").
		Update("value", "false").Error)

	require.NoError(t, migrateRequiredEmailVerification(db))

	var option Option
	require.NoError(t, db.First(&option, "key = ?", "EmailVerificationEnabled").Error)
	require.Equal(t, "false", option.Value)
}
