import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSession } from '../context/SessionContext';
import { api } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';

export default function Join() {
  const { code: urlCode } = useParams<{ code?: string }>();
  const navigate = useNavigate();
  const { join, isAuthenticated, isLoading, error, clearError } = useSession();
  const [code, setCode] = useState(urlCode || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Track if auto-join has been attempted to prevent duplicate calls
  const autoJoinAttempted = useRef(false);

  const handleJoin = useCallback(async (joinCode: string) => {
    if (!joinCode.trim()) return;

    setIsSubmitting(true);
    clearError();

    try {
      const trimmedCode = joinCode.trim();
      await join(trimmedCode);
      // Navigate to session with code in URL for multi-participant support
      navigate(`/session/${trimmedCode}`, { replace: true });
    } catch {
      // Error is handled by context
    } finally {
      setIsSubmitting(false);
    }
  }, [join, navigate, clearError]);

  // If already authenticated, redirect to session with current code
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      const currentCode = api.getCurrentCode();
      if (currentCode) {
        navigate(`/session/${currentCode}`, { replace: true });
      }
    }
  }, [isAuthenticated, isLoading, navigate]);

  // Auto-join if code is in URL (only once)
  useEffect(() => {
    if (urlCode && !isAuthenticated && !isLoading && !autoJoinAttempted.current) {
      autoJoinAttempted.current = true;
      handleJoin(urlCode);
    }
  }, [urlCode, isAuthenticated, isLoading, handleJoin]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleJoin(code);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-lg shadow-md p-8">
          <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">
            Join Study
          </h1>
          <p className="text-center text-gray-600 mb-6">
            Enter your participant code to begin
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1">
                Participant Code
              </label>
              <input
                type="text"
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Enter your code"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors"
                disabled={isSubmitting}
                autoFocus
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !code.trim()}
              className="w-full py-2 px-4 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center">
                  <LoadingSpinner size="sm" className="mr-2" />
                  Joining...
                </span>
              ) : (
                'Join Study'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-500 mt-4">
          Contact your researcher if you need assistance
        </p>
      </div>
    </div>
  );
}
