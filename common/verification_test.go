package common

import (
	"testing"
	"time"

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

	RegisterVerificationCodeWithKey(key, code, EmailVerificationPurpose)
	assert.False(t, VerifyCodeWithKey(key, "654321", EmailVerificationPurpose))
	assert.False(t, VerifyCodeWithKey(key, code, PasswordResetPurpose))
	require.True(t, VerifyCodeWithKey(key, code, EmailVerificationPurpose))
	assert.False(t, VerifyCodeWithKey(key, code, EmailVerificationPurpose))
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
