package service

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/performance_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"
)

const (
	systemMetricAlertConsecutiveSamples = 3
	systemMetricRecoverySamples         = 2
	telegramAlertTimeout                = 10 * time.Second
	telegramAPIBaseURL                  = "https://api.telegram.org"
)

type systemMetricAlertState struct {
	BreachCount   int
	RecoveryCount int
	Alerting      bool
}

type telegramMessagePayload struct {
	ChatID string `json:"chat_id"`
	Text   string `json:"text"`
}

type telegramAPIResponse struct {
	OK          bool   `json:"ok"`
	ErrorCode   int    `json:"error_code"`
	Description string `json:"description"`
}

var systemMetricAlertStates = struct {
	sync.Mutex
	ByNode map[string]*systemMetricAlertState
}{ByNode: make(map[string]*systemMetricAlertState)}

var sendSystemMetricTelegramText = sendTelegramText

func evaluateSystemMetricAlert(nodeName string, snapshot common.SystemResourceSnapshot) error {
	setting := performance_setting.GetPerformanceSettingSnapshot()
	botToken := strings.TrimSpace(setting.MonitorTelegramBotToken)
	chatID := strings.TrimSpace(setting.MonitorTelegramChatID)
	if !setting.MonitorAlertEnabled || botToken == "" || chatID == "" {
		resetSystemMetricAlertState(nodeName)
		return nil
	}

	breached := snapshot.Status.CPUUsage >= float64(setting.MonitorCPUThreshold) ||
		snapshot.Status.MemoryUsage >= float64(setting.MonitorMemoryThreshold) ||
		snapshot.Status.DiskUsage >= float64(setting.MonitorDiskThreshold)

	systemMetricAlertStates.Lock()
	state := systemMetricAlertStates.ByNode[nodeName]
	if state == nil {
		state = &systemMetricAlertState{}
		systemMetricAlertStates.ByNode[nodeName] = state
	}

	if breached {
		state.RecoveryCount = 0
		if state.Alerting {
			systemMetricAlertStates.Unlock()
			return nil
		}
		state.BreachCount++
		if state.BreachCount < systemMetricAlertConsecutiveSamples {
			systemMetricAlertStates.Unlock()
			return nil
		}
		systemMetricAlertStates.Unlock()

		message := formatSystemMetricAlert(nodeName, snapshot, setting.MonitorCPUThreshold, setting.MonitorMemoryThreshold, setting.MonitorDiskThreshold)
		if err := sendSystemMetricTelegramText(botToken, chatID, message); err != nil {
			return err
		}

		systemMetricAlertStates.Lock()
		state.Alerting = true
		state.BreachCount = 0
		systemMetricAlertStates.Unlock()
		return nil
	}

	state.BreachCount = 0
	if !state.Alerting {
		state.RecoveryCount = 0
		systemMetricAlertStates.Unlock()
		return nil
	}
	state.RecoveryCount++
	if state.RecoveryCount < systemMetricRecoverySamples {
		systemMetricAlertStates.Unlock()
		return nil
	}
	systemMetricAlertStates.Unlock()

	message := fmt.Sprintf(
		"Token AI Gate 资源恢复\n节点：%s\nCPU：%.1f%%\n内存：%.1f%%\n存储：%.1f%%\n时间：%s",
		nodeName,
		snapshot.Status.CPUUsage,
		snapshot.Status.MemoryUsage,
		snapshot.Status.DiskUsage,
		time.Now().Format("2006-01-02 15:04:05 MST"),
	)
	if err := sendSystemMetricTelegramText(botToken, chatID, message); err != nil {
		return err
	}

	systemMetricAlertStates.Lock()
	state.Alerting = false
	state.RecoveryCount = 0
	systemMetricAlertStates.Unlock()
	return nil
}

func resetSystemMetricAlertState(nodeName string) {
	systemMetricAlertStates.Lock()
	delete(systemMetricAlertStates.ByNode, nodeName)
	systemMetricAlertStates.Unlock()
}

func formatSystemMetricAlert(nodeName string, snapshot common.SystemResourceSnapshot, cpuThreshold int, memoryThreshold int, diskThreshold int) string {
	return fmt.Sprintf(
		"Token AI Gate 资源告警\n节点：%s\nCPU：%.1f%%（阈值 %d%%）\n内存：%.1f%%（阈值 %d%%）\n存储：%.1f%%（阈值 %d%%）\n连续 %d 分钟达到或超过阈值\n时间：%s",
		nodeName,
		snapshot.Status.CPUUsage,
		cpuThreshold,
		snapshot.Status.MemoryUsage,
		memoryThreshold,
		snapshot.Status.DiskUsage,
		diskThreshold,
		systemMetricAlertConsecutiveSamples,
		time.Now().Format("2006-01-02 15:04:05 MST"),
	)
}

