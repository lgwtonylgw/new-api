package controller

import (
	"fmt"
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
)

func RequestManualTopUpPay(c *gin.Context) {
	var req EpayRequest
	if err := c.ShouldBindJSON(&req); err != nil || (req.PaymentMethod != model.PaymentMethodAlipayManual && req.PaymentMethod != model.PaymentMethodUSDTManual) {
		paymentError(c, common.NewMessage("Invalid parameters"))
		return
	}
	isUSDT := req.PaymentMethod == model.PaymentMethodUSDTManual
	if (isUSDT && !isManualUSDTTopUpEnabled()) || (!isUSDT && !isManualAlipayTopUpEnabled()) {
		paymentError(c, common.NewMessage("This payment method is not configured"))
		return
	}
	if req.Amount < getMinTopup() {
		paymentError(c, common.NewMessage("Top-up amount cannot be less than {{min}}", map[string]any{"min": getMinTopup()}))
		return
	}

	userID := c.GetInt("id")
	if rejectInvalidTopUpQuota(c, userID, req.Amount) {
		return
	}
	group, err := model.GetUserGroup(userID, true)
	if err != nil {
		paymentError(c, common.NewMessage("Failed to get the user group"))
		return
	}
	payMoney := getPayMoney(req.Amount, group)
	if isUSDT {
		payMoney = manualUSDTMoney(payMoney)
	}
	if payMoney <= 0 || (!isUSDT && payMoney < 0.01) {
		paymentError(c, common.NewMessage("Payment amount is too low"))
		return
	}

	prefix := "ALI"
	if isUSDT {
		prefix = "USDT"
	}
	tradeNo := fmt.Sprintf("%s%d%s%d", prefix, userID, common.GetRandomString(6), time.Now().Unix())
	storedAmount := req.Amount
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		storedAmount = decimal.NewFromInt(req.Amount).
			Div(decimal.NewFromFloat(common.QuotaPerUnit)).
			IntPart()
	}
	provider := model.PaymentProviderAlipayManual
	if isUSDT {
		provider = model.PaymentProviderUSDTManual
	}
	topUp := &model.TopUp{
		UserId:          userID,
		Amount:          storedAmount,
		Money:           payMoney,
		TradeNo:         tradeNo,
		PaymentMethod:   req.PaymentMethod,
		PaymentProvider: provider,
		CreateTime:      time.Now().Unix(),
		Status:          common.TopUpStatusPending,
	}
	if err := topUp.Insert(); err != nil {
		logger.LogError(c.Request.Context(), common.LogText("manual payment failed to create top-up order user_id=%d trade_no=%s error=%q", userID, tradeNo, err.Error()))
		paymentError(c, common.NewMessage("Failed to create order"))
		return
	}

	settings := operation_setting.GetPaymentSetting()
	logger.LogInfo(c.Request.Context(), common.LogText("manual payment top-up order created user_id=%d trade_no=%s amount=%d money=%.2f", userID, tradeNo, req.Amount, payMoney))
	if isUSDT {
		c.JSON(http.StatusOK, gin.H{"message": "success", "data": gin.H{
			"trade_no": tradeNo, "money": payMoney, "network": settings.USDTNetwork,
			"address": strings.TrimSpace(settings.USDTAddress), "payment_method": req.PaymentMethod,
		}})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"message": "success",
		"data": gin.H{
			"trade_no":    tradeNo,
			"money":       payMoney,
			"qr_code_url": strings.TrimSpace(settings.AlipayQRCodeURL),
			"payee_name":  strings.TrimSpace(settings.AlipayPayeeName),
		},
	})
}

// Round up to USDT's six decimal places so the displayed quote is sufficient.
func manualUSDTMoney(localMoney float64) float64 {
	rate := operation_setting.GetPaymentSetting().USDTExchangeRate
	if localMoney <= 0 || math.IsNaN(localMoney) || math.IsInf(localMoney, 0) || rate <= 0 || math.IsNaN(rate) || math.IsInf(rate, 0) {
		return 0
	}
	money := decimal.NewFromFloat(localMoney).Div(decimal.NewFromFloat(rate)).RoundCeil(6).InexactFloat64()
	if math.IsInf(money, 0) || math.IsNaN(money) {
		return 0
	}
	return money
}
