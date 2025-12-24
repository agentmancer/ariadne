/**
 * Dashboard page - Shows studies overview and quick stats
 */

import { Link, useNavigate } from 'react-router-dom';
import { useStudies } from '../hooks/useStudies';
import { useBatchExecutions, useQueueStats } from '../hooks/useBatchExecutions';
import { LoadingSpinner, ErrorMessage, PageContainer } from '../components';

export function Dashboard() {
  const navigate = useNavigate();
  const { studies, isLoading: studiesLoading, error: studiesError, refetch: refetchStudies } = useStudies();
  const { batches, isLoading: batchesLoading } = useBatchExecutions({ limit: 5, pollInterval: 30000 });
  const { stats: queueStats } = useQueueStats(30000);

  const activeStudies = studies.filter(s => s.status === 'ACTIVE');
  const runningBatches = batches.filter(b => b.status === 'RUNNING' || b.status === 'QUEUED');

  const totalParticipants = studies.reduce((sum, s) => sum + (s._count?.participants || 0), 0);

  const createStudyButton = (
    <button
      onClick={() => navigate('/studies/new')}
      className="px-4 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors"
    >
      + Create Study
    </button>
  );

  return (
    <PageContainer title="Ariadne" subtitle="Researcher Dashboard" actions={createStudyButton}>
      <div className="space-y-6">
        {/* Quick Stats - responsive grid */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg p-4 lg:p-6 shadow-sm">
            <p className="text-2xl lg:text-3xl font-bold text-primary-600">{totalParticipants}</p>
            <p className="text-sm text-gray-600">Total Participants</p>
          </div>
          <div className="bg-white rounded-lg p-4 lg:p-6 shadow-sm">
            <p className="text-2xl lg:text-3xl font-bold text-primary-600">{activeStudies.length}</p>
            <p className="text-sm text-gray-600">Active Studies</p>
          </div>
          <div className="bg-white rounded-lg p-4 lg:p-6 shadow-sm">
            <p className="text-2xl lg:text-3xl font-bold text-primary-600">{studies.length}</p>
            <p className="text-sm text-gray-600">Total Studies</p>
          </div>
          <div className="bg-white rounded-lg p-4 lg:p-6 shadow-sm">
            <p className="text-2xl lg:text-3xl font-bold text-primary-600">{runningBatches.length}</p>
            <p className="text-sm text-gray-600">Running Batches</p>
          </div>
        </section>

        {/* Running Batches Alert */}
        {runningBatches.length > 0 && (
          <Link
            to="/batches"
            className="block bg-blue-50 border border-blue-200 rounded-lg p-4 hover:bg-blue-100 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-blue-900">
                  ⟳ {runningBatches.length} Batch{runningBatches.length > 1 ? 'es' : ''} Running
                </h3>
                <p className="text-sm text-blue-700 mt-1">
                  {queueStats?.active || 0} active jobs • {queueStats?.waiting || 0} waiting
                </p>
              </div>
              <span className="text-blue-500">→</span>
            </div>
          </Link>
        )}

        {/* Main content grid - stack on mobile, side-by-side on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Studies List - takes 2 columns on desktop */}
          <section className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm">
              <div className="flex justify-between items-center p-4 lg:p-6 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-800">Studies</h2>
                <button
                  onClick={() => refetchStudies()}
                  className="text-sm text-primary-600 hover:text-primary-800"
                >
                  Refresh
                </button>
              </div>

              <div className="p-4 lg:p-6">
                {studiesLoading ? (
                  <LoadingSpinner text="Loading studies..." />
                ) : studiesError ? (
                  <ErrorMessage message={studiesError} onRetry={refetchStudies} />
                ) : studies.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500 mb-4">No studies yet.</p>
                    <button
                      onClick={() => navigate('/studies/new')}
                      className="px-4 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors"
                    >
                      Create Your First Study
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {studies.map(study => (
                      <Link
                        key={study.id}
                        to={`/study/${study.id}`}
                        className="block bg-gray-50 hover:bg-gray-100 rounded-lg p-4 transition-colors"
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-gray-900 truncate">{study.name}</h3>
                            <p className="text-sm text-gray-600 mt-1">
                              {study._count?.participants || 0} participants • {study._count?.conditions || 0} conditions
                            </p>
                          </div>
                          <span
                            className={`ml-3 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                              study.status === 'ACTIVE'
                                ? 'bg-green-100 text-green-800'
                                : study.status === 'PAUSED'
                                ? 'bg-yellow-100 text-yellow-800'
                                : study.status === 'COMPLETE'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {study.status}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Recent Batches - sidebar on desktop */}
          <section className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm">
              <div className="flex justify-between items-center p-4 lg:p-6 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-800">Recent Batches</h2>
                <Link to="/batches" className="text-sm text-primary-600 hover:text-primary-800">
                  View All →
                </Link>
              </div>

              <div className="p-4 lg:p-6">
                {batchesLoading ? (
                  <LoadingSpinner />
                ) : batches.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">
                    No batch executions yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {batches.slice(0, 5).map(batch => {
                      const progress = batch.actorsToCreate > 0
                        ? Math.round((batch.actorsCompleted / batch.actorsToCreate) * 100)
                        : 0;

                      return (
                        <Link
                          key={batch.id}
                          to={`/batches/${batch.id}`}
                          className="block bg-gray-50 hover:bg-gray-100 rounded-lg p-3 transition-colors"
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-gray-900 truncate text-sm">{batch.name}</span>
                            <span className={`text-xs px-2 py-0.5 rounded whitespace-nowrap ${
                              batch.status === 'COMPLETE' ? 'bg-green-100 text-green-800' :
                              batch.status === 'RUNNING' ? 'bg-blue-100 text-blue-800' :
                              batch.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {batch.status}
                            </span>
                          </div>
                          <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full ${
                                batch.status === 'COMPLETE' ? 'bg-green-500' :
                                batch.status === 'FAILED' ? 'bg-red-500' :
                                'bg-blue-500'
                              }`}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            {batch.actorsCompleted} / {batch.actorsToCreate} actors
                          </p>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Connection Status */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-4">
              <h3 className="font-medium text-green-900 mb-1">✓ Connected</h3>
              <p className="text-sm text-green-800">
                Connected to Ariadne API server.
              </p>
            </div>
          </section>
        </div>
      </div>
    </PageContainer>
  );
}