func ValidateTelegramBotToken(rawToken string) error {
	botID, secret, ok := strings.Cut(strings.TrimSpace(rawToken), ":")
	if !ok || botID == "" || len(secret) < 20 {
		return common.NewMessage("Telegram bot token is invalid")
	}
	parsedBotID, err := strconv.ParseUint(botID, 10, 64)
	if err != nil || parsedBotID == 0 {
		return common.NewMessage("Telegram bot token is invalid")
	}
	for _, char := range secret {
		if (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') ||
			(char >= '0' && char <= '9') || char == '_' || char == '-' {
			continue
		}
		return common.NewMessage("Telegram bot token is invalid")
	}
	return nil
}

func ValidateTelegramChatID(rawChatID string) error {
	chatID := strings.TrimSpace(rawChatID)
	if strings.HasPrefix(chatID, "@") {
		username := strings.TrimPrefix(chatID, "@")
		if len(username) < 5 || len(username) > 32 {
			return common.NewMessage("Telegram chat ID is invalid")
		}
		for _, char := range username {
			if (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') ||
				(char >= '0' && char <= '9') || char == '_' {
				continue
			}
			return common.NewMessage("Telegram chat ID is invalid")
		}
		return nil
	}
	if chatID == "" {
		return common.NewMessage("Enter a Telegram chat ID first")
	}
	parsedChatID, err := strconv.ParseInt(chatID, 10, 64)
	if err != nil || parsedChatID == 0 {
		return common.NewMessage("Telegram chat ID is invalid")
	}
	return nil
}

func ValidateSystemMetricAlertSettings(enabled bool, botToken string, chatID string) error {
	botToken = strings.TrimSpace(botToken)
	chatID = strings.TrimSpace(chatID)
	if enabled && botToken == "" {
		return common.NewMessage("Enter a Telegram bot token first")
	}
	if enabled && chatID == "" {
		return common.NewMessage("Enter a Telegram chat ID first")
	}
	if botToken != "" {
		if err := ValidateTelegramBotToken(botToken); err != nil {
			return err
		}
	}
	if chatID != "" {
		if err := ValidateTelegramChatID(chatID); err != nil {
			return err
		}
	}
	return nil
}

func SendSystemMetricTestAlert(botToken string, chatID string) error {
	identity := common.GetNodeIdentity()
	nodeName := strings.TrimSpace(identity.Name)
	if nodeName == "" {
		nodeName = "current-node"
	}
	message := fmt.Sprintf(
		"Token AI Gate 测试告警\n节点：%s\n每分钟资源监控通知连接正常。\n时间：%s",
		nodeName,
		time.Now().Format("2006-01-02 15:04:05 MST"),
	)
	return sendTelegramText(botToken, chatID, message)
}

func sendTelegramText(botToken string, chatID string, message string) (sendErr error) {
	botToken = strings.TrimSpace(botToken)
	defer func() {
		if sendErr != nil && botToken != "" && strings.Contains(sendErr.Error(), botToken) {
			sendErr = fmt.Errorf("%s", strings.ReplaceAll(sendErr.Error(), botToken, "[redacted]"))
		}
	}()
	if err := ValidateSystemMetricAlertSettings(true, botToken, chatID); err != nil {
		return err
	}

	payload := telegramMessagePayload{
		ChatID: strings.TrimSpace(chatID),
		Text:   message,
	}
	body, err := common.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal Telegram alert: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), telegramAlertTimeout)
	defer cancel()
	endpoint := telegramAPIBaseURL + "/bot" + strings.TrimSpace(botToken) + "/sendMessage"

	var resp *http.Response
	if system_setting.EnableWorker() {
		resp, err = DoWorkerRequestWithContext(ctx, &WorkerRequest{
			URL:    endpoint,
			Key:    system_setting.WorkerValidKey,
			Method: http.MethodPost,
			Headers: map[string]string{
				"Content-Type": "application/json",
			},
			Body: body,
		})
	} else {
		req, requestErr := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
		if requestErr != nil {
			return fmt.Errorf("create Telegram alert request: %w", requestErr)
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err = GetHttpClient().Do(req)
	}
	if err != nil {
		return fmt.Errorf("send Telegram alert: %w", err)
	}
	defer resp.Body.Close()
	responseBody, readErr := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if readErr != nil {
		return fmt.Errorf("read Telegram alert response: %w", readErr)
	}

	var result telegramAPIResponse
	if err := common.Unmarshal(responseBody, &result); err != nil {
		if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
			return fmt.Errorf("Telegram alert returned HTTP %d", resp.StatusCode)
		}
		return fmt.Errorf("decode Telegram alert response: %w", err)
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices || !result.OK {
		description := strings.TrimSpace(result.Description)
		return fmt.Errorf("Telegram alert rejected: error_code=%d description=%s", result.ErrorCode, description)
	}
	return nil
}
