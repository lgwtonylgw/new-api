package controller

import (
	"math"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

func isPaymentComplianceConfirmed() bool {
	return operation_setting.IsPaymentComplianceConfirmed()
}

func isStripeTopUpEnabled() bool {
	if !isPaymentComplianceConfirmed() {
		return false
	}
	return strings.TrimSpace(setting.StripeApiSecret) != "" &&
		strings.TrimSpace(setting.StripeWebhookSecret) != "" &&
		strings.TrimSpace(setting.StripePriceId) != ""
}

func isStripeWebhookConfigured() bool {
	return strings.TrimSpace(setting.StripeWebhookSecret) != ""
}

func isStripeWebhookEnabled() bool {
	return isStripeTopUpEnabled()
}

func isCreemTopUpEnabled() bool {
	if !isPaymentComplianceConfirmed() {
		return false
	}
	products := strings.TrimSpace(setting.CreemProducts)
	return strings.TrimSpace(setting.CreemApiKey) != "" &&
		products != "" &&
		products != "[]"
}

func isCreemWebhookConfigured() bool {
	return strings.TrimSpace(setting.CreemWebhookSecret) != ""
}

func isCreemWebhookEnabled() bool {
	return isCreemTopUpEnabled() && isCreemWebhookConfigured()
}

func isWaffoTopUpEnabled() bool {
	if !isPaymentComplianceConfirmed() {
		return false
	}
	if !setting.WaffoEnabled {
		return false
	}

	return isWaffoWebhookConfigured()
}

func isWaffoWebhookConfigured() bool {
	if setting.WaffoSandbox {
		return strings.TrimSpace(setting.WaffoSandboxApiKey) != "" &&
			strings.TrimSpace(setting.WaffoSandboxPrivateKey) != "" &&
			strings.TrimSpace(setting.WaffoSandboxPublicCert) != ""
	}

	return strings.TrimSpace(setting.WaffoApiKey) != "" &&
		strings.TrimSpace(setting.WaffoPrivateKey) != "" &&
		strings.TrimSpace(setting.WaffoPublicCert) != ""
}

func isWaffoWebhookEnabled() bool {
	return isWaffoTopUpEnabled()
}

func isWaffoPancakeTopUpEnabled() bool {
	if !isPaymentComplianceConfirmed() {
		return false
	}
	// Presence-of-credentials = enabled. Webhook public keys ship inside
	// the SDK; mode (test/prod) is read from each event.
	return strings.TrimSpace(setting.WaffoPancakeMerchantID) != "" &&
		strings.TrimSpace(setting.WaffoPancakePrivateKey) != "" &&
		strings.TrimSpace(setting.WaffoPancakeProductID) != ""
}

func isWaffoPancakeWebhookConfigured() bool {
	return isWaffoPancakeTopUpEnabled()
}

func isWaffoPancakeWebhookEnabled() bool {
	return isWaffoPancakeTopUpEnabled()
}

func isEpayTopUpEnabled() bool {
	if !isPaymentComplianceConfirmed() {
		return false
	}
	if !isEpayWebhookConfigured() {
		return false
	}
	for _, method := range operation_setting.PayMethods {
		if method["type"] != model.PaymentMethodEpusdtTRC20 && method["type"] != model.PaymentMethodAlipayManual && method["type"] != model.PaymentMethodUSDTManual {
			return true
		}
	}
	return false
}

func isEpayWebhookConfigured() bool {
	return strings.TrimSpace(operation_setting.PayAddress) != "" &&
		strings.TrimSpace(operation_setting.EpayId) != "" &&
		strings.TrimSpace(operation_setting.EpayKey) != ""
}

func isEpayWebhookEnabled() bool {
	return isEpayTopUpEnabled()
}

func isEpusdtWebhookConfigured() bool {
	s := operation_setting.GetPaymentSetting()
	pid, err := strconv.ParseInt(strings.TrimSpace(s.EpusdtMerchantID), 10, 64)
	if err != nil || pid <= 0 || strconv.FormatInt(pid, 10) != strings.TrimSpace(s.EpusdtMerchantID) || strings.TrimSpace(s.EpusdtSecretKey) == "" {
		return false
	}
	endpoint, err := url.Parse(strings.TrimSpace(s.EpusdtPayAddress))
	return err == nil && endpoint.Scheme == "https" && endpoint.Hostname() != "" &&
		endpoint.User == nil && endpoint.RawQuery == "" && endpoint.Fragment == "" &&
		strings.TrimSuffix(endpoint.Path, "/") == "/payments/epay/v1/order/create-transaction"
}

func isEpusdtTopUpEnabled() bool {
	return isPaymentComplianceConfirmed() && operation_setting.GetPaymentSetting().EpusdtEnabled && isEpusdtWebhookConfigured()
}

func isManualUSDTTopUpEnabled() bool {
	s := operation_setting.GetPaymentSetting()
	return isPaymentComplianceConfirmed() && s.USDTManualEnabled &&
		s.USDTExchangeRate > 0 && !math.IsInf(s.USDTExchangeRate, 0) && !math.IsNaN(s.USDTExchangeRate) &&
		((s.USDTNetwork == "TRC20" && regexp.MustCompile(`^T[1-9A-HJ-NP-Za-km-z]{33}$`).MatchString(strings.TrimSpace(s.USDTAddress))) ||
			(s.USDTNetwork == "ERC20" && regexp.MustCompile(`^0x[0-9a-fA-F]{40}$`).MatchString(strings.TrimSpace(s.USDTAddress))))
}
