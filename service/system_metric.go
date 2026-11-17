package service

import (
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

const systemMetricSampleIntervalSeconds int64 = 60

type SystemMetricHistory struct {
	NodeName              string              `json:"node_name"`
	Range                 string              `json:"range"`
	SampleIntervalSeconds int64               `json:"sample_interval_seconds"`
	BucketSeconds         int64               `json:"bucket_seconds"`
	RetentionDays         int                 `json:"retention_days"`
	Samples               []SystemMetricPoint `json:"samples"`
}

type SystemMetricPoint struct {
	SampledAt            int64   `json:"sampled_at"`
	CPUUsage             float64 `json:"cpu_usage"`
	MemoryUsage          float64 `json:"memory_usage"`
	MemoryTotalBytes     uint64  `json:"memory_total_bytes"`
	MemoryUsedBytes      uint64  `json:"memory_used_bytes"`
	MemoryAvailableBytes uint64  `json:"memory_available_bytes"`
	StorageUsage         float64 `json:"storage_usage"`
	StorageTotalBytes    uint64  `json:"storage_total_bytes"`
	StorageUsedBytes     uint64  `json:"storage_used_bytes"`
	StorageFreeBytes     uint64  `json:"storage_free_bytes"`
}

type systemMetricBucket struct {
	Count                int
	CPUUsage             float64
	MemoryUsage          float64
	StorageUsage         float64
	MemoryTotalBytes     uint64
	MemoryUsedBytes      uint64
	MemoryAvailableBytes uint64
	StorageTotalBytes    uint64
	StorageUsedBytes     uint64
	StorageFreeBytes     uint64
}

func GetSystemMetricHistory(nodeName string, rangeKey string) (*SystemMetricHistory, error) {
	nodeName = strings.TrimSpace(nodeName)
	if nodeName == "" {
		nodeName = strings.TrimSpace(common.GetNodeIdentity().Name)
	}
	if nodeName == "" {
		return nil, common.NewMessage("node name is required")
	}

	rangeSeconds, bucketSeconds, err := systemMetricRange(rangeKey)
	if err != nil {
		return nil, err
	}
	endAt := time.Now().Unix()
	startAt := endAt - rangeSeconds
	metrics, err := model.ListSystemMetrics(nodeName, startAt, endAt)
	if err != nil {
		return nil, err
	}

	return &SystemMetricHistory{
		NodeName:              nodeName,
		Range:                 rangeKey,
		SampleIntervalSeconds: systemMetricSampleIntervalSeconds,
		BucketSeconds:         bucketSeconds,
		RetentionDays:         int(model.SystemMetricRetentionSeconds / (24 * 60 * 60)),
		Samples:               aggregateSystemMetrics(metrics, bucketSeconds),
	}, nil
}

func systemMetricRange(rangeKey string) (int64, int64, error) {
	switch rangeKey {
	case "1h":
		return 60 * 60, 60, nil
	case "6h":
		return 6 * 60 * 60, 60, nil
	case "24h", "":
		return 24 * 60 * 60, 60, nil
	case "7d":
		return 7 * 24 * 60 * 60, 10 * 60, nil
	case "30d":
		return 30 * 24 * 60 * 60, 60 * 60, nil
	default:
		return 0, 0, common.NewMessage("unsupported metric range")
	}
}

func aggregateSystemMetrics(metrics []model.SystemMetric, bucketSeconds int64) []SystemMetricPoint {
	if len(metrics) == 0 {
		return []SystemMetricPoint{}
	}
	order := make([]int64, 0)
	buckets := make(map[int64]*systemMetricBucket)
	for _, metric := range metrics {
		bucketAt := metric.SampledAt - metric.SampledAt%bucketSeconds
		bucket := buckets[bucketAt]
		if bucket == nil {
			bucket = &systemMetricBucket{}
			buckets[bucketAt] = bucket
			order = append(order, bucketAt)
		}
		bucket.Count++
		bucket.CPUUsage += metric.CPUUsage
		bucket.MemoryUsage += metric.MemoryUsage
		bucket.StorageUsage += metric.StorageUsage
		bucket.MemoryTotalBytes = metric.MemoryTotalBytes
		bucket.MemoryUsedBytes = metric.MemoryUsedBytes
		bucket.MemoryAvailableBytes = metric.MemoryAvailableBytes
		bucket.StorageTotalBytes = metric.StorageTotalBytes
		bucket.StorageUsedBytes = metric.StorageUsedBytes
		bucket.StorageFreeBytes = metric.StorageFreeBytes
	}

	points := make([]SystemMetricPoint, 0, len(order))
	for _, bucketAt := range order {
		bucket := buckets[bucketAt]
		count := float64(bucket.Count)
		points = append(points, SystemMetricPoint{
			SampledAt:            bucketAt,
			CPUUsage:             bucket.CPUUsage / count,
			MemoryUsage:          bucket.MemoryUsage / count,
			MemoryTotalBytes:     bucket.MemoryTotalBytes,
			MemoryUsedBytes:      bucket.MemoryUsedBytes,
			MemoryAvailableBytes: bucket.MemoryAvailableBytes,
			StorageUsage:         bucket.StorageUsage / count,
			StorageTotalBytes:    bucket.StorageTotalBytes,
			StorageUsedBytes:     bucket.StorageUsedBytes,
			StorageFreeBytes:     bucket.StorageFreeBytes,
		})
	}
	return points
}
