package system_setting

import (
	_ "embed"

	"github.com/QuantumNous/new-api/setting/config"
)

//go:embed legal/user-agreement.md
var defaultUserAgreement string

//go:embed legal/privacy-policy.md
var defaultPrivacyPolicy string

type LegalSettings struct {
	UserAgreement string `json:"user_agreement"`
	PrivacyPolicy string `json:"privacy_policy"`
}

var defaultLegalSettings = LegalSettings{
	UserAgreement: defaultUserAgreement,
	PrivacyPolicy: defaultPrivacyPolicy,
}

func init() {
	config.GlobalConfig.Register("legal", &defaultLegalSettings)
}

func GetLegalSettings() *LegalSettings {
	return &defaultLegalSettings
}
