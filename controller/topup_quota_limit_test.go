package controller

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestTopUpQuotaValidation(t *testing.T) {
	oldQuotaPerUnit := common.QuotaPerUnit
	oldDisplayType := operation_setting.GetGeneralSetting().QuotaDisplayType
	common.QuotaPerUnit = 500000
	t.Cleanup(func() {
		common.QuotaPerUnit = oldQuotaPerUnit
		operation_setting.GetGeneralSetting().QuotaDisplayType = oldDisplayType
	})

	testCases := []struct {
		name        string
		displayType string
		amount      int64
		wantQuota   int
		wantErr     bool
	}{
		{
			name:        "currency amount below limit",
			displayType: operation_setting.QuotaDisplayTypeUSD,
			amount:      4294,
			wantQuota:   2_147_000_000,
		},
		{
			name:        "currency amount above limit",
			displayType: operation_setting.QuotaDisplayTypeUSD,
			amount:      4295,
			wantQuota:   2_147_500_000,
		},
		{
			name:        "token amount preserves settlement truncation",
			displayType: operation_setting.QuotaDisplayTypeTokens,
			amount:      2_147_500_000,
			wantQuota:   2_147_500_000,
		},
		{
			name:        "token amount above legacy int32 range",
			displayType: operation_setting.QuotaDisplayTypeTokens,
			amount:      4_294_500_000,
			wantQuota:   4_294_500_000,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			operation_setting.GetGeneralSetting().QuotaDisplayType = tc.displayType
			quota, err := getTopUpQuota(tc.amount)
			if tc.wantErr {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tc.wantQuota, quota)
		})
	}
}

func TestValidateTopUpQuotaReturnsMaximumAmount(t *testing.T) {
	oldQuotaPerUnit := common.QuotaPerUnit
	oldDisplayType := operation_setting.GetGeneralSetting().QuotaDisplayType
	common.QuotaPerUnit = 500000
	operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeUSD
	t.Cleanup(func() {
		common.QuotaPerUnit = oldQuotaPerUnit
		operation_setting.GetGeneralSetting().QuotaDisplayType = oldDisplayType
	})

	maxAmount := decimal.NewFromInt(common.MaxWalletQuota).
		Div(decimal.NewFromFloat(common.QuotaPerUnit)).
		Floor().IntPart()

	_, err := validateTopUpQuota(maxAmount)
	require.NoError(t, err)
	_, err = validateTopUpQuota(maxAmount + 1)
	require.EqualError(t, err, fmt.Sprintf("Top-up amount cannot exceed %d", maxAmount))
}

func TestRequestAmountRejectsTopUpThatCannotBeSettled(t *testing.T) {
	oldQuotaPerUnit := common.QuotaPerUnit
	oldDisplayType := operation_setting.GetGeneralSetting().QuotaDisplayType
	common.QuotaPerUnit = 500000
	operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeUSD
	t.Cleanup(func() {
		common.QuotaPerUnit = oldQuotaPerUnit
		operation_setting.GetGeneralSetting().QuotaDisplayType = oldDisplayType
	})

	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	maxAmount := decimal.NewFromInt(common.MaxWalletQuota).
		Div(decimal.NewFromFloat(common.QuotaPerUnit)).
		Floor().IntPart()
	ctx.Request = httptest.NewRequest(
		http.MethodPost,
		"/api/user/amount",
		strings.NewReader(fmt.Sprintf(`{"amount":%d}`, maxAmount+1)),
	)
	ctx.Request.Header.Set("Content-Type", "application/json")

	RequestAmount(ctx)

	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.JSONEq(t, fmt.Sprintf(`{"message":"error","data":"Top-up amount cannot exceed %d","message_key":"Top-up amount cannot exceed {{max}}","message_params":{"max":%d}}`, maxAmount, maxAmount), recorder.Body.String())
}

func TestRequestAmountRejectsTopUpThatWouldOverflowWallet(t *testing.T) {
	oldQuotaPerUnit := common.QuotaPerUnit
	oldDisplayType := operation_setting.GetGeneralSetting().QuotaDisplayType
	oldDB := model.DB
	common.QuotaPerUnit = 500000
	operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeUSD

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}))
	model.DB = db
	t.Cleanup(func() {
		common.QuotaPerUnit = oldQuotaPerUnit
		operation_setting.GetGeneralSetting().QuotaDisplayType = oldDisplayType
		model.DB = oldDB
		sqlDB, dbErr := db.DB()
		if dbErr == nil {
			require.NoError(t, sqlDB.Close())
		}
	})

	require.NoError(t, model.DB.Create(&model.User{
		Id:       42,
		Username: "topup_capacity_user",
		Quota:    common.MaxWalletQuota - 100_000,
		Status:   common.UserStatusEnabled,
	}).Error)

	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("id", 42)
	ctx.Request = httptest.NewRequest(
		http.MethodPost,
		"/api/user/amount",
		strings.NewReader(`{"amount":1}`),
	)
	ctx.Request.Header.Set("Content-Type", "application/json")

	RequestAmount(ctx)

	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.JSONEq(t, `{"message":"error","data":"Top-up quota limit exceeded","message_key":"Top-up quota limit exceeded"}`, recorder.Body.String())
}

