/**
 * TestMode component for testing participant experience
 * Embeds the participant web interface in iframe(s) for researchers to test
 */

import { useState, useCallback } from 'react';
import { api, TestParticipant, TestParticipantsResult, Condition } from '../../services/api';

interface TestModeProps {
  studyId: string;
  studyType: string;
  conditions: Condition[];
}

// Get participant web URL from environment or default
const PARTICIPANT_WEB_URL = import.meta.env.VITE_PARTICIPANT_WEB_URL || 'http://localhost:5173/study';

export function TestMode({ studyId, studyType, conditions }: TestModeProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testSession, setTestSession] = useState<TestParticipantsResult | null>(null);
  const [selectedCondition, setSelectedCondition] = useState<string>('');

  const isPairedStudy = studyType === 'PAIRED_COLLABORATIVE';

  const createTestSession = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.createTestParticipants(studyId, {
        conditionId: selectedCondition || undefined,
        paired: isPairedStudy,
      });
      setTestSession(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create test session';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [studyId, selectedCondition, isPairedStudy]);

  const resetTestSession = useCallback(async () => {
    if (!testSession) return;

    setIsLoading(true);
    setError(null);
    try {
      // Delete current test participants and create new ones
      await api.deleteTestParticipants(studyId);
      const result = await api.createTestParticipants(studyId, {
        conditionId: selectedCondition || undefined,
        paired: isPairedStudy,
      });
      setTestSession(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reset test session';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [studyId, selectedCondition, isPairedStudy, testSession]);

  const clearTestSession = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await api.deleteTestParticipants(studyId);
      setTestSession(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to clear test session';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [studyId]);

  const getJoinUrl = (participant: TestParticipant) => {
    return `${PARTICIPANT_WEB_URL}/join/${participant.uniqueId}`;
  };

  // No active test session - show setup UI
  if (!testSession) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="text-center max-w-md mx-auto">
          <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Test Mode</h3>
          <p className="text-sm text-gray-500 mb-6">
            Preview the participant experience by creating a test session.
            {isPairedStudy && ' This will create two paired test participants.'}
          </p>

          {conditions.length > 0 && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Condition (optional)
              </label>
              <select
                value={selectedCondition}
                onChange={(e) => setSelectedCondition(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">Auto-select first condition</option>
                {conditions.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            onClick={createTestSession}
            disabled={isLoading}
            className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Creating...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Start Test Session
              </>
            )}
          </button>

          <p className="mt-4 text-xs text-gray-400">
            Test participants are marked and excluded from analysis exports.
          </p>
        </div>
      </div>
    );
  }

  // Active test session - show iframe(s)
  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-medium text-amber-800">Test Mode Active</h4>
            <p className="text-xs text-amber-700 mt-0.5">
              You are viewing a test session. Data from test participants is excluded from exports.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={resetTestSession}
              disabled={isLoading}
              className="px-3 py-1.5 text-xs bg-amber-100 text-amber-800 rounded hover:bg-amber-200 disabled:opacity-50"
            >
              Reset
            </button>
            <button
              onClick={clearTestSession}
              disabled={isLoading}
              className="px-3 py-1.5 text-xs bg-red-100 text-red-800 rounded hover:bg-red-200 disabled:opacity-50"
            >
              End Test
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Iframe container(s) */}
      <div className={`grid gap-4 ${isPairedStudy ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
        {/* Participant A */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 bg-indigo-100 text-indigo-700 text-xs font-medium rounded-full">
                A
              </span>
              <span className="text-sm font-medium text-gray-700">
                {testSession.participantA.uniqueId}
              </span>
              {testSession.participantA.condition && (
                <span className="text-xs text-gray-500">
                  ({testSession.participantA.condition.name})
                </span>
              )}
            </div>
            <a
              href={getJoinUrl(testSession.participantA)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
            >
              Open in new tab
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
          <iframe
            src={getJoinUrl(testSession.participantA)}
            className="w-full h-[600px] border-0"
            title={`Participant A - ${testSession.participantA.uniqueId}`}
          />
        </div>

        {/* Participant B (for paired studies) */}
        {isPairedStudy && testSession.participantB && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
                  B
                </span>
                <span className="text-sm font-medium text-gray-700">
                  {testSession.participantB.uniqueId}
                </span>
                {testSession.participantB.condition && (
                  <span className="text-xs text-gray-500">
                    ({testSession.participantB.condition.name})
                  </span>
                )}
              </div>
              <a
                href={getJoinUrl(testSession.participantB)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
              >
                Open in new tab
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
            <iframe
              src={getJoinUrl(testSession.participantB)}
              className="w-full h-[600px] border-0"
              title={`Participant B - ${testSession.participantB.uniqueId}`}
            />
          </div>
        )}
      </div>
    </div>
  );
}
