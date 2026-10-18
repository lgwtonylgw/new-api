package model

import (
	"errors"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const requiredEmailVerificationMigrationKey = "_migration.require_email_verification.v1"

// migrateRequiredEmailVerification enables the existing, end-to-end email
// verification flow once for installations created before it became the
// registration default. The marker preserves an administrator's later choice
// to disable the setting instead of turning it back on at every startup.
func migrateRequiredEmailVerification(db *gorm.DB) error {
	return db.Transaction(func(tx *gorm.DB) error {
		var marker Option
		err := tx.Where("key = ?", requiredEmailVerificationMigrationKey).First(&marker).Error
		if err == nil {
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}

		options := []Option{
			{Key: "EmailVerificationEnabled", Value: "true"},
			{Key: requiredEmailVerificationMigrationKey, Value: "true"},
		}
		return tx.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "key"}},
			DoUpdates: clause.AssignmentColumns([]string{"value"}),
		}).Create(&options).Error
	})
}
