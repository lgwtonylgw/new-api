/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"fmt"
	"math/big"
	"strconv"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/go-redis/redis/v8"
)

const (
	wechatVerificationCodeTTL = 3 * time.Minute
	wechatVerificationMaxSize = 10000
	wechatVerificationPrefix  = "wechat:login:code:"
	wechatOpenIDPrefix        = "wechat:login:openid:"
)

var ErrWeChatVerificationCodeInvalid = errors.New("verification code is incorrect or has expired")

type wechatVerificationEntry struct {
	openID    string
	expiresAt time.Time
}

var wechatVerificationMemory = struct {
	sync.Mutex
	byCode   map[string]wechatVerificationEntry
	byOpenID map[string]string
}{
	byCode:   make(map[string]wechatVerificationEntry),
	byOpenID: make(map[string]string),
}

var issueWeChatCodeScript = redis.NewScript(`
local existing = redis.call('GET', KEYS[1])
if existing and redis.call('EXISTS', ARGV[1] .. existing) == 1 then
  return existing
end
if redis.call('EXISTS', KEYS[2]) == 1 then
  return ''
end
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])
redis.call('SET', KEYS[1], ARGV[4], 'EX', ARGV[3])
return ARGV[4]
`)

var consumeWeChatCodeScript = redis.NewScript(`
local openid = redis.call('GET', KEYS[1])
if not openid then
  return ''
end
redis.call('DEL', KEYS[1])
return openid
`)

var deleteMatchingWeChatOpenIDScript = redis.NewScript(`
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`)

func wechatOpenIDKey(openID string) string {
	sum := sha256.Sum256([]byte(openID))
	return fmt.Sprintf("%s%x", wechatOpenIDPrefix, sum[:])
}

func generateWeChatVerificationCode() (string, error) {
	number, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", number.Int64()), nil
}

// IssueWeChatVerificationCode returns the current unexpired code for an OpenID,
// or creates a cryptographically random code that expires after three minutes.
func IssueWeChatVerificationCode(ctx context.Context, openID string) (string, error) {
	if openID == "" {
		return "", ErrWeChatVerificationCodeInvalid
	}
	if common.RedisEnabled && common.RDB != nil {
		return issueWeChatVerificationCodeRedis(ctx, openID)
	}
	return issueWeChatVerificationCodeMemory(openID)
}

func issueWeChatVerificationCodeRedis(ctx context.Context, openID string) (string, error) {
	openIDKey := wechatOpenIDKey(openID)
	for range 20 {
		code, err := generateWeChatVerificationCode()
		if err != nil {
			return "", err
		}
		result, err := issueWeChatCodeScript.Run(ctx, common.RDB, []string{openIDKey, wechatVerificationPrefix + code}, wechatVerificationPrefix, openID, strconv.FormatInt(int64(wechatVerificationCodeTTL/time.Second), 10), code).Text()
		if err != nil {
			return "", err
		}
		if result != "" {
			return result, nil
		}
	}
	return "", errors.New("unable to allocate a verification code")
}

func issueWeChatVerificationCodeMemory(openID string) (string, error) {
	wechatVerificationMemory.Lock()
	defer wechatVerificationMemory.Unlock()

	now := time.Now()
	cleanupExpiredWeChatVerificationCodesLocked(now)
	if code, ok := wechatVerificationMemory.byOpenID[openID]; ok {
		if entry, exists := wechatVerificationMemory.byCode[code]; exists && entry.expiresAt.After(now) {
			return code, nil
		}
		delete(wechatVerificationMemory.byOpenID, openID)
	}
	if len(wechatVerificationMemory.byCode) >= wechatVerificationMaxSize {
		return "", errors.New("too many pending WeChat verification codes")
	}
	for range 20 {
		code, err := generateWeChatVerificationCode()
		if err != nil {
			return "", err
		}
		if _, exists := wechatVerificationMemory.byCode[code]; exists {
			continue
		}
		wechatVerificationMemory.byCode[code] = wechatVerificationEntry{openID: openID, expiresAt: now.Add(wechatVerificationCodeTTL)}
		wechatVerificationMemory.byOpenID[openID] = code
		return code, nil
	}
	return "", errors.New("unable to allocate a verification code")
}

// ConsumeWeChatVerificationCode atomically invalidates a code and returns the
// corresponding OpenID. A code cannot be replayed after a successful consume.
func ConsumeWeChatVerificationCode(ctx context.Context, code string) (string, error) {
	if len(code) != 6 {
		return "", ErrWeChatVerificationCodeInvalid
	}
	for _, char := range code {
		if char < '0' || char > '9' {
			return "", ErrWeChatVerificationCodeInvalid
		}
	}
	if common.RedisEnabled && common.RDB != nil {
		return consumeWeChatVerificationCodeRedis(ctx, code)
	}
	return consumeWeChatVerificationCodeMemory(code)
}

func consumeWeChatVerificationCodeRedis(ctx context.Context, code string) (string, error) {
	openID, err := consumeWeChatCodeScript.Run(ctx, common.RDB, []string{wechatVerificationPrefix + code}).Text()
	if errors.Is(err, redis.Nil) || openID == "" {
		return "", ErrWeChatVerificationCodeInvalid
	}
	if err != nil {
		return "", err
	}
	_, _ = deleteMatchingWeChatOpenIDScript.Run(ctx, common.RDB, []string{wechatOpenIDKey(openID)}, code).Result()
	return openID, nil
}

func consumeWeChatVerificationCodeMemory(code string) (string, error) {
	wechatVerificationMemory.Lock()
	defer wechatVerificationMemory.Unlock()

	entry, ok := wechatVerificationMemory.byCode[code]
	if !ok {
		return "", ErrWeChatVerificationCodeInvalid
	}
	delete(wechatVerificationMemory.byCode, code)
	if current := wechatVerificationMemory.byOpenID[entry.openID]; current == code {
		delete(wechatVerificationMemory.byOpenID, entry.openID)
	}
	if !entry.expiresAt.After(time.Now()) {
		return "", ErrWeChatVerificationCodeInvalid
	}
	return entry.openID, nil
}

func cleanupExpiredWeChatVerificationCodesLocked(now time.Time) {
	for code, entry := range wechatVerificationMemory.byCode {
		if entry.expiresAt.After(now) {
			continue
		}
		delete(wechatVerificationMemory.byCode, code)
		if current := wechatVerificationMemory.byOpenID[entry.openID]; current == code {
			delete(wechatVerificationMemory.byOpenID, entry.openID)
		}
	}
}
