package system_setting

import (
	_ "embed"
	"strings"

	"github.com/QuantumNous/new-api/setting/config"
)

//go:embed legal/user-agreement.md
var defaultUserAgreement string

//go:embed legal/privacy-policy.md
var defaultPrivacyPolicy string

//go:embed legal/service-region.md
var serviceRegionRestriction string

type LegalSettings struct {
	UserAgreement string `json:"user_agreement"`
	PrivacyPolicy string `json:"privacy_policy"`
}

var defaultLegalSettings = LegalSettings{
	UserAgreement: strings.TrimSpace(defaultUserAgreement) + "\n\n" + strings.TrimSpace(serviceRegionRestriction),
	PrivacyPolicy: defaultPrivacyPolicy,
}

func init() {
	config.GlobalConfig.Register("legal", &defaultLegalSettings)
}

func GetLegalSettings() *LegalSettings {
	return &defaultLegalSettings
}

// Include the region policy even when an older agreement was saved in settings.
func GetUserAgreementContent() string {
	content := strings.TrimSpace(GetLegalSettings().UserAgreement)
	restriction := strings.TrimSpace(serviceRegionRestriction)
	if strings.Contains(content, restriction) {
		return content
	}
	return strings.TrimSpace(content + "\n\n" + restriction)
}
