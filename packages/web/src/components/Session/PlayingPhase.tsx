import { useState, useCallback, useMemo } from 'react';
import { useSession } from '../../context/SessionContext';
import { api, CommentType } from '../../services/api';
import { TwinePlayer, FeedbackPanel, TwineStory, isTwineStory } from '../Twine';

interface PlayingPhaseProps {
  round: number;
  onComplete: () => void;
}

export default function PlayingPhase({ round, onComplete }: PlayingPhaseProps) {
  const { partnerStory, comments, participant, refreshSession } = useSession();
  const [currentPassage, setCurrentPassage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [storyComplete, setStoryComplete] = useState(false);

  // Parse story content using type guard for runtime validation
  const story = useMemo((): TwineStory | null => {
    if (!partnerStory?.content) {
      return null;
    }

    // Use type guard for safe runtime type checking
    if (isTwineStory(partnerStory.content)) {
      return partnerStory.content;
    }

    return null;
  }, [partnerStory?.content]);

  // Handle passage navigation
  const handlePassageChange = useCallback(async (passageName: string, fromPassage?: string) => {
    setCurrentPassage(passageName);
    setTrackingError(null);

    // Log navigation event
    if (participant?.id) {
      try {
        await api.logEvent(participant.id, 'NAVIGATE', {
          fromPassage,
          toPassage: passageName,
          round,
        });
      } catch (err) {
        console.error('Failed to log navigation:', err);
        setTrackingError('Some activity may not be recorded');
      }
    }
  }, [participant?.id, round]);

  // Handle choice selection
  const handleChoice = useCallback(async (choice: {
    passageName: string;
    choiceIndex: number;
    choiceText: string;
    targetPassage: string;
  }) => {
    if (participant?.id) {
      try {
        await api.logEvent(participant.id, 'MAKE_CHOICE', {
          ...choice,
          round,
        });
      } catch (err) {
        console.error('Failed to log choice:', err);
        setTrackingError('Some activity may not be recorded');
      }
    }
  }, [participant?.id, round]);

  // Handle story completion
  const handleStoryComplete = useCallback(async (history: string[]) => {
    setStoryComplete(true);

    if (participant?.id) {
      try {
        await api.logEvent(participant.id, 'STORY_COMPLETE', {
          passagesVisited: history.length,
          uniquePassages: new Set(history).size,
          round,
        });
      } catch (err) {
        console.error('Failed to log completion:', err);
        setTrackingError('Some activity may not be recorded');
      }
    }
  }, [participant?.id, round]);

  // Handle adding comment
  const handleAddComment = useCallback(async (
    content: string,
    type: CommentType,
    passageName?: string
  ) => {
    if (!participant?.id) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await api.addComment(participant.id, {
        content,
        passageName,
        type,
      });
      await refreshSession();
    } catch (err) {
      console.error('Failed to add comment:', err);
      setError('Failed to add comment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [participant?.id, refreshSession]);

  // No story available
  if (!story) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Playing Phase - Round {round}
              </h2>
              <p className="text-sm text-gray-500">
                Explore your partner's story and leave feedback
              </p>
            </div>
            <button
              onClick={onComplete}
              className="px-4 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700"
            >
              Skip & Continue
            </button>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center bg-gray-100">
          <div className="text-center p-8">
            <div className="w-16 h-16 bg-gray-200 rounded-lg mx-auto mb-4 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Waiting for Partner's Story
            </h3>
            <p className="text-gray-500 text-sm max-w-sm">
              Your partner hasn't submitted their story yet.
              Check back later or continue to the next phase.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Playing Phase - Round {round}
            </h2>
            <p className="text-sm text-gray-500">
              Explore your partner's story and leave feedback
            </p>
          </div>
          <div className="flex items-center gap-3">
            {error && (
              <span className="text-sm text-red-600">{error}</span>
            )}
            {trackingError && !error && (
              <span className="text-sm text-amber-600">{trackingError}</span>
            )}
            {storyComplete && (
              <span className="text-sm text-green-600 flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Story explored
              </span>
            )}
            <button
              onClick={onComplete}
              disabled={isSubmitting}
              className="px-4 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              Complete & Continue
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Story player */}
        <div className="flex-1 overflow-hidden">
          <TwinePlayer
            story={story}
            onPassageChange={handlePassageChange}
            onChoice={handleChoice}
            onComplete={handleStoryComplete}
            showHistory={true}
          />
        </div>

        {/* Feedback panel */}
        <div className="w-80 border-l border-gray-200 overflow-hidden">
          <FeedbackPanel
            comments={comments}
            currentPassage={currentPassage}
            round={round}
            onAddComment={handleAddComment}
            filterByPassage={false}
          />
        </div>
      </div>
    </div>
  );
}
