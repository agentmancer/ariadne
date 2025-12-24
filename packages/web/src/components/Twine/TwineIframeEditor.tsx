import { useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import { TwineStory, createDefaultStory } from './types';

// Ariadne event types from the Twine integration
export type AriadneEventType =
  | 'SESSION_START'
  | 'SESSION_END'
  | 'NAVIGATE'
  | 'MAKE_CHOICE'
  | 'CHANGE_PASSAGE'
  | 'REWIND_PASSAGE'
  | 'STORY_UPDATE'
  | 'COMMENT'
  | 'CLOSE_EDITOR'
  | 'DOM_MUTATION'
  | 'VARIABLE_CHANGE'
  | 'INTERACTION'
  | 'TIMED_EVENT'
  | 'INPUT_CHANGE';

export interface AriadneEventData {
  type: AriadneEventType;
  timestamp: string;
  passageTitle?: string;
  content?: string;
  metadata?: {
    fromPassage?: string;
    toPassage?: string;
    passageId?: string;
    passageName?: string;
    action?: string;
    choiceIndex?: number;
    choiceText?: string;
    targetPassage?: string;
    variableName?: string;
    oldValue?: unknown;
    newValue?: unknown;
    macroType?: string;
    elementSelector?: string;
    mutationType?: 'replace' | 'append' | 'prepend' | 'remove';
    inputType?: string;
    inputValue?: string;
  };
}

interface TwineIframeEditorProps {
  /** Initial story content */
  initialStory?: TwineStory;
  /** Called on story changes */
  onStoryChange: (story: TwineStory) => void;
  /** Called when editor is ready */
  onReady?: () => void;
  /** Called when a Ariadne event is emitted (for research tracking) */
  onAriadneEvent?: (event: AriadneEventData) => void;
  /** Read-only mode */
  readOnly?: boolean;
  /** Twine editor URL (defaults to self-hosted Twine) */
  editorUrl?: string;
  /** Mode: 'edit' for authoring, 'play' for playtest/playback */
  mode?: 'edit' | 'play';
}

/** Ref handle for controlling the Twine editor imperatively */
export interface TwineIframeEditorRef {
  /** Start playtest mode */
  startPlaytest: () => void;
  /** Stop playtest mode */
  stopPlaytest: () => void;
  /** Load a story into the editor */
  loadStory: (story: TwineStory) => void;
  /** Get the current story (requests it from iframe) */
  getStory: () => void;
  /** Set edit/play mode */
  setMode: (mode: 'edit' | 'play') => void;
}

type MessageType =
  | { type: 'twine:ready'; payload?: { version: string; features: string[] } }
  | { type: 'twine:story-changed'; payload?: TwineStory; story?: TwineStory }
  | { type: 'twine:event'; payload: AriadneEventData }
  | { type: 'twine:variable-update'; payload: { name: string; value: unknown } }
  | { type: 'twine:dom-mutation'; payload: unknown }
  | { type: 'twine:error'; payload?: { message: string }; error?: string };

/**
 * Embeds the Twine editor in an iframe for full Twine functionality.
 * Communicates via postMessage API.
 *
 * Note: This requires the Twine editor to support postMessage communication.
 * Uses self-hosted Twine with Ariadne integration for research event tracking.
 */
const TwineIframeEditor = forwardRef<TwineIframeEditorRef, TwineIframeEditorProps>(function TwineIframeEditor({
  initialStory,
  onStoryChange,
  onReady,
  onAriadneEvent,
  readOnly = false,
  editorUrl = '/twine/index.html', // Self-hosted Twine with messaging support
  mode = 'edit',
}, ref) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasInitialized = useRef(false);

  // Send message to iframe
  const sendMessage = useCallback((type: string, payload?: unknown) => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        { type, payload },
        '*' // In production, specify exact origin
      );
    }
  }, []);

  // Handle messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent<MessageType>) => {
      // In production, validate event.origin
      const { data } = event;

      if (!data || typeof data !== 'object' || !('type' in data)) return;

      switch (data.type) {
        case 'twine:ready':
          setIsLoading(false);
          if (!hasInitialized.current) {
            hasInitialized.current = true;
            // Send initial story to iframe
            const story = initialStory || createDefaultStory();
            sendMessage('twine:load-story', story);
            // Set mode (edit/play)
            sendMessage('twine:set-mode', { mode });
            onReady?.();
          }
          break;

        case 'twine:story-changed':
          // Support both payload and legacy story field
          const changedStory = data.payload || data.story;
          if (changedStory) {
            onStoryChange(changedStory);
          }
          break;

        case 'twine:event':
          // Ariadne research event - forward to callback
          if (data.payload && onAriadneEvent) {
            onAriadneEvent(data.payload);
          }
          break;

        case 'twine:variable-update':
          // Variable change event - wrap as Ariadne event
          if (data.payload && onAriadneEvent) {
            onAriadneEvent({
              type: 'VARIABLE_CHANGE',
              timestamp: new Date().toISOString(),
              metadata: {
                variableName: data.payload.name,
                newValue: data.payload.value,
              },
            });
          }
          break;

        case 'twine:dom-mutation':
          // DOM mutation event - already handled as twine:event usually
          break;

        case 'twine:error':
          const errorMessage = data.payload?.message || data.error || 'Unknown error in Twine editor';
          setError(errorMessage);
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [initialStory, onStoryChange, onReady, onAriadneEvent, sendMessage, mode]);

  // Send read-only state to iframe when it changes
  useEffect(() => {
    if (!isLoading) {
      sendMessage('twine:set-readonly', readOnly);
    }
  }, [readOnly, isLoading, sendMessage]);

  // Expose imperative methods via ref
  useImperativeHandle(ref, () => ({
    startPlaytest: () => {
      sendMessage('twine:start-playtest', {});
    },
    stopPlaytest: () => {
      sendMessage('twine:stop-playtest', {});
    },
    loadStory: (story: TwineStory) => {
      sendMessage('twine:load-story', story);
    },
    getStory: () => {
      sendMessage('twine:get-story', {});
    },
    setMode: (newMode: 'edit' | 'play') => {
      sendMessage('twine:set-mode', { mode: newMode });
    },
  }), [sendMessage]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-100 p-8">
        <div className="bg-white rounded-lg shadow-md p-6 max-w-md text-center">
          <svg className="w-12 h-12 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Editor Error</h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => {
              setError(null);
              setIsLoading(true);
              hasInitialized.current = false;
              if (iframeRef.current) {
                iframeRef.current.src = editorUrl;
              }
            }}
            className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading Twine editor...</p>
          </div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={editorUrl}
        className="w-full h-full border-0"
        title="Twine Editor"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        onError={() => setError('Failed to load Twine editor')}
      />
    </div>
  );
});

export default TwineIframeEditor;
