package middleware

import (
	"crypto/sha256"
	"fmt"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"

	"github.com/gin-gonic/gin"
)

const (
	EmailVerificationRateLimitMark = "EV"
	EmailVerificationMaxRequests   = 2  // 30秒内最多2次
	EmailVerificationDuration      = 30 // 30秒时间窗口
	EmailAddressMaxRequests        = 5
	EmailAddressDuration           = 10 * 60
)

type emailVerificationRateLimit struct {
	key      string
	maximum  int
	duration int64
}

func emailVerificationAddressRateLimitKey(email string) string {
	normalizedEmail := strings.ToLower(strings.TrimSpace(email))
	if normalizedEmail == "" {
		return ""
	}
	hash := sha256.Sum256([]byte(normalizedEmail))
	return fmt.Sprintf("%s:email:%s:%x", redisRateLimitNamespace, EmailVerificationRateLimitMark, hash)
}

func writeEmailVerificationRateLimited(c *gin.Context, waitSeconds int64) {
	if waitSeconds <= 0 {
		waitSeconds = EmailVerificationDuration
	}
	c.Header("Retry-After", fmt.Sprintf("%d", waitSeconds))
	common.ApiErrorStatus(c, http.StatusTooManyRequests, common.NewMessage("Please wait {{seconds}} seconds before requesting another verification code.", map[string]any{"seconds": waitSeconds}))
	c.Abort()
}

func redisEmailVerificationRateLimiter(c *gin.Context) {
	limits := []emailVerificationRateLimit{
		{
			key:      redisIPRateLimitKey(EmailVerificationRateLimitMark, c.ClientIP()),
			maximum:  EmailVerificationMaxRequests,
			duration: EmailVerificationDuration,
		},
	}
	if addressKey := emailVerificationAddressRateLimitKey(c.Query("email")); addressKey != "" {
		limits = append(limits, emailVerificationRateLimit{
			key:      addressKey,
			maximum:  EmailAddressMaxRequests,
			duration: EmailAddressDuration,
		})
	}

	for _, limit := range limits {
		allowed, _, ttlSeconds, err := redisFixedWindowTake(
			c.Request.Context(),
			limit.key,
			limit.maximum,
			limit.duration,
		)
		if err != nil {
			memoryEmailVerificationRateLimiter(c)
			return
		}
		if !allowed {
			writeEmailVerificationRateLimited(c, ttlSeconds)
			return
		}
	}

	c.Next()
}

func memoryEmailVerificationRateLimiter(c *gin.Context) {
	if !inMemoryRateLimiter.Request(EmailVerificationRateLimitMark+":"+c.ClientIP(), EmailVerificationMaxRequests, EmailVerificationDuration) {
		writeEmailVerificationRateLimited(c, EmailVerificationDuration)
		return
	}
	if addressKey := emailVerificationAddressRateLimitKey(c.Query("email")); addressKey != "" && !inMemoryRateLimiter.Request(addressKey, EmailAddressMaxRequests, EmailAddressDuration) {
		writeEmailVerificationRateLimited(c, EmailAddressDuration)
		return
	}

	c.Next()
}

func EmailVerificationRateLimit() gin.HandlerFunc {
	// Keep the fallback ready before requests arrive so a concurrent Redis
	// outage cannot race the in-memory limiter's first initialization.
	inMemoryRateLimiter.Init(common.RateLimitKeyExpirationDuration)
	return func(c *gin.Context) {
		if common.RedisEnabled {
			redisEmailVerificationRateLimiter(c)
		} else {
			memoryEmailVerificationRateLimiter(c)
		}
	}
}
