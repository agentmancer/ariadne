/**
 * Participant List page - Shows all participants with filtering
 */

import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useParticipants } from '../hooks/useParticipants';
import { useStudy } from '../hooks/useStudies';
import { LoadingSpinner, ErrorMessage, ActorTypeBadge, PageContainer } from '../components';
import { Participant } from '../services/api';

type ActorFilter = 'ALL' | 'HUMAN' | 'SYNTHETIC';
type StateFilter = 'ALL' | 'ENROLLED' | 'ACTIVE' | 'COMPLETE' | 'WITHDRAWN';

// Get the participant web app URL (defaults to same host, port 5173)
const getParticipantAppUrl = () => {
  const participantUrl = localStorage.getItem('participantAppUrl');
  if (participantUrl) return participantUrl;
  // Default: same hostname, port 5173
  return `${window.location.protocol}//${window.location.hostname}:5173`;
};

export function ParticipantList() {
  const { studyId } = useParams<{ studyId: string }>();
  const { study } = useStudy(studyId);
  const [actorFilter, setActorFilter] = useState<ActorFilter>('ALL');
  const [stateFilter, setStateFilter] = useState<StateFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyJoinLink = async (participantId: string) => {
    const url = `${getParticipantAppUrl()}/join/${participantId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(participantId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const { participants, isLoading, error, refetch } = useParticipants({
    studyId,
    actorType: actorFilter === 'ALL' ? undefined : actorFilter,
    state: stateFilter === 'ALL' ? undefined : stateFilter,
    limit: 100,
  });

  // Client-side search filter
  const filteredParticipants = participants.filter(p =>
    p.participantId.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.role?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStateColor = (state: Participant['state']) => {
    switch (state) {
      case 'ENROLLED': return 'bg-gray-100 text-gray-700';
      case 'ACTIVE': return 'bg-blue-100 text-blue-700';
      case 'COMPLETE': return 'bg-green-100 text-green-700';
      case 'WITHDRAWN': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <PageContainer
      title="Participants"
      subtitle={study?.name || 'Study participants'}
    >
      {/* Back link for mobile */}
      <Link
        to={studyId ? `/study/${studyId}` : '/dashboard'}
        className="lg:hidden inline-flex items-center gap-2 text-primary-600 mb-4"
      >
        ← Back to Study
      </Link>

      {/* Desktop breadcrumb */}
      <nav className="hidden lg:flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link to="/dashboard" className="hover:text-primary-600">Dashboard</Link>
        <span>/</span>
        {study && (
          <>
            <Link to={`/study/${studyId}`} className="hover:text-primary-600">{study.name}</Link>
            <span>/</span>
          </>
        )}
        <span className="text-gray-900">Participants</span>
      </nav>

      <div className="space-y-6">
        {/* Search and Filters Card */}
        <section className="bg-white rounded-lg p-4 lg:p-6 shadow-sm">
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search participants..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 pl-10 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white"
              />
              <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
            </div>

            {/* Filters - horizontal on desktop */}
            <div className="flex flex-col lg:flex-row lg:items-center gap-4">
              {/* Actor Type Filter */}
              <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0">
                <span className="hidden lg:inline text-sm text-gray-500 mr-2">Type:</span>
                {(['ALL', 'HUMAN', 'SYNTHETIC'] as ActorFilter[]).map(filter => (
                  <button
                    key={filter}
                    onClick={() => setActorFilter(filter)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition ${
                      actorFilter === filter
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {filter === 'ALL' ? 'All' : filter === 'HUMAN' ? '👤 Human' : '🤖 AI'}
                  </button>
                ))}
              </div>

              {/* Divider */}
              <div className="hidden lg:block w-px h-6 bg-gray-200" />

              {/* State Filter */}
              <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0">
                <span className="hidden lg:inline text-sm text-gray-500 mr-2">State:</span>
                {(['ALL', 'ENROLLED', 'ACTIVE', 'COMPLETE', 'WITHDRAWN'] as StateFilter[]).map(filter => (
                  <button
                    key={filter}
                    onClick={() => setStateFilter(filter)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition ${
                      stateFilter === filter
                        ? 'bg-gray-800 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {filter === 'ALL' ? 'All States' : filter.charAt(0) + filter.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Results count */}
        <div className="flex justify-between items-center text-sm text-gray-600">
          <span>{filteredParticipants.length} participant{filteredParticipants.length !== 1 ? 's' : ''}</span>
          <button
            onClick={() => refetch()}
            className="text-primary-600 hover:text-primary-800"
          >
            Refresh
          </button>
        </div>

        {/* Participant List */}
        {isLoading ? (
          <LoadingSpinner text="Loading participants..." />
        ) : error ? (
          <ErrorMessage message={error} onRetry={refetch} />
        ) : filteredParticipants.length === 0 ? (
          <div className="bg-white rounded-lg p-8 text-center text-gray-500">
            {participants.length === 0
              ? 'No participants yet.'
              : 'No participants match your filters.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredParticipants.map(participant => (
              <div
                key={participant.id}
                className="bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <ActorTypeBadge
                        actorType={participant.actorType}
                        role={participant.role}
                        compact
                      />
                      <span className="font-medium text-gray-900 truncate">
                        {participant.participantId}
                      </span>
                      {participant.actorType === 'HUMAN' && (
                        <button
                          onClick={() => copyJoinLink(participant.participantId)}
                          className="ml-auto px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                          title="Copy join link"
                        >
                          {copiedId === participant.participantId ? '✓ Copied' : '📋 Link'}
                        </button>
                      )}
                    </div>
                    <div className="text-sm text-gray-500 space-y-1">
                      {participant.condition && (
                        <p className="truncate">
                          <span className="text-gray-400">Condition:</span> {participant.condition.name}
                        </p>
                      )}
                      {participant.llmProvider && (
                        <p className="truncate">
                          <span className="text-gray-400">LLM:</span> {participant.llmProvider.name}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className={`ml-2 px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${getStateColor(participant.state)}`}>
                    {participant.state}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
