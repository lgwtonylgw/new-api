package model

import (
	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const SystemMetricRetentionSeconds int64 = 30 * 24 * 60 * 60

// SystemMetric stores one host resource sample per node and minute.
type SystemMetric struct {
	ID                   int64   `json:"id" gorm:"primaryKey"`
	NodeName             string  `json:"node_name" gorm:"type:varchar(128);not null;uniqueIndex:idx_system_metric_node_sample,priority:1"`
	SampledAt            int64   `json:"sampled_at" gorm:"bigint;not null;uniqueIndex:idx_system_metric_node_sample,priority:2;index:idx_system_metric_sampled_at"`
	CPUUsage             float64 `json:"cpu_usage"`
	MemoryUsage          float64 `json:"memory_usage"`
	MemoryTotalBytes     uint64  `json:"memory_total_bytes"`
	MemoryUsedBytes      uint64  `json:"memory_used_bytes"`
	MemoryAvailableBytes uint64  `json:"memory_available_bytes"`
	StorageUsage         float64 `json:"storage_usage"`
	StorageTotalBytes    uint64  `json:"storage_total_bytes"`
	StorageUsedBytes     uint64  `json:"storage_used_bytes"`
	StorageFreeBytes     uint64  `json:"storage_free_bytes"`
	CreatedAt            int64   `json:"created_at" gorm:"bigint"`
}

func (metric *SystemMetric) BeforeCreate(_ *gorm.DB) error {
	if metric.CreatedAt == 0 {
		metric.CreatedAt = common.GetTimestamp()
	}
	return nil
}

func UpsertSystemMetric(metric *SystemMetric) error {
	if metric == nil || metric.NodeName == "" || metric.SampledAt == 0 {
		return nil
	}
	return DB.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "node_name"}, {Name: "sampled_at"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"cpu_usage",
			"memory_usage",
			"memory_total_bytes",
			"memory_used_bytes",
			"memory_available_bytes",
			"storage_usage",
			"storage_total_bytes",
			"storage_used_bytes",
			"storage_free_bytes",
		}),
	}).Create(metric).Error
}

func ListSystemMetrics(nodeName string, startAt int64, endAt int64) ([]SystemMetric, error) {
	var metrics []SystemMetric
	query := DB.Where("sampled_at >= ? AND sampled_at <= ?", startAt, endAt)
	if nodeName != "" {
		query = query.Where("node_name = ?", nodeName)
	}
	err := query.Order("sampled_at ASC").Find(&metrics).Error
	return metrics, err
}

func DeleteSystemMetricsBefore(cutoffAt int64) error {
	if cutoffAt <= 0 {
		return nil
	}
	return DB.Where("sampled_at < ?", cutoffAt).Delete(&SystemMetric{}).Error
}
