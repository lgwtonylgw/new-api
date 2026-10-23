package model

import (
	"errors"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const requiredEmailVerificationMigrationKey = "_migration.require_email_verification.v1"

// migrateRequiredEmailVerification makes verification the default when the
// option has never been configured. Existing administrator choices are kept,
// and the marker prevents repeating the migration on later startups.
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

		options := []Option{
			{Key: "EmailVerificationEnabled", Value: "true"},
			{Key: requiredEmailVerificationMigrationKey, Value: "true"},
		}
		return tx.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "key"}},
			DoNothing: true,
		}).Create(&options).Error
	})
}
