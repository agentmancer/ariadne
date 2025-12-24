/**
 * Batch Executions page - View and manage batch executions
 */

import { useBatchExecutions, useQueueStats } from '../hooks/useBatchExecutions';
import { LoadingSpinner, ErrorMessage, BatchStatusCard, PageContainer } from '../components';

export function BatchExecutions() {
  const {
    batches,
    isLoading,
    error,
    refetch,
    pauseBatch,
    resumeBatch
  } = useBatchExecutions({ pollInterval: 10000 }); // Poll every 10s

  const { stats: queueStats } = useQueueStats(10000);

  const runningBatches = batches.filter(b => b.status === 'RUNNING' || b.status === 'QUEUED');
  const completedBatches = batches.filter(b => b.status === 'COMPLETE' || b.status === 'FAILED');

  return (
    <PageContainer title="Batch Executions" subtitle="Manage AI actor batches">
      <div className="space-y-6">
        {/* Info Banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
          <span className="font-medium">Monitoring View:</span> This page displays existing batch executions.
          To create new batches, use the API directly or the batch creation endpoint.
        </div>
        {/* Queue Stats */}
        {queueStats && (
          <section className="bg-white rounded-lg p-4 lg:p-6 shadow-sm">
            <h2 className="font-semibold text-gray-800 mb-4">Queue Status</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
              <div className="p-3 lg:p-4 bg-blue-50 rounded-lg text-center">
                <p className="text-2xl lg:text-3xl font-bold text-blue-600">{queueStats.active}</p>
                <p className="text-xs lg:text-sm text-blue-600">Active</p>
              </div>
              <div className="p-3 lg:p-4 bg-yellow-50 rounded-lg text-center">
                <p className="text-2xl lg:text-3xl font-bold text-yellow-600">{queueStats.waiting}</p>
                <p className="text-xs lg:text-sm text-yellow-600">Waiting</p>
              </div>
              <div className="p-3 lg:p-4 bg-green-50 rounded-lg text-center">
                <p className="text-2xl lg:text-3xl font-bold text-green-600">{queueStats.completed}</p>
                <p className="text-xs lg:text-sm text-green-600">Completed</p>
              </div>
              <div className="p-3 lg:p-4 bg-red-50 rounded-lg text-center">
                <p className="text-2xl lg:text-3xl font-bold text-red-600">{queueStats.failed}</p>
                <p className="text-xs lg:text-sm text-red-600">Failed</p>
              </div>
            </div>
            {queueStats.isPaused && (
              <div className="mt-4 p-3 bg-yellow-100 border border-yellow-300 rounded-lg text-sm text-yellow-800 text-center">
                ⏸ Queue is paused
              </div>
            )}
          </section>
        )}

        {/* Loading / Error / Content */}
        {isLoading ? (
          <LoadingSpinner text="Loading batches..." />
        ) : error ? (
          <ErrorMessage message={error} onRetry={refetch} />
        ) : batches.length === 0 ? (
          <div className="bg-white rounded-lg p-8 text-center text-gray-500">
            No batch executions yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Running Batches */}
            <section>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-800">
                  In Progress ({runningBatches.length})
                </h2>
                <button
                  onClick={() => refetch()}
                  className="text-sm text-primary-600 hover:text-primary-800"
                >
                  Refresh
                </button>
              </div>
              {runningBatches.length === 0 ? (
                <div className="bg-white rounded-lg p-6 text-center text-gray-500 shadow-sm">
                  No batches currently running.
                </div>
              ) : (
                <div className="space-y-3">
                  {runningBatches.map(batch => (
                    <BatchStatusCard
                      key={batch.id}
                      batch={batch}
                      onPause={() => pauseBatch(batch.id)}
                      onResume={() => resumeBatch(batch.id)}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Completed Batches */}
            <section>
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Completed ({completedBatches.length})
              </h2>
              {completedBatches.length === 0 ? (
                <div className="bg-white rounded-lg p-6 text-center text-gray-500 shadow-sm">
                  No completed batches yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {completedBatches.map(batch => (
                    <BatchStatusCard
                      key={batch.id}
                      batch={batch}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
