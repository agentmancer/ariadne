import { useState, useCallback, useRef } from 'react';
import { useSession } from '../../context/SessionContext';
import { TwineEditor, TwineIframeEditor } from '../Twine';
import { TwineStory, TwineEditorType, createDefaultStory } from '../Twine/types';
import { api } from '../../services/api';

interface AuthoringPhaseProps {
  round: number;
  onComplete: () => void;
  /** Editor type: 'custom' for simplified React editor, 'iframe' for full Twine */
  editorType?: TwineEditorType;
  /** URL for iframe editor (only used when editorType is 'iframe') */
  editorUrl?: string;
}

export default function AuthoringPhase({
  round,
  onComplete,
  editorType = 'custom',
  editorUrl,
}: AuthoringPhaseProps) {
  const { currentStory, participant, refreshSession } = useSession();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const storyRef = useRef<TwineStory | null>(null);

  // Initialize story from currentStory.content or create default
  const getInitialStory = useCallback((): TwineStory => {
    if (currentStory?.content && typeof currentStory.content === 'object') {
      // Validate it looks like a TwineStory
      const content = currentStory.content as Record<string, unknown>;
      if (Array.isArray(content.passages)) {
        return content as unknown as TwineStory;
      }
    }
    return createDefaultStory(`Story - Round ${round}`);
  }, [currentStory?.content, round]);

  // Handle story changes from editor (for autosave)
  const handleStoryChange = useCallback((story: TwineStory) => {
    storyRef.current = story;
    // The TwineEditor handles its own debounced autosave display
    // We just track the latest story state here
  }, []);

  // Save story to backend
  const saveStory = async (story: TwineStory): Promise<boolean> => {
    if (!participant?.id) return false;

    try {
      // Step 1: Get presigned upload URL from API
      const { id: storyId, uploadUrl } = await api.saveStory(
        participant.id,
        'twine',
        story.name || `Story - Round ${round}`
      );

      // Step 2: Upload story content directly to S3
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(story),
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload story content to S3');
      }

      // Step 3: Confirm upload completed
      await api.confirmStory(participant.id, storyId);

      // Step 4: Refresh session to get updated story data
      await refreshSession();
      return true;
    } catch (err) {
      console.error('Failed to save story:', err);
      throw err;
    }
  };

  const handleComplete = async () => {
    const story = storyRef.current;
    if (!story) {
      // If no changes made, just continue
      onComplete();
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      await saveStory(story);
      onComplete();
    } catch {
      setSaveError('Failed to save story. Please try again before continuing.');
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Authoring Phase - Round {round}
            </h2>
            <p className="text-sm text-gray-500">
              Create your interactive story using passages and links
            </p>
          </div>
          <div className="flex items-center gap-3">
            {saveError && (
              <span className="text-sm text-red-600">{saveError}</span>
            )}
            <button
              onClick={handleComplete}
              disabled={isSaving}
              className="px-4 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Complete & Continue'}
            </button>
          </div>
        </div>
      </div>

      {/* Twine Editor - configurable type */}
      <div className="flex-1 overflow-hidden">
        {editorType === 'iframe' ? (
          <TwineIframeEditor
            initialStory={getInitialStory()}
            onStoryChange={handleStoryChange}
            onReady={() => {
              storyRef.current = getInitialStory();
            }}
            editorUrl={editorUrl}
          />
        ) : (
          <TwineEditor
            initialStory={getInitialStory()}
            onStoryChange={handleStoryChange}
            onReady={() => {
              storyRef.current = getInitialStory();
            }}
          />
        )}
      </div>
    </div>
  );
}
