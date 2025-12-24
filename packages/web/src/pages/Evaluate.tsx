import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  api,
  EvaluationInstrument,
  EvaluationSession,
  PassageTriad,
  EvaluationProgress,
  extractErrorMessage,
} from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import {
  PassageRatingPanel,
  RatingInstrument,
  EvaluationProgressBar,
  isInstrumentComplete,
} from '../components/Evaluation';

type EvaluateView = 'loading' | 'start' | 'rating' | 'complete' | 'error';

export default function Evaluate() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  // Core state
  const [view, setView] = useState<EvaluateView>('loading');
  const [error, setError] = useState<string | null>(null);

  // Evaluation data
  const [instrument, setInstrument] = useState<EvaluationInstrument | null>(null);
  const [evaluationSession, setEvaluationSession] = useState<EvaluationSession | null>(null);
  const [currentPassage, setCurrentPassage] = useState<PassageTriad | null>(null);
  const [progress, setProgress] = useState<EvaluationProgress | null>(null);

  // Current rating state
  const [ratings, setRatings] = useState<Record<string, Record<string, number>>>({});
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Track time spent on current passage
  const startTimeRef = useRef<number>(Date.now());

  // Load instrument and check for existing session
  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!sessionId) {
        setError('No session ID provided');
        setView('error');
        return;
      }

      try {
        // Get the FDG 2026 instrument
        const instruments = await api.getInstruments();
        if (cancelled) return;

        const fdgInstrument = instruments.find(i => i.id === 'fdg-2026' || i.name.includes('FDG'));

        if (!fdgInstrument) {
          setError('Evaluation instrument not found');
          setView('error');
          return;
        }

        setInstrument(fdgInstrument);
        setView('start');
      } catch (err) {
        if (cancelled) return;
        setError(extractErrorMessage(err, 'Failed to load evaluation instrument'));
        setView('error');
      }
    }

    init();
    return () => { cancelled = true; };
  }, [sessionId]);

  // Start evaluation
  const handleStartEvaluation = useCallback(async () => {
    if (!sessionId || !instrument) return;

    setView('loading');
    try {
      // Start or resume evaluation session
      const session = await api.startEvaluation(sessionId, instrument.id);
      setEvaluationSession(session);

      // Get first passage
      const passage = await api.getNextPassage(session.id);
      if (!passage) {
        // No passages to rate - session may be complete
        setView('complete');
        return;
      }

      setCurrentPassage(passage);

      // Get progress
      const progressData = await api.getEvaluationProgress(session.id);
      setProgress(progressData);

      // Reset timing
      startTimeRef.current = Date.now();

      setView('rating');
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to start evaluation'));
      setView('error');
    }
  }, [sessionId, instrument]);

  // Submit current rating and load next passage
  const handleSubmitRating = useCallback(async () => {
    if (!evaluationSession || !currentPassage) return;

    setIsSubmitting(true);
    try {
      const timeSpentMs = Date.now() - startTimeRef.current;

      const result = await api.submitRating(evaluationSession.id, {
        passageId: currentPassage.id,
        scaleRatings: ratings,
        openResponses: responses,
        timeSpentMs,
      });

      // Clear ratings for next passage
      setRatings({});
      setResponses({});

      if (result.nextPassage) {
        setCurrentPassage(result.nextPassage);
        startTimeRef.current = Date.now();

        // Update progress
        const progressData = await api.getEvaluationProgress(evaluationSession.id);
        setProgress(progressData);
      } else {
        // No more passages - complete the session
        await api.completeEvaluation(evaluationSession.id);
        setView('complete');
      }
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to submit rating'));
    } finally {
      setIsSubmitting(false);
    }
  }, [evaluationSession, currentPassage, ratings, responses]);

  // Check if current rating is complete
  const isRatingComplete = instrument
    ? isInstrumentComplete(instrument.scales, instrument.openQuestions, ratings, responses)
    : false;

  // Render based on current view
  if (view === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (view === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  if (view === 'start') {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-lg shadow-md p-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Passage Evaluation</h1>
            <p className="text-gray-600 mb-6">
              You will be shown a series of story passages to rate. Each passage consists of:
            </p>
            <ul className="list-disc list-inside text-gray-600 mb-6 space-y-2">
              <li><strong>Previous Scene</strong> - The context before the player's choice</li>
              <li><strong>Player Action</strong> - The choice the player made</li>
              <li><strong>Consequence</strong> - What happened as a result</li>
            </ul>
            <p className="text-gray-600 mb-8">
              For each passage, you'll rate it across several dimensions using standardized scales.
              This typically takes 2-3 minutes per passage.
            </p>

            {instrument && (
              <div className="bg-gray-50 rounded-lg p-4 mb-8">
                <h3 className="font-medium text-gray-900 mb-2">{instrument.name}</h3>
                <p className="text-sm text-gray-600 mb-3">{instrument.description}</p>
                <div className="text-sm text-gray-500">
                  {instrument.scales.length} rating scales, {instrument.openQuestions.length} open questions
                </div>
              </div>
            )}

            <button
              onClick={handleStartEvaluation}
              className="w-full py-3 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors"
            >
              Begin Evaluation
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'complete') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Evaluation Complete!</h2>
          <p className="text-gray-600 mb-6">
            Thank you for completing the passage evaluation. Your ratings have been saved.
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            Return Home
          </button>
        </div>
      </div>
    );
  }

  // Rating view
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 safe-area-top">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">Passage Evaluation</h1>
          <button
            onClick={() => navigate('/')}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Exit Evaluation
          </button>
        </div>
      </header>

      {/* Progress Bar */}
      {progress && (
        <div className="bg-white border-b border-gray-200 px-4 py-3">
          <div className="max-w-6xl mx-auto">
            <EvaluationProgressBar progress={progress} />
          </div>
        </div>
      )}

      {/* Main Content - Two Column Layout */}
      <main className="flex-1 overflow-hidden">
        <div className="max-w-6xl mx-auto h-full p-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
            {/* Left Column - Passage Display */}
            <div className="overflow-auto">
              {currentPassage && (
                <PassageRatingPanel passage={currentPassage} />
              )}
            </div>

            {/* Right Column - Rating Instrument */}
            <div className="overflow-auto">
              {instrument && (
                <>
                  <RatingInstrument
                    scales={instrument.scales}
                    openQuestions={instrument.openQuestions}
                    ratings={ratings}
                    responses={responses}
                    onRatingsChange={setRatings}
                    onResponsesChange={setResponses}
                  />

                  {/* Submit Button */}
                  <div className="mt-6 sticky bottom-0 bg-gray-50 py-4">
                    <button
                      onClick={handleSubmitRating}
                      disabled={!isRatingComplete || isSubmitting}
                      className="w-full py-3 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isSubmitting
                        ? 'Submitting...'
                        : currentPassage && currentPassage.index + 1 < currentPassage.totalCount
                          ? 'Submit & Next Passage'
                          : 'Submit & Complete'}
                    </button>
                    {!isRatingComplete && (
                      <p className="mt-2 text-sm text-gray-500 text-center">
                        Please complete all required ratings before submitting
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Error Toast */}
      {error && (
        <div className="fixed bottom-4 right-4 bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded-lg shadow-lg">
          <div className="flex items-center gap-2">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-700 hover:text-red-900"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
