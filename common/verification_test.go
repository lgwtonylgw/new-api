package common

import (
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/go-redis/redis/v8"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestVerificationCodeIsSingleUseAndPurposeBound(t *testing.T) {
	const (
		key  = "person@example.com"
		code = "123456"
	)
	t.Cleanup(func() {
		DeleteKey(key, EmailVerificationPurpose)
		DeleteKey(key, PasswordResetPurpose)
	})

	require.NoError(t, RegisterVerificationCodeWithKey(key, code, EmailVerificationPurpose))
	assert.False(t, VerifyCodeWithKey(key, "654321", EmailVerificationPurpose))
	assert.False(t, VerifyCodeWithKey(key, code, PasswordResetPurpose))
	require.True(t, VerifyCodeWithKey(" PERSON@example.com ", code, EmailVerificationPurpose))
	assert.False(t, VerifyCodeWithKey(key, code, EmailVerificationPurpose))
}

func TestVerificationCodeUsesSharedRedisAndIsSingleUse(t *testing.T) {
	server, err := miniredis.Run()
	require.NoError(t, err)
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	previousEnabled, previousClient, previousSecret := RedisEnabled, RDB, CryptoSecret
	RedisEnabled, RDB, CryptoSecret = true, client, "verification-test-secret"
	t.Cleanup(func() {
		RedisEnabled, RDB, CryptoSecret = previousEnabled, previousClient, previousSecret
		_ = client.Close()
		server.Close()
	})

	require.NoError(t, RegisterVerificationCodeWithKey("person@example.com", "123456", EmailVerificationPurpose))
	assert.False(t, VerifyCodeWithKey("person@example.com", "654321", EmailVerificationPurpose))
	require.True(t, VerifyCodeWithKey("person@example.com", "123456", EmailVerificationPurpose))
	assert.False(t, VerifyCodeWithKey("person@example.com", "123456", EmailVerificationPurpose))
}

func TestVerificationCodeExpiresAndIsRemoved(t *testing.T) {
	const (
		key  = "expired@example.com"
		code = "123456"
	)
	mapKey := EmailVerificationPurpose + key
	t.Cleanup(func() { DeleteKey(key, EmailVerificationPurpose) })

	verificationMutex.Lock()
	verificationMap[mapKey] = verificationValue{
		code: code,
		time: time.Now().Add(-time.Duration(VerificationValidMinutes) * time.Minute),
	}
	verificationMutex.Unlock()

	assert.False(t, VerifyCodeWithKey(key, code, EmailVerificationPurpose))
	verificationMutex.Lock()
	_, exists := verificationMap[mapKey]
	verificationMutex.Unlock()
	assert.False(t, exists)
}
