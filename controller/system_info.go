package controller

import (
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

func ListSystemInstances(c *gin.Context) {
	instances, err := model.ListSystemInstances()
	if err != nil {
		common.ApiError(c, err)
		return
	}

	now := common.GetTimestamp()
	responses := make([]model.SystemInstanceResponse, 0, len(instances))
	for _, instance := range instances {
		responses = append(responses, instance.ToResponse(now))
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    responses,
	})
}

func DeleteStaleSystemInstances(c *gin.Context) {
	deletedCount, err := model.DeleteStaleSystemInstances(common.GetTimestamp())
	if err != nil {
		common.ApiError(c, err)
		return
	}

	common.ApiSuccess(c, gin.H{
		"deleted_count": deletedCount,
	})
}

func DeleteStaleSystemInstance(c *gin.Context) {
	nodeName := c.Param("node_name")
	if strings.TrimSpace(nodeName) == "" {
		common.ApiErrorMsg(c, "node name is required")
		return
	}

	deleted, err := model.DeleteStaleSystemInstance(nodeName, common.GetTimestamp())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !deleted {
		common.ApiErrorMsg(c, "instance is not stale or no longer exists")
		return
	}

	common.ApiSuccess(c, gin.H{
		"deleted_count": 1,
	})
}

func GetSystemMetricHistory(c *gin.Context) {
	history, err := service.GetSystemMetricHistory(c.Query("node_name"), c.DefaultQuery("range", "24h"))
	if err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, err)
		return
	}
	common.ApiSuccess(c, history)
}

type telegramAlertTestRequest struct {
	BotToken string `json:"bot_token"`
	ChatID   string `json:"chat_id"`
}

func TestSystemMetricTelegramAlert(c *gin.Context) {
	var request telegramAlertTestRequest
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid parameters"))
		return
	}
	request.BotToken = strings.TrimSpace(request.BotToken)
	request.ChatID = strings.TrimSpace(request.ChatID)
	if err := service.ValidateSystemMetricAlertSettings(true, request.BotToken, request.ChatID); err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, err)
		return
	}
	if err := service.SendSystemMetricTestAlert(request.BotToken, request.ChatID); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"sent": true})
}
