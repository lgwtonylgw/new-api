package model

import (
	"errors"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const requiredEmailVerificationMigrationKey = "_migration.require_email_verification.v1"

// migrateRequiredEmailVerification enables verification on fresh installations.
// Existing users (including deleted users) preserve the legacy default, while
// explicit administrator choices always win.
func migrateRequiredEmailVerification(db *gorm.DB) error {
	return db.Transaction(func(tx *gorm.DB) error {
		var marker Option
		err := tx.Where(&Option{Key: requiredEmailVerificationMigrationKey}).First(&marker).Error
		if err == nil {
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}

		var existingUser User
		err = tx.Unscoped().Select("id").First(&existingUser).Error
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		verificationEnabled := "true"
		if err == nil {
			verificationEnabled = "false"
		}

		options := []Option{
			{Key: "EmailVerificationEnabled", Value: verificationEnabled},
			{Key: requiredEmailVerificationMigrationKey, Value: "true"},
		}
		return tx.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "key"}},
			DoNothing: true,
		}).Create(&options).Error
	})
}
