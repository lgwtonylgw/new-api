package service

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
)

const logExportLockTTL = time.Minute

const logExportLockRenewScript = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0`

const logExportLockReleaseScript = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0`

// logExportLocks holds the running exports when Redis is disabled.
var logExportLocks sync.Map

// AcquireLogExportLock reserves the one log export a user may run at a time.
// leaseCtx is canceled when the caller disconnects or a Redis lease can no
// longer be renewed, so an export never continues after losing ownership.
// ok is false while another export of the user is running; otherwise release
// must be called when the export ends.
func AcquireLogExportLock(parent context.Context, userId int) (leaseCtx context.Context, release func(), ok bool, err error) {
	if parent == nil {
		parent = context.Background()
	}
	leaseCtx, cancel := context.WithCancel(parent)
	if !common.RedisEnabled {
		if _, running := logExportLocks.LoadOrStore(userId, struct{}{}); running {
			cancel()
			return nil, nil, false, nil
		}
		var once sync.Once
		return leaseCtx, func() {
			once.Do(func() {
				logExportLocks.Delete(userId)
				cancel()
			})
		}, true, nil
	}

	key := fmt.Sprintf("log_export:%d", userId)
	owner := common.GetRandomString(16)
	acquired, err := common.RDB.SetNX(leaseCtx, key, owner, logExportLockTTL).Result()
	if err != nil || !acquired {
		cancel()
		return nil, nil, false, err
	}

	go func() {
		ticker := time.NewTicker(logExportLockTTL / 3)
		defer ticker.Stop()
		for {
			select {
			case <-leaseCtx.Done():
				return
			case <-ticker.C:
				renewed, renewErr := common.RDB.Eval(leaseCtx, logExportLockRenewScript, []string{key}, owner, logExportLockTTL.Milliseconds()).Int()
				if renewErr != nil || renewed != 1 {
					cancel()
					return
				}
			}
		}
	}()
	var once sync.Once
	return leaseCtx, func() {
		once.Do(func() {
			cancel()
			common.RDB.Eval(context.Background(), logExportLockReleaseScript, []string{key}, owner)
		})
	}, true, nil
}
