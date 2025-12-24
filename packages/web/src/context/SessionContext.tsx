import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, Participant, Partner, StoryData, Comment, SessionState, extractErrorMessage } from '../services/api';

interface SessionContextValue {
  // Auth state
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Session data
  participant: Participant | null;
  partner: Partner | null;
  currentStory: StoryData | null;
  partnerStory: StoryData | null;
  comments: Comment[];
  stageConfig: SessionState['config']['stages'];

  // Actions
  join: (code: string) => Promise<void>;
  checkIn: () => Promise<void>;
  refreshSession: () => Promise<void>;
  advanceStage: () => Promise<void>;
  logout: () => void;
  clearError: () => void;
  loadSessionForCode: (code: string) => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [currentStory, setCurrentStory] = useState<StoryData | null>(null);
  const [partnerStory, setPartnerStory] = useState<StoryData | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [stageConfig, setStageConfig] = useState<SessionState['config']['stages']>([]);

  // Track auth state reactively instead of computing on each render
  const [isAuthenticated, setIsAuthenticated] = useState(() => api.isAuthenticated());

  // Subscribe to auth state changes
  useEffect(() => {
    return api.onAuthChange(setIsAuthenticated);
  }, []);

  // Handle 401 unauthorized events using React Router navigation
  useEffect(() => {
    const handleUnauthorized = () => {
      navigate('/join', { replace: true });
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [navigate]);

  // Load session state
  const refreshSession = useCallback(async () => {
    if (!participant?.id) return;

    try {
      const state = await api.getSessionState(participant.id);
      setParticipant(state.participant);
      setPartner(state.partner);
      setCurrentStory(state.currentStory);
      setPartnerStory(state.partnerStory);
      setComments(state.comments);
      if (state.config?.stages) {
        setStageConfig(state.config.stages);
      }
    } catch (err) {
      console.error('Failed to refresh session:', err);
    }
  }, [participant?.id]);

  // Initial load - check if we have a valid session
  useEffect(() => {
    const init = async () => {
      if (!api.isAuthenticated()) {
        setIsLoading(false);
        return;
      }

      try {
        // Try to check in and get session state
        const { participant: p, partner: ptr } = await api.checkIn();
        setParticipant(p);
        setPartner(ptr);

        // Load full session state
        const state = await api.getSessionState(p.id);
        setCurrentStory(state.currentStory);
        setPartnerStory(state.partnerStory);
        setComments(state.comments);
        if (state.config?.stages) {
          setStageConfig(state.config.stages);
        }
      } catch (err) {
        console.error('Session init failed:', err);
        api.clearAuth();
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, []);

  // Poll for session updates with cleanup to prevent memory leaks
  // Stop polling when not authenticated or on errors
  useEffect(() => {
    if (!participant?.id || !isAuthenticated) return;

    let mounted = true;

    const poll = async () => {
      if (mounted && isAuthenticated) {
        await refreshSession();
      }
    };

    const interval = setInterval(poll, 30000); // Every 30 seconds

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [participant?.id, isAuthenticated, refreshSession]);

  const join = async (code: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const { participant: p } = await api.join(code);
      setParticipant(p);

      // Load full session state
      const state = await api.getSessionState(p.id);
      setPartner(state.partner);
      setCurrentStory(state.currentStory);
      setPartnerStory(state.partnerStory);
      setComments(state.comments);
      if (state.config?.stages) {
        setStageConfig(state.config.stages);
      }
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Failed to join study'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const checkIn = async () => {
    if (!participant?.id) return;

    try {
      const { participant: p, partner: ptr } = await api.checkIn();
      setParticipant(p);
      setPartner(ptr);
    } catch (err) {
      console.error('Check-in failed:', err);
    }
  };

  const advanceStage = async () => {
    if (!participant?.id) return;

    try {
      const updated = await api.advanceStage(participant.id);
      setParticipant(updated);
      await refreshSession();
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Failed to advance stage'));
    }
  };

  const logout = () => {
    api.clearAuth();
    setParticipant(null);
    setPartner(null);
    setCurrentStory(null);
    setPartnerStory(null);
    setComments([]);
    setStageConfig([]);
  };

  const clearError = () => setError(null);

  // Load session state for a specific participant code
  const loadSessionForCode = useCallback(async (code: string) => {
    if (!api.isAuthenticated()) return;

    setIsLoading(true);
    try {
      // Check in and get session state
      const { participant: p, partner: ptr } = await api.checkIn();
      setParticipant(p);
      setPartner(ptr);

      // Load full session state
      const state = await api.getSessionState(p.id);
      setCurrentStory(state.currentStory);
      setPartnerStory(state.partnerStory);
      setComments(state.comments);
      if (state.config?.stages) {
        setStageConfig(state.config.stages);
      }
    } catch (err) {
      console.error('Failed to load session for code:', code, err);
      api.clearAuth();
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <SessionContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        error,
        participant,
        partner,
        currentStory,
        partnerStory,
        comments,
        stageConfig,
        join,
        checkIn,
        refreshSession,
        advanceStage,
        logout,
        clearError,
        loadSessionForCode,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}
