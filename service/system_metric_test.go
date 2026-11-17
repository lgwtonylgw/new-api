package service

import (
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/performance_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/stretchr/testify/require"
)

type telegramAlertTestTransport func(*http.Request) (*http.Response, error)

func (transport telegramAlertTestTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	return transport(request)
}

func TestTelegramAlertRequestAndFailureHandling(t *testing.T) {
	const token = "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ_123456789"
	originalClient := httpClient
	originalWorkerURL := system_setting.WorkerUrl
	system_setting.WorkerUrl = ""
	t.Cleanup(func() {
		httpClient = originalClient
		system_setting.WorkerUrl = originalWorkerURL
	})
	for _, test := range []struct {
		name           string
		response       string
		transportError bool
		wantError      bool
	}{
		{name: "success", response: `{"ok":true}`},
		{name: "API rejection", response: `{"ok":false,"error_code":400,"description":"chat not found"}`, wantError: true},
		{name: "invalid response", response: `not json`, wantError: true},
		{name: "transport secret redaction", transportError: true, wantError: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			httpClient = &http.Client{Transport: telegramAlertTestTransport(func(request *http.Request) (*http.Response, error) {
				require.Equal(t, "api.telegram.org", request.URL.Host)
				require.Equal(t, "/bot"+token+"/sendMessage", request.URL.Path)
				require.Equal(t, http.MethodPost, request.Method)
				deadline, ok := request.Context().Deadline()
				require.True(t, ok)
				require.LessOrEqual(t, time.Until(deadline), telegramAlertTimeout)
				var payload telegramMessagePayload
				require.NoError(t, common.DecodeJson(request.Body, &payload))
				require.Equal(t, "-1001234567890", payload.ChatID)
				require.Equal(t, "test alert", payload.Text)
				if test.transportError {
					return nil, fmt.Errorf("failed endpoint %s", request.URL)
				}
				return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(test.response)), Header: make(http.Header)}, nil
			})}
			err := sendTelegramText(token, "-1001234567890", "test alert")
			if test.wantError {
				require.Error(t, err)
				require.NotContains(t, err.Error(), token)
			} else {
				require.NoError(t, err)
			}
		})
	}
}

func TestInvalidSystemMetricSnapshotDoesNotWriteHistory(t *testing.T) {
	// No DB fixture is needed: invalid snapshots must return before any write.
	require.NoError(t, recordSystemMetricSample("invalid-node", 120, common.SystemResourceSnapshot{}))
}

func TestAggregateSystemMetrics(t *testing.T) {
	metrics := []model.SystemMetric{
		{SampledAt: 120, CPUUsage: 10, MemoryUsage: 20, StorageUsage: 30},
		{SampledAt: 180, CPUUsage: 30, MemoryUsage: 40, StorageUsage: 50},
		{SampledAt: 720, CPUUsage: 60, MemoryUsage: 70, StorageUsage: 80},
	}

	points := aggregateSystemMetrics(metrics, 600)
	require.Len(t, points, 2)
	require.Equal(t, int64(0), points[0].SampledAt)
	require.Equal(t, 20.0, points[0].CPUUsage)
	require.Equal(t, 30.0, points[0].MemoryUsage)
	require.Equal(t, 40.0, points[0].StorageUsage)
	require.Equal(t, int64(600), points[1].SampledAt)
}

func TestValidateTelegramAlertCredentials(t *testing.T) {
	const token = "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ_123456789"
	require.NoError(t, ValidateTelegramBotToken(token))
	require.Error(t, ValidateTelegramBotToken("not-a-token"))
	require.NoError(t, ValidateTelegramChatID("-1001234567890"))
	require.NoError(t, ValidateTelegramChatID("@token_gate_alerts"))
	require.Error(t, ValidateTelegramChatID("invalid chat"))
}

func TestValidateSystemMetricAlertSettings(t *testing.T) {
	const token = "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ_123456789"
	require.NoError(t, ValidateSystemMetricAlertSettings(false, "", ""))
	require.Error(t, ValidateSystemMetricAlertSettings(true, "", "-1001234567890"))
	require.Error(t, ValidateSystemMetricAlertSettings(true, token, ""))
	require.NoError(t, ValidateSystemMetricAlertSettings(true, token, "-1001234567890"))
	require.Error(t, ValidateSystemMetricAlertSettings(true, "invalid", "-1001234567890"))
}

func TestSystemMetricAlertDebounceAndRecovery(t *testing.T) {
	originalSetting := performance_setting.GetPerformanceSettingSnapshot()
	originalSender := sendSystemMetricTelegramText
	t.Cleanup(func() {
		require.NoError(t, performance_setting.UpdateFromMap(map[string]string{
			"monitor_alert_enabled":      strconv.FormatBool(originalSetting.MonitorAlertEnabled),
			"monitor_telegram_bot_token": originalSetting.MonitorTelegramBotToken,
			"monitor_telegram_chat_id":   originalSetting.MonitorTelegramChatID,
			"monitor_cpu_threshold":      strconv.Itoa(originalSetting.MonitorCPUThreshold),
			"monitor_memory_threshold":   strconv.Itoa(originalSetting.MonitorMemoryThreshold),
			"monitor_disk_threshold":     strconv.Itoa(originalSetting.MonitorDiskThreshold),
		}))
		sendSystemMetricTelegramText = originalSender
		resetSystemMetricAlertState("node-alert-test")
	})

	require.NoError(t, performance_setting.UpdateFromMap(map[string]string{
		"monitor_alert_enabled":      "true",
		"monitor_telegram_bot_token": "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ_123456789",
		"monitor_telegram_chat_id":   "-1001234567890",
		"monitor_cpu_threshold":      "90",
		"monitor_memory_threshold":   "90",
		"monitor_disk_threshold":     "95",
	}))

	messages := make([]string, 0, 2)
	sendSystemMetricTelegramText = func(_ string, _ string, message string) error {
		messages = append(messages, message)
		return nil
	}

	breached := common.SystemResourceSnapshot{Status: common.SystemStatus{CPUUsage: 91, MemoryUsage: 50, DiskUsage: 50}}
	for range systemMetricAlertConsecutiveSamples - 1 {
		require.NoError(t, evaluateSystemMetricAlert("node-alert-test", breached))
	}
	require.Empty(t, messages)
	require.NoError(t, evaluateSystemMetricAlert("node-alert-test", breached))
	require.Len(t, messages, 1)
	require.Contains(t, messages[0], "Token AI Gate")

	require.NoError(t, evaluateSystemMetricAlert("node-alert-test", breached))
	require.Len(t, messages, 1)

	recovered := common.SystemResourceSnapshot{Status: common.SystemStatus{CPUUsage: 20, MemoryUsage: 30, DiskUsage: 40}}
	require.NoError(t, evaluateSystemMetricAlert("node-alert-test", recovered))
	require.Len(t, messages, 1)
	require.NoError(t, evaluateSystemMetricAlert("node-alert-test", recovered))
	require.Len(t, messages, 2)
	require.Contains(t, messages[1], "Token AI Gate")
}