func TestValidateCreditedQuotaRejectsOverflow(t *testing.T) {
	_, err := validateCreditedQuota(decimal.NewFromInt(int64(common.MaxWalletQuota / 2)))
	require.NoError(t, err)
	_, err = validateCreditedQuota(decimal.Zero)
	require.EqualError(t, err, "Top-up quota must be greater than 0")
	_, err = validateCreditedQuota(decimal.NewFromInt(common.MaxWalletQuota + 1))
	require.EqualError(
		t,
		err,
		"Top-up quota exceeds the range the system can represent",
	)
}

func TestStripeCreditedQuotaIncludesGroupRatio(t *testing.T) {
	oldQuotaPerUnit := common.QuotaPerUnit
	oldTopupGroupRatio := common.TopupGroupRatio2JSONString()
	common.QuotaPerUnit = 500000
	require.NoError(t, common.UpdateTopupGroupRatioByJSONString(`{"vip":2}`))
	t.Cleanup(func() {
		common.QuotaPerUnit = oldQuotaPerUnit
		require.NoError(t, common.UpdateTopupGroupRatioByJSONString(oldTopupGroupRatio))
	})

	_, err := validateCreditedQuota(getStripeCreditedQuota(2147, "vip"))
	require.NoError(t, err)
	_, err = validateCreditedQuota(getStripeCreditedQuota(2148, "vip"))
	require.NoError(t, err)
	_, err = validateCreditedQuota(getStripeCreditedQuota(int64(common.MaxWalletQuota), "vip"))
	require.Error(t, err)

	require.NoError(t, common.UpdateTopupGroupRatioByJSONString(`{"free":0}`))
	assert.True(t, decimal.NewFromInt(500000).Equal(getStripeCreditedQuota(1, "free")))
}

