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
	content = strings.ReplaceAll(content, "## 7. 服务地区限制与注册确认", "## 7. 服务地区限制")
	content = strings.ReplaceAll(content, "注册时，您须主动确认本人不属于上述中国大陆地区用户，并已阅读、理解本条服务地区限制。该确认适用于用户名注册以及微信、Google、GitHub、Telegram 等第三方账号首次创建本站账户；未确认者不能创建账户。", "注册即表示您已阅读并同意上述服务地区限制。如不符合服务地区要求，请勿创建账户或使用本站服务。")
	content = strings.ReplaceAll(content, "您应如实作出声明，不得通过代理", "您不得通过代理")
	if strings.Contains(content, restriction) {
		return content
	}
	return strings.TrimSpace(content + "\n\n" + restriction)
}
