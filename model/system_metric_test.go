package model

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSystemMetricUpsertListAndCleanup(t *testing.T) {
	truncateTables(t)
	require.NoError(t, DB.AutoMigrate(&SystemMetric{}))
	require.NoError(t, DB.AutoMigrate(&SystemMetric{}))

	first := &SystemMetric{
		NodeName:          "node-a",
		SampledAt:         1_700_000_000,
		CPUUsage:          20,
		MemoryUsage:       30,
		StorageUsage:      40,
		MemoryTotalBytes:  1024,
		StorageTotalBytes: 2048,
	}
	require.NoError(t, UpsertSystemMetric(first))

	updated := *first
	updated.CPUUsage = 25
	require.NoError(t, UpsertSystemMetric(&updated))

	second := *first
	second.ID = 0
	second.CreatedAt = 0
	second.SampledAt += 60
	second.CPUUsage = 35
	require.NoError(t, UpsertSystemMetric(&second))

	metrics, err := ListSystemMetrics("node-a", first.SampledAt, second.SampledAt)
	require.NoError(t, err)
	require.Len(t, metrics, 2)
	require.Equal(t, 25.0, metrics[0].CPUUsage)
	require.Equal(t, 35.0, metrics[1].CPUUsage)

	require.NoError(t, DeleteSystemMetricsBefore(second.SampledAt))
	metrics, err = ListSystemMetrics("node-a", first.SampledAt, second.SampledAt)
	require.NoError(t, err)
	require.Len(t, metrics, 1)
	require.Equal(t, second.SampledAt, metrics[0].SampledAt)
}
