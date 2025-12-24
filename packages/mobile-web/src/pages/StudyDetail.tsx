/**
 * Study Detail page - Shows study information and participant breakdown
 */

import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useStudy } from '../hooks/useStudies';
import { useParticipantCounts, useParticipants } from '../hooks/useParticipants';
import { useBatchExecutions } from '../hooks/useBatchExecutions';
import { useConditions } from '../hooks/useConditions';
import { useSurveys } from '../hooks/useSurveys';
import { LoadingSpinner, ErrorMessage, ActorTypeBadge, PageContainer } from '../components';
import { StudyTabs, StudyTab } from '../components/study/StudyTabs';
import { StudySettingsForm } from '../components/study/StudySettingsForm';
import { ConditionList } from '../components/study/ConditionList';
import { SurveyList } from '../components/study/SurveyList';
import { ConsentTab } from '../components/study/ConsentTab';
import { TestMode } from '../components/study/TestMode';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from 'recharts';

const COLORS = ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B'];

export function StudyDetail() {
  const { id } = useParams<{ id: string }>();
  const { study, isLoading, error, refetch, updateStatus } = useStudy(id);
  const { counts, isLoading: countsLoading } = useParticipantCounts(id);
  const { participants } = useParticipants({ studyId: id, limit: 5 });
  const { batches } = useBatchExecutions({ studyId: id, limit: 3 });
  const { conditions } = useConditions(id);
  const { surveys } = useSurveys(id);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<StudyTab>('overview');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner size="lg" text="Loading study..." />
      </div>
    );
  }

  if (error || !study) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <ErrorMessage message={error || 'Study not found'} onRetry={refetch} />
      </div>
    );
  }

  const stateData = [
    { name: 'Enrolled', value: counts.byState.enrolled, color: '#10B981' },
    { name: 'Active', value: counts.byState.active, color: '#3B82F6' },
    { name: 'Complete', value: counts.byState.complete, color: '#8B5CF6' },
    { name: 'Withdrawn', value: counts.byState.withdrawn, color: '#F59E0B' },
  ].filter(d => d.value > 0);

  const handleStatusChange = async (newStatus: typeof study.status) => {
    setStatusError(null);
    try {
      await updateStatus(newStatus);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update status';
      setStatusError(message);
    }
  };

  // Status action buttons
  const statusActions = (
    <div className="flex gap-2">
      {study.status === 'DRAFT' && (
        <button
          onClick={() => handleStatusChange('ACTIVE')}
          className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          Activate Study
        </button>
      )}
      {study.status === 'ACTIVE' && (
        <button
          onClick={() => handleStatusChange('PAUSED')}
          className="px-4 py-2 text-sm bg-yellow-500 text-white rounded-lg hover:bg-yellow-600"
        >
          Pause Study
        </button>
      )}
      {study.status === 'PAUSED' && (
        <button
          onClick={() => handleStatusChange('ACTIVE')}
          className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          Resume Study
        </button>
      )}
    </div>
  );

  return (
    <PageContainer
      title={study.name}
      subtitle={study.type.replace('_', ' ')}
      actions={statusActions}
    >
      {/* Back link for mobile */}
      <Link
        to="/dashboard"
        className="lg:hidden inline-flex items-center gap-2 text-primary-600 mb-4"
      >
        ← Back to Dashboard
      </Link>

      {/* Desktop breadcrumb */}
      <nav className="hidden lg:flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link to="/dashboard" className="hover:text-primary-600">Dashboard</Link>
        <span>/</span>
        <span className="text-gray-900">{study.name}</span>
      </nav>

      {/* Tab Navigation */}
      <StudyTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        counts={{ conditions: conditions.length, surveys: surveys.length }}
      />

      {/* Tab Content */}
      {activeTab === 'settings' && (
        <StudySettingsForm study={study} onUpdate={refetch} />
      )}

      {activeTab === 'conditions' && (
        <ConditionList studyId={id!} />
      )}

      {activeTab === 'surveys' && (
        <SurveyList studyId={id!} />
      )}

      {activeTab === 'consent' && (
        <ConsentTab studyId={id!} />
      )}

      {activeTab === 'test' && (
        <TestMode studyId={id!} studyType={study.type} conditions={conditions} />
      )}

      {activeTab === 'overview' && <div className="space-y-6">
        {/* Status & Description - Mobile only status controls */}
        <section className="bg-white rounded-lg p-4 lg:p-6 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
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
            {/* Mobile status buttons */}
            <div className="lg:hidden flex gap-2">
              {study.status === 'DRAFT' && (
                <button
                  onClick={() => handleStatusChange('ACTIVE')}
                  className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded-lg active:bg-green-200"
                >
                  Activate
                </button>
              )}
              {study.status === 'ACTIVE' && (
                <button
                  onClick={() => handleStatusChange('PAUSED')}
                  className="px-3 py-1 text-sm bg-yellow-100 text-yellow-700 rounded-lg active:bg-yellow-200"
                >
                  Pause
                </button>
              )}
              {study.status === 'PAUSED' && (
                <button
                  onClick={() => handleStatusChange('ACTIVE')}
                  className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded-lg active:bg-green-200"
                >
                  Resume
                </button>
              )}
            </div>
          </div>
          {statusError && (
            <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {statusError}
            </div>
          )}
          {study.description && (
            <p className="text-sm text-gray-600">{study.description}</p>
          )}
          {/* Quick Actions */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex flex-wrap gap-2">
              <Link
                to={`/studies/${id}/enrollment`}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Enrollment Portal
              </Link>
              <Link
                to={`/participants/${id}`}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                </svg>
                Participants
              </Link>
            </div>
          </div>
        </section>

        {/* Main content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Participant Stats - takes 2 columns on desktop */}
          <section className="lg:col-span-2 bg-white rounded-lg p-4 lg:p-6 shadow-sm">
            <h2 className="font-semibold text-gray-800 mb-4">Participants</h2>

            {countsLoading ? (
              <LoadingSpinner size="sm" />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Quick counts */}
                <div>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <p className="text-2xl font-bold text-gray-900">{counts.total}</p>
                      <p className="text-xs text-gray-500">Total</p>
                    </div>
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <p className="text-2xl font-bold text-blue-600">{counts.human}</p>
                      <p className="text-xs text-blue-600">👤 Human</p>
                    </div>
                    <div className="text-center p-3 bg-purple-50 rounded-lg">
                      <p className="text-2xl font-bold text-purple-600">{counts.synthetic}</p>
                      <p className="text-xs text-purple-600">🤖 AI</p>
                    </div>
                  </div>

                  {/* State breakdown list */}
                  <div className="space-y-2">
                    {stateData.map((item) => (
                      <div key={item.name} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="text-sm text-gray-700">{item.name}</span>
                        </div>
                        <span className="text-sm font-medium">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* State breakdown chart */}
                {stateData.length > 0 && (
                  <div className="h-48 lg:h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={stateData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={70}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {stateData.map((entry, index) => (
                            <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Legend
                          verticalAlign="bottom"
                          height={36}
                          formatter={(value, entry) => (
                            <span className="text-xs text-gray-600">
                              {value}: {(entry.payload as { value: number }).value}
                            </span>
                          )}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}

            {/* View all link */}
            <Link
              to={`/participants/${id}`}
              className="inline-block mt-4 text-sm text-primary-600 hover:text-primary-800"
            >
              View All Participants →
            </Link>
          </section>

          {/* Sidebar content */}
          <div className="space-y-6">
            {/* Recent Participants */}
            {participants.length > 0 && (
              <section className="bg-white rounded-lg p-4 lg:p-6 shadow-sm">
                <h2 className="font-semibold text-gray-800 mb-3">Recent Participants</h2>
                <div className="space-y-2">
                  {participants.map(p => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-2 bg-gray-50 rounded"
                    >
                      <div className="flex items-center gap-2">
                        <ActorTypeBadge actorType={p.actorType} role={p.role} compact />
                        <span className="text-sm font-medium truncate">{p.participantId}</span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded whitespace-nowrap ${
                        p.state === 'COMPLETE' ? 'bg-green-100 text-green-700' :
                        p.state === 'ACTIVE' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {p.state}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Batch Executions */}
            {batches.length > 0 && (
              <section className="bg-white rounded-lg p-4 lg:p-6 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="font-semibold text-gray-800">Batch Executions</h2>
                  <Link to="/batches" className="text-sm text-primary-600 hover:text-primary-800">View All →</Link>
                </div>
                <div className="space-y-2">
                  {batches.map(batch => {
                    const progress = batch.actorsToCreate > 0
                      ? Math.round((batch.actorsCompleted / batch.actorsToCreate) * 100)
                      : 0;
                    return (
                      <div key={batch.id} className="p-3 bg-gray-50 rounded-lg">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm font-medium truncate">{batch.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded whitespace-nowrap ${
                            batch.status === 'COMPLETE' ? 'bg-green-100 text-green-700' :
                            batch.status === 'RUNNING' ? 'bg-blue-100 text-blue-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {batch.status}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className="h-1.5 rounded-full bg-blue-500"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {batch.actorsCompleted} / {batch.actorsToCreate} actors
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>}
    </PageContainer>
  );
}
