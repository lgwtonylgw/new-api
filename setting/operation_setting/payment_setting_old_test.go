package operation_setting

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestUpdatePayMethodsRemovesRetiredManualAlipay(t *testing.T) {
	original := PayMethods
	t.Cleanup(func() { PayMethods = original })

	require.NoError(t, UpdatePayMethodsByJsonString(`[{"name":"支付宝收款码","type":"alipay_manual"},{"name":"支付宝","type":"alipay"}]`))
	require.Len(t, PayMethods, 1)
	require.Equal(t, "alipay", PayMethods[0]["type"])
	require.False(t, ContainsPayMethod("alipay_manual"))
	require.JSONEq(t, `[{"name":"支付宝","type":"alipay"}]`, PayMethods2JsonString())
}
