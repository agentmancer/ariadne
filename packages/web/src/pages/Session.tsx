import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSession } from '../context/SessionContext';
import { api } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import StageProgress from '../components/Session/StageProgress';
import WaitingRoom from '../components/Session/WaitingRoom';
import Tutorial from '../components/Session/Tutorial';
import AuthoringPhase from '../components/Session/AuthoringPhase';
import PlayingPhase from '../components/Session/PlayingPhase';
import ExitSurvey from '../components/Session/ExitSurvey';
import Completion from '../components/Session/Completion';

export default function Session() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { participant, partner, stageConfig, isLoading, error, advanceStage, logout, loadSessionForCode } = useSession();

  // Load session for the code in URL
  useEffect(() => {
    if (code && !isLoading) {
      // Try to load existing session for this code
      const loaded = api.loadSession(code);
      if (loaded) {
        loadSessionForCode(code);
      } else if (!api.isAuthenticated()) {
        // No session for this code, redirect to join
        navigate(`/join/${code}`, { replace: true });
      }
    }
  }, [code, isLoading, navigate, loadSessionForCode]);

  if (isLoading || !participant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const currentStage = participant.currentStage;
  const currentStageConfig = stageConfig.find(s => s.stage === currentStage);
  const stageName = currentStageConfig?.name || 'unknown';

  // Determine which component to render based on stage name
  const renderStageContent = () => {
    // Parse stage name to determine component
    const lowerName = stageName.toLowerCase();

    if (lowerName.includes('waiting') || lowerName === 'check_in') {
      return <WaitingRoom partner={partner} onReady={advanceStage} />;
    }

    if (lowerName.includes('tutorial') || lowerName.includes('intro')) {
      return <Tutorial onComplete={advanceStage} />;
    }

    if (lowerName.includes('author') || lowerName.includes('write') || lowerName.includes('create')) {
      const round = extractRound(stageName);
      return <AuthoringPhase round={round} onComplete={advanceStage} />;
    }

    if (lowerName.includes('play') || lowerName.includes('read') || lowerName.includes('review')) {
      const round = extractRound(stageName);
      return <PlayingPhase round={round} onComplete={advanceStage} />;
    }

    if (lowerName.includes('survey') || lowerName.includes('feedback')) {
      return <ExitSurvey onComplete={advanceStage} />;
    }

    if (lowerName.includes('complete') || lowerName.includes('done') || lowerName.includes('finish')) {
      return <Completion />;
    }

    // Default fallback
    return (
      <div className="p-6 text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Stage: {stageName}</h2>
        <p className="text-gray-600 mb-4">Stage {currentStage}</p>
        <button
          onClick={advanceStage}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          Continue
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 safe-area-top">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Study Session</h1>
            <p className="text-sm text-gray-500">
              Participant: {participant.participantId}
            </p>
          </div>
          <button
            onClick={logout}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Leave
          </button>
        </div>
      </header>

      {/* Stage Progress */}
      <StageProgress
        stages={stageConfig}
        currentStage={currentStage}
      />

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2">
          <p className="text-sm text-red-700 text-center">{error}</p>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-4">
          {renderStageContent()}
        </div>
      </main>
    </div>
  );
}

// Helper to extract round number from stage name (e.g., "authoring_1" -> 1)
// Prioritizes numbers at end of string or after keywords like "round_", "authoring_", "play_"
function extractRound(stageName: string): number {
  // Try to match "round_<number>" or phase-specific patterns first
  const patternMatch = stageName.match(/(?:round_|authoring_|play_|phase_)(\d+)\b/i);
  if (patternMatch) {
    return parseInt(patternMatch[1], 10);
  }
  // Fall back to number at end of string
  const endMatch = stageName.match(/(\d+)$/);
  if (endMatch) {
    return parseInt(endMatch[1], 10);
  }
  // Last resort: first number in string
  const anyMatch = stageName.match(/(\d+)/);
  return anyMatch ? parseInt(anyMatch[1], 10) : 1;
}
