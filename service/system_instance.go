package service

import (
	"context"
	"fmt"
	"os"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"

	"github.com/bytedance/gopkg/util/gopool"
)

const (
	systemInstanceReportInterval     = 30 * time.Second
	systemMetricSampleInterval       = time.Minute
	systemMetricCleanupCheckInterval = time.Hour
)

var systemInstanceReporterOnce sync.Once
var lastSystemMetricCleanupAt atomic.Int64
var lastSystemMetricSampleAt atomic.Int64
var systemMetricSampleMutex sync.Mutex

type SystemInstanceInfo struct {
	SchemaVersion int                       `json:"schema_version"`
	Node          common.NodeIdentity       `json:"node"`
	Role          SystemInstanceRoleInfo    `json:"role"`
	Runtime       SystemInstanceRuntimeInfo `json:"runtime"`
	Host          SystemInstanceHostInfo    `json:"host"`
	Resources     SystemInstanceResources   `json:"resources"`
	Extra         map[string]any            `json:"extra,omitempty"`
}

type SystemInstanceRoleInfo struct {
	IsMaster bool `json:"is_master"`
}

type SystemInstanceRuntimeInfo struct {
	Version   string `json:"version"`
	GOOS      string `json:"goos"`
	GOARCH    string `json:"goarch"`
	StartedAt int64  `json:"started_at"`
}

type SystemInstanceHostInfo struct {
	Hostname string `json:"hostname"`
}

type SystemInstanceResources struct {
	CPU     SystemInstanceResourceUsage  `json:"cpu"`
	Memory  SystemInstanceMemoryMetrics  `json:"memory"`
	Storage SystemInstanceStorageMetrics `json:"storage"`
}

type SystemInstanceResourceUsage struct {
	UsagePercent float64 `json:"usage_percent"`
}

type SystemInstanceMemoryMetrics struct {
	UsagePercent   float64 `json:"usage_percent"`
	TotalBytes     uint64  `json:"total_bytes"`
	UsedBytes      uint64  `json:"used_bytes"`
	AvailableBytes uint64  `json:"available_bytes"`
}

type SystemInstanceStorageMetrics struct {
	TotalBytes  uint64  `json:"total_bytes"`
	UsedBytes   uint64  `json:"used_bytes"`
	FreeBytes   uint64  `json:"free_bytes"`
	UsedPercent float64 `json:"used_percent"`
}

func StartSystemInstanceReporter() {
	systemInstanceReporterOnce.Do(func() {
		gopool.Go(func() {
			reportSystemInstanceWithLog()

			ticker := time.NewTicker(systemInstanceReportInterval)
			defer ticker.Stop()
			for range ticker.C {
				reportSystemInstanceWithLog()
			}
		})
	})
}

func ReportCurrentSystemInstance() error {
	identity := common.GetNodeIdentity()
	hostname, hostnameErr := os.Hostname()
	if strings.TrimSpace(identity.Name) == "" {
		if hostnameErr != nil || strings.TrimSpace(hostname) == "" {
			return fmt.Errorf("system instance node name is empty")
		}
		identity.Name = hostname
		identity.Source = common.NodeNameSourceHostname
		identity.ManuallyConfigured = false
		identity.ShouldConfigureManually = true
	}
	snapshot := common.GetSystemResourceSnapshot()
	systemStatus := snapshot.Status
	diskInfo := snapshot.Disk
	now := common.GetTimestamp()
	info := SystemInstanceInfo{
		SchemaVersion: 1,
		Node:          identity,
		Role: SystemInstanceRoleInfo{
			IsMaster: common.IsMasterNode,
		},
		Runtime: SystemInstanceRuntimeInfo{
			Version:   common.Version,
			GOOS:      runtime.GOOS,
			GOARCH:    runtime.GOARCH,
			StartedAt: common.StartTime,
		},
		Host: SystemInstanceHostInfo{
			Hostname: hostname,
		},
		Resources: SystemInstanceResources{
			CPU: SystemInstanceResourceUsage{
				UsagePercent: systemStatus.CPUUsage,
			},
			Memory: SystemInstanceMemoryMetrics{
				UsagePercent:   systemStatus.MemoryUsage,
				TotalBytes:     snapshot.MemoryTotal,
				UsedBytes:      snapshot.MemoryUsed,
				AvailableBytes: snapshot.MemoryAvailable,
			},
			Storage: SystemInstanceStorageMetrics{
				TotalBytes:  diskInfo.Total,
				UsedBytes:   diskInfo.Used,
				FreeBytes:   diskInfo.Free,
				UsedPercent: diskInfo.UsedPercent,
			},
		},
	}
	if err := model.UpsertSystemInstance(identity.Name, info, common.StartTime, now); err != nil {
		return err
	}
	return recordSystemMetricSample(identity.Name, now, snapshot)
}

func recordSystemMetricSample(nodeName string, now int64, snapshot common.SystemResourceSnapshot) error {
	if !snapshot.Valid() {
		return nil
	}
	sampledAt := now - now%int64(systemMetricSampleInterval/time.Second)
	systemMetricSampleMutex.Lock()
	defer systemMetricSampleMutex.Unlock()
	if lastSystemMetricSampleAt.Load() == sampledAt {
		return nil
	}

	systemStatus := snapshot.Status
	diskInfo := snapshot.Disk
	metric := &model.SystemMetric{
		NodeName:             nodeName,
		SampledAt:            sampledAt,
		CPUUsage:             systemStatus.CPUUsage,
		MemoryUsage:          systemStatus.MemoryUsage,
		MemoryTotalBytes:     snapshot.MemoryTotal,
		MemoryUsedBytes:      snapshot.MemoryUsed,
		MemoryAvailableBytes: snapshot.MemoryAvailable,
		StorageUsage:         systemStatus.DiskUsage,
		StorageTotalBytes:    diskInfo.Total,
		StorageUsedBytes:     diskInfo.Used,
		StorageFreeBytes:     diskInfo.Free,
	}
	if err := model.UpsertSystemMetric(metric); err != nil {
		return err
	}
	lastSystemMetricSampleAt.Store(sampledAt)
	cleanupSystemMetrics(now)
	if err := evaluateSystemMetricAlert(nodeName, snapshot); err != nil {
		logger.LogWarn(context.Background(), common.LogText("system metric alert failed: %v", err))
	}
	return nil
}

func cleanupSystemMetrics(now int64) {
	lastCleanup := lastSystemMetricCleanupAt.Load()
	if now-lastCleanup < int64(systemMetricCleanupCheckInterval/time.Second) {
		return
	}
	if !lastSystemMetricCleanupAt.CompareAndSwap(lastCleanup, now) {
		return
	}
	if err := model.DeleteSystemMetricsBefore(now - model.SystemMetricRetentionSeconds); err != nil {
		logger.LogWarn(context.Background(), common.LogText("system metric cleanup failed: %v", err))
	}
}

func reportSystemInstanceWithLog() {
	if err := ReportCurrentSystemInstance(); err != nil {
		logger.LogWarn(context.Background(), common.LogText("system instance report failed: %v", err))
	}
}
