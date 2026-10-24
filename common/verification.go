package common

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"fmt"
	"math/big"
	"strings"
	"sync"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/google/uuid"
)

type verificationValue struct {
	code string
	time time.Time
}

const (
	EmailVerificationPurpose = "v"
	PasswordResetPurpose     = "r"
	verificationRedisPrefix  = "verification:code:"
)

var verificationMutex sync.Mutex
var verificationMap map[string]verificationValue
var verificationMapMaxSize = 10
var VerificationValidMinutes = 10

var consumeVerificationCodeScript = redis.NewScript(`
if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('DEL', KEYS[1])
  return 1
end
return 0
`)

func normalizedVerificationKey(key string) string {
	return strings.ToLower(strings.TrimSpace(key))
}

func verificationRedisKey(key string, purpose string) string {
	digest := sha256.Sum256([]byte(purpose + "\x00" + normalizedVerificationKey(key)))
	return fmt.Sprintf("%s%x", verificationRedisPrefix, digest[:])
}

func verificationCodeDigest(key string, code string, purpose string) string {
	digest := hmac.New(sha256.New, []byte(CryptoSecret))
	_, _ = digest.Write([]byte(purpose + "\x00" + normalizedVerificationKey(key) + "\x00" + code))
	return fmt.Sprintf("%x", digest.Sum(nil))
}

func GenerateVerificationCode(length int) string {
	code := uuid.New().String()
	code = strings.Replace(code, "-", "", -1)
	if length == 0 {
		return code
	}
	return code[:length]
}

// GenerateEmailVerificationCode returns six digits, including any leading zeros.
func GenerateEmailVerificationCode() (string, error) {
	number, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", number.Int64()), nil
}

func RegisterVerificationCodeWithKey(key string, code string, purpose string) error {
	if RedisEnabled && RDB != nil {
		return RDB.Set(
			context.Background(),
			verificationRedisKey(key, purpose),
			verificationCodeDigest(key, code, purpose),
			time.Duration(VerificationValidMinutes)*time.Minute,
		).Err()
	}

	verificationMutex.Lock()
	defer verificationMutex.Unlock()
	verificationMap[purpose+normalizedVerificationKey(key)] = verificationValue{
		code: code,
		time: time.Now(),
	}
	if len(verificationMap) > verificationMapMaxSize {
		removeExpiredPairs()
	}
	return nil
}

func VerifyCodeWithKey(key string, code string, purpose string) bool {
	if RedisEnabled && RDB != nil {
		consumed, err := consumeVerificationCodeScript.Run(
			context.Background(),
			RDB,
			[]string{verificationRedisKey(key, purpose)},
			verificationCodeDigest(key, code, purpose),
		).Int()
		if err != nil {
			SysError(LogText("failed to verify code in Redis: %s", err.Error()))
			return false
		}
		return consumed == 1
	}

	verificationMutex.Lock()
	defer verificationMutex.Unlock()
	mapKey := purpose + normalizedVerificationKey(key)
	value, okay := verificationMap[mapKey]
	now := time.Now()
	if !okay || int(now.Sub(value.time).Seconds()) >= VerificationValidMinutes*60 {
		if okay {
			delete(verificationMap, mapKey)
		}
		return false
	}
	if subtle.ConstantTimeCompare([]byte(code), []byte(value.code)) != 1 {
		return false
	}
	delete(verificationMap, mapKey)
	return true
}

func DeleteKey(key string, purpose string) {
	if RedisEnabled && RDB != nil {
		if err := RDB.Del(context.Background(), verificationRedisKey(key, purpose)).Err(); err != nil {
			SysError(LogText("failed to delete verification code from Redis: %s", err.Error()))
		}
		return
	}

	verificationMutex.Lock()
	defer verificationMutex.Unlock()
	delete(verificationMap, purpose+normalizedVerificationKey(key))
}

// no lock inside, so the caller must lock the verificationMap before calling!
func removeExpiredPairs() {
	now := time.Now()
	for key := range verificationMap {
		if int(now.Sub(verificationMap[key].time).Seconds()) >= VerificationValidMinutes*60 {
			delete(verificationMap, key)
		}
	}
}

func init() {
	verificationMutex.Lock()
	defer verificationMutex.Unlock()
	verificationMap = make(map[string]verificationValue)
}
