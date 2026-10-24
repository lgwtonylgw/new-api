package common

import (
	"bytes"
	"crypto/rand"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/go-redis/redis/v8"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGenerateEmailVerificationCode(t *testing.T) {
	for _, tt := range []struct {
		name  string
		bytes []byte
		want  string
	}{
		{name: "preserves leading zeros", bytes: []byte{0, 0, 1}, want: "000001"},
		{name: "all digits can be zero", bytes: []byte{0, 0, 0}, want: "000000"},
		{name: "upper bound is six digits", bytes: []byte{15, 66, 63}, want: "999999"},
		{name: "random source failure returns no code"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			previousReader := rand.Reader
			rand.Reader = bytes.NewReader(tt.bytes)
			t.Cleanup(func() { rand.Reader = previousReader })
			code, err := GenerateEmailVerificationCode()
			if tt.bytes == nil {
				require.Error(t, err)
				assert.Empty(t, code)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.want, code)
		})
	}
}

func TestVerificationCodeIsSingleUseAndPurposeBound(t *testing.T) {
	const key = "person@example.com"
	code, err := GenerateEmailVerificationCode()
	require.NoError(t, err)
	require.Regexp(t, `^[0-9]{6}$`, code)
	t.Cleanup(func() {
		DeleteKey(key, EmailVerificationPurpose)
		DeleteKey(key, PasswordResetPurpose)
	})

	require.NoError(t, RegisterVerificationCodeWithKey(key, code, EmailVerificationPurpose))
	assert.False(t, VerifyCodeWithKey(key, "invalid", EmailVerificationPurpose))
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