func TestRequestManualTopUpPayCreatesPendingOrderWithoutCreditingBalance(t *testing.T) {
	oldRedis := common.RedisEnabled
	common.RedisEnabled = false
	t.Cleanup(func() { common.RedisEnabled = oldRedis })

	oldUSDT := *operation_setting.GetPaymentSetting()
	t.Cleanup(func() { *operation_setting.GetPaymentSetting() = oldUSDT })

	oldDB := model.DB
	oldQuotaPerUnit := common.QuotaPerUnit
	oldPrice := operation_setting.Price
	oldDisplayType := operation_setting.GetGeneralSetting().QuotaDisplayType
	oldTopupGroupRatio := common.TopupGroupRatio2JSONString()
	paymentSetting := operation_setting.GetPaymentSetting()
	oldEnabled := paymentSetting.AlipayManualEnabled
	oldQRCodeURL := paymentSetting.AlipayQRCodeURL
	oldPayeeName := paymentSetting.AlipayPayeeName
	oldComplianceConfirmed := paymentSetting.ComplianceConfirmed
	oldComplianceVersion := paymentSetting.ComplianceTermsVersion

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, connErr := db.DB()
	require.NoError(t, connErr)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.TopUp{}, &model.Log{}))
	model.DB = db
	oldLogDB, oldMaster := model.LOG_DB, common.IsMasterNode
	common.IsMasterNode = false
	t.Setenv("LOG_SQL_DSN", "")
	require.NoError(t, model.InitLogDB())
	common.IsMasterNode = oldMaster
	t.Cleanup(func() { model.LOG_DB = oldLogDB; common.IsMasterNode = oldMaster })
	common.QuotaPerUnit = 500000
	operation_setting.Price = 7.3
	operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeUSD
	require.NoError(t, common.UpdateTopupGroupRatioByJSONString(`{"default":1}`))
	paymentSetting.AlipayManualEnabled = true
	paymentSetting.AlipayQRCodeURL = "https://static.example.com/alipay.png"
	paymentSetting.AlipayPayeeName = "Test Payee"
	paymentSetting.ComplianceConfirmed = true
	paymentSetting.ComplianceTermsVersion = operation_setting.CurrentComplianceTermsVersion

	t.Cleanup(func() {
		model.DB = oldDB
		common.QuotaPerUnit = oldQuotaPerUnit
		operation_setting.Price = oldPrice
		operation_setting.GetGeneralSetting().QuotaDisplayType = oldDisplayType
		require.NoError(t, common.UpdateTopupGroupRatioByJSONString(oldTopupGroupRatio))
		paymentSetting.AlipayManualEnabled = oldEnabled
		paymentSetting.AlipayQRCodeURL = oldQRCodeURL
		paymentSetting.AlipayPayeeName = oldPayeeName
		paymentSetting.ComplianceConfirmed = oldComplianceConfirmed
		paymentSetting.ComplianceTermsVersion = oldComplianceVersion
		sqlDB, dbErr := db.DB()
		if dbErr == nil {
			require.NoError(t, sqlDB.Close())
		}
	})

	require.NoError(t, db.Create(&model.User{
		Id:       99,
		Username: "manual_alipay_user",
		Group:    "default",
		Quota:    100,
		Status:   common.UserStatusEnabled,
	}).Error)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Set("id", 99)
	ctx.Request = httptest.NewRequest(
		http.MethodPost,
		"/api/user/alipay/manual/pay",
		strings.NewReader(`{"amount":10,"payment_method":"alipay_manual"}`),
	)
	ctx.Request.Header.Set("Content-Type", "application/json")

	RequestManualTopUpPay(ctx)

	require.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), `"message":"success"`)
	assert.Contains(t, recorder.Body.String(), `"qr_code_url":"https://static.example.com/alipay.png"`)
	assert.Contains(t, recorder.Body.String(), `"payee_name":"Test Payee"`)

	var topUp model.TopUp
	require.NoError(t, db.First(&topUp).Error)
	assert.Equal(t, model.PaymentProviderAlipayManual, topUp.PaymentProvider)
	assert.Equal(t, common.TopUpStatusPending, topUp.Status)
	assert.Equal(t, float64(73), topUp.Money)

	var user model.User
	require.NoError(t, db.First(&user, 99).Error)
	assert.Equal(t, 100, user.Quota)

	paymentSetting.USDTManualEnabled = true
	paymentSetting.USDTNetwork = "TRC20"
	paymentSetting.USDTAddress = "TT1FCWG4PKGzDXE17LQBRWASiTFiQVTFwp"
	paymentSetting.USDTExchangeRate = 7.3
	require.True(t, isManualUSDTTopUpEnabled())
	assert.Equal(t, float64(10), manualUSDTMoney(73))
	assert.Equal(t, 1.369864, manualUSDTMoney(10))
	for _, tc := range []struct {
		name, method string
		enabled      bool
		amount       int64
		success      bool
	}{
		{"disabled", "usdt_manual", false, 10, false},
		{"unknown method", "usdt", true, 10, false},
		{"negative amount", "usdt_manual", true, -1, false},
		{"valid USDT order", "usdt_manual", true, 10, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			paymentSetting.USDTManualEnabled = tc.enabled
			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			ctx.Set("id", 99)
			body, marshalErr := common.Marshal(map[string]any{"amount": tc.amount, "payment_method": tc.method})
			require.NoError(t, marshalErr)
			ctx.Request = httptest.NewRequest(http.MethodPost, "/api/user/usdt/manual/pay", strings.NewReader(string(body)))
			ctx.Request.Header.Set("Content-Type", "application/json")
			RequestManualTopUpPay(ctx)
			if !tc.success {
				assert.NotContains(t, recorder.Body.String(), `"message":"success"`)
				return
			}
			assert.Contains(t, recorder.Body.String(), `"money":10`)
			assert.Contains(t, recorder.Body.String(), `"network":"TRC20"`)
			assert.Contains(t, recorder.Body.String(), `"address":"TT1FCWG4PKGzDXE17LQBRWASiTFiQVTFwp"`)
			var order model.TopUp
			require.NoError(t, db.Where("payment_provider = ?", model.PaymentProviderUSDTManual).First(&order).Error)
			assert.Equal(t, float64(10), order.Money)
			assert.Equal(t, int64(10), order.Amount)
			assert.Equal(t, common.TopUpStatusPending, order.Status)
			require.NoError(t, db.First(&user, 99).Error)
			assert.Equal(t, 100, user.Quota)
			// Completing a USDT order credits its stored quota once, independent
			// of later exchange-rate changes and repeated admin submissions.
			paymentSetting.USDTExchangeRate = 1
			require.NoError(t, model.ManualCompleteTopUp(order.TradeNo, "127.0.0.1"))
			require.NoError(t, model.ManualCompleteTopUp(order.TradeNo, "127.0.0.1"))
			require.NoError(t, db.First(&user, 99).Error)
			assert.Equal(t, 5_000_100, user.Quota)
			paymentSetting.USDTExchangeRate = 7.3
		})
	}
	paymentSetting.USDTExchangeRate = 0
	assert.False(t, isManualUSDTTopUpEnabled())
	paymentSetting.USDTExchangeRate = 7.3
	paymentSetting.USDTNetwork = "ERC20"
	assert.False(t, isManualUSDTTopUpEnabled(), "TRON address must not be offered on Ethereum")
}
