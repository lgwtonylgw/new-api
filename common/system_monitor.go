package common

import (
	"sync/atomic"
	"time"

	"github.com/shirou/gopsutil/cpu"
	"github.com/shirou/gopsutil/mem"
)

// DiskSpaceInfo 磁盘空间信息
type DiskSpaceInfo struct {
	// 总空间（字节）
	Total uint64 `json:"total"`
	// 可用空间（字节）
	Free uint64 `json:"free"`
	// 已用空间（字节）
	Used uint64 `json:"used"`
	// 使用百分比
	UsedPercent float64 `json:"used_percent"`
}

// SystemStatus 系统状态信息
type SystemStatus struct {
	CPUUsage    float64
	MemoryUsage float64
	DiskUsage   float64
}

// SystemResourceSnapshot contains one point-in-time view of host resources.
// It is shared by the fast protection monitor and the one-minute history
// collector so both paths report the same values.
type SystemResourceSnapshot struct {
	Status          SystemStatus
	MemoryTotal     uint64
	MemoryUsed      uint64
	MemoryAvailable uint64
	Disk            DiskSpaceInfo
	SampledAt       int64
	CPUValid        bool
	MemoryValid     bool
	DiskValid       bool
}

func (snapshot SystemResourceSnapshot) Valid() bool {
	return snapshot.SampledAt > 0 && snapshot.CPUValid && snapshot.MemoryValid && snapshot.DiskValid
}

var latestSystemResourceSnapshot atomic.Value

func init() {
	latestSystemResourceSnapshot.Store(SystemResourceSnapshot{})
}

// StartSystemMonitor 启动系统监控
func StartSystemMonitor() {
	updateSystemStatus()
	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			updateSystemStatus()
		}
	}()
}

func updateSystemStatus() {
	CollectSystemResourceSnapshot()
}

// CollectSystemResourceSnapshot reads the current CPU, memory, and disk usage
// and refreshes the latest status used by relay protection.
func CollectSystemResourceSnapshot() SystemResourceSnapshot {
	snapshot := GetSystemResourceSnapshot()
	snapshot.SampledAt = GetTimestamp()
	snapshot.CPUValid = false
	snapshot.MemoryValid = false
	snapshot.DiskValid = false

	// CPU
	// 注意：cpu.Percent(0, false) 返回自上次调用以来的 CPU 使用率
	// 如果是第一次调用，可能会返回错误或不准确的值，但在循环中会逐渐正常
	percents, err := cpu.Percent(0, false)
	if err == nil && len(percents) > 0 {
		snapshot.Status.CPUUsage = percents[0]
		snapshot.CPUValid = true
	}

	// Memory
	memInfo, err := mem.VirtualMemory()
	if err == nil {
		snapshot.Status.MemoryUsage = memInfo.UsedPercent
		snapshot.MemoryTotal = memInfo.Total
		snapshot.MemoryUsed = memInfo.Used
		snapshot.MemoryAvailable = memInfo.Available
		snapshot.MemoryValid = true
	}

	// Disk
	diskInfo := GetDiskSpaceInfo()
	if diskInfo.Total > 0 {
		snapshot.Disk = diskInfo
		snapshot.Status.DiskUsage = diskInfo.UsedPercent
		snapshot.DiskValid = true
	}

	latestSystemResourceSnapshot.Store(snapshot)
	return snapshot
}

// GetSystemResourceSnapshot returns the latest sample produced by the fixed
// interval collector. History, alerts, and relay protection all consume this
// snapshot so CPU percentages use one stable sampling window.
func GetSystemResourceSnapshot() SystemResourceSnapshot {
	return latestSystemResourceSnapshot.Load().(SystemResourceSnapshot)
}

// GetSystemStatus 获取当前系统状态
func GetSystemStatus() SystemStatus {
	return GetSystemResourceSnapshot().Status
}
