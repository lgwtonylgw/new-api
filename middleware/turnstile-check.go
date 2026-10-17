package middleware

import (
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

type turnstileCheckResponse struct {
	Success bool `json:"success"`
}

// VerifyTurnstile is shared by form middleware and login-only OAuth flows.
func VerifyTurnstile(c *gin.Context) bool {
	if !common.TurnstileCheckEnabled {
		return true
	}
	response := c.Query("turnstile")
	if response == "" {
		common.ApiErrorT(c, "Turnstile token is empty")
		c.Abort()
		return false
	}
	values := url.Values{"secret": {common.TurnstileSecretKey}, "response": {response}, "remoteip": {c.ClientIP()}}
	req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodPost, "https://challenges.cloudflare.com/turnstile/v0/siteverify", strings.NewReader(values.Encode()))
	if err != nil {
		common.ApiErrorT(c, "Turnstile verification failed, please refresh and try again!")
		c.Abort()
		return false
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	client := &http.Client{Timeout: 10 * time.Second}
	rawRes, err := client.Do(req)
	if err != nil {
		common.ApiErrorT(c, "Turnstile verification failed, please refresh and try again!")
		c.Abort()
		return false
	}
	defer rawRes.Body.Close()
	var res turnstileCheckResponse
	if rawRes.StatusCode != http.StatusOK || common.DecodeJson(rawRes.Body, &res) != nil || !res.Success {
		common.ApiErrorT(c, "Turnstile verification failed, please refresh and try again!")
		c.Abort()
		return false
	}
	return true
}

func TurnstileCheck() gin.HandlerFunc {
	return func(c *gin.Context) {
		if VerifyTurnstile(c) {
			c.Next()
		}
	}
}
