package controller

import (
	"fmt"
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

func RequestManualAlipayPay(c *gin.Context) {
	if !isManualAlipayTopUpEnabled() {
		paymentError(c, common.NewMessage("Manual Alipay payment is not configured"))
		return
	}

	var req EpayRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.PaymentMethod != model.PaymentMethodAlipayManual {
		paymentError(c, common.NewMessage("Invalid parameters"))
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
	if payMoney < 0.01 {
		paymentError(c, common.NewMessage("Payment amount is too low"))
		return
	}

	tradeNo := fmt.Sprintf("ALI%d%s%d", userID, common.GetRandomString(6), time.Now().Unix())
	storedAmount := req.Amount
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		storedAmount = decimal.NewFromInt(req.Amount).
			Div(decimal.NewFromFloat(common.QuotaPerUnit)).
			IntPart()
	}
	topUp := &model.TopUp{
		UserId:          userID,
		Amount:          storedAmount,
		Money:           payMoney,
		TradeNo:         tradeNo,
		PaymentMethod:   model.PaymentMethodAlipayManual,
		PaymentProvider: model.PaymentProviderAlipayManual,
		CreateTime:      time.Now().Unix(),
		Status:          common.TopUpStatusPending,
	}
	if err := topUp.Insert(); err != nil {
		logger.LogError(c.Request.Context(), common.LogText("manual Alipay failed to create top-up order user_id=%d trade_no=%s error=%q", userID, tradeNo, err.Error()))
		paymentError(c, common.NewMessage("Failed to create order"))
		return
	}

	settings := operation_setting.GetPaymentSetting()
	logger.LogInfo(c.Request.Context(), common.LogText("manual Alipay top-up order created user_id=%d trade_no=%s amount=%d money=%.2f", userID, tradeNo, req.Amount, payMoney))
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
