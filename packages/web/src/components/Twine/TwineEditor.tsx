import { useState, useEffect, useCallback, useRef } from 'react';
import PassageCard from './PassageCard';
import {
  TwineStory,
  TwinePassage,
  TwineEditorProps,
  ValidationIssue,
  createDefaultStory,
  generatePassageId,
  validateStory,
} from './types';

type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

export default function TwineEditor({
  initialStory,
  onStoryChange,
  onReady,
  readOnly = false,
}: TwineEditorProps) {
  const [story, setStory] = useState<TwineStory>(() => initialStory || createDefaultStory());
  const [selectedPassageId, setSelectedPassageId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  const [showValidation, setShowValidation] = useState(false);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasInitialized = useRef(false);

  // Call onReady when component mounts
  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      onReady?.();
    }
  }, [onReady]);

  // Debounced autosave
  const triggerAutosave = useCallback(
    (updatedStory: TwineStory) => {
      setSaveStatus('unsaved');

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        setSaveStatus('saving');
        try {
          onStoryChange(updatedStory);
          setSaveStatus('saved');
        } catch {
          setSaveStatus('error');
        }
      }, 2000); // 2 second debounce
    },
    [onStoryChange]
  );

  // Update story and trigger autosave
  const updateStory = useCallback(
    (updater: (prev: TwineStory) => TwineStory) => {
      setStory((prev) => {
        const updated = updater(prev);
        triggerAutosave(updated);
        return updated;
      });
    },
    [triggerAutosave]
  );

  // Passage operations
  const addPassage = () => {
    const newPassage: TwinePassage = {
      id: generatePassageId(),
      name: `New Passage ${story.passages.length + 1}`,
      text: '',
      position: {
        x: 100 + (story.passages.length % 4) * 150,
        y: 100 + Math.floor(story.passages.length / 4) * 200,
      },
    };

    updateStory((prev) => ({
      ...prev,
      passages: [...prev.passages, newPassage],
    }));

    setSelectedPassageId(newPassage.id);
  };

  const updatePassage = (passageId: string, updates: Partial<TwinePassage>) => {
    updateStory((prev) => ({
      ...prev,
      passages: prev.passages.map((p) =>
        p.id === passageId ? { ...p, ...updates } : p
      ),
    }));
  };

  const deletePassage = (passageId: string) => {
    const passage = story.passages.find((p) => p.id === passageId);
    if (!passage) return;

    // Prevent deleting the last passage
    if (story.passages.length <= 1) {
      alert('Cannot delete the last passage');
      return;
    }

    // Warn if this is the start passage
    if (passage.name === story.startPassage) {
      if (!confirm('This is the start passage. Deleting it will require setting a new start passage. Continue?')) {
        return;
      }
    }

    updateStory((prev) => {
      const newPassages = prev.passages.filter((p) => p.id !== passageId);
      const newStartPassage =
        passage.name === prev.startPassage
          ? newPassages[0]?.name
          : prev.startPassage;

      return {
        ...prev,
        passages: newPassages,
        startPassage: newStartPassage,
      };
    });

    if (selectedPassageId === passageId) {
      setSelectedPassageId(null);
    }
  };

  const setStartPassage = (passageName: string) => {
    updateStory((prev) => ({
      ...prev,
      startPassage: passageName,
    }));
  };

  // Manual save
  const handleManualSave = () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    setSaveStatus('saving');
    try {
      onStoryChange(story);
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    }
  };

  // Validation
  const handleValidate = () => {
    const issues = validateStory(story);
    setValidationIssues(issues);
    setShowValidation(true);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleManualSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [story]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const SaveStatusIndicator = () => {
    const statusConfig = {
      saved: { text: 'Saved', color: 'text-green-600', icon: '✓' },
      saving: { text: 'Saving...', color: 'text-yellow-600', icon: '↻' },
      unsaved: { text: 'Unsaved changes', color: 'text-orange-600', icon: '●' },
      error: { text: 'Save failed', color: 'text-red-600', icon: '✕' },
    };

    const config = statusConfig[saveStatus];

    return (
      <span className={`text-sm ${config.color} flex items-center gap-1`}>
        <span>{config.icon}</span>
        <span>{config.text}</span>
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full bg-gray-100 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="font-medium text-gray-900">{story.name}</h2>
          <span className="text-sm text-gray-500">
            {story.passages.length} passage{story.passages.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <SaveStatusIndicator />

          {!readOnly && (
            <>
              <button
                onClick={handleValidate}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded"
              >
                Validate
              </button>
              <button
                onClick={handleManualSave}
                className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded hover:bg-primary-700"
              >
                Save
              </button>
            </>
          )}
        </div>
      </div>

      {/* Validation panel */}
      {showValidation && (
        <div className="bg-white border-b border-gray-200 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-gray-900">Validation Results</h3>
            <button
              onClick={() => setShowValidation(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
          {validationIssues.length === 0 ? (
            <p className="text-sm text-green-600">No issues found. Story structure looks good!</p>
          ) : (
            <ul className="space-y-1">
              {validationIssues.map((issue, i) => (
                <li
                  key={i}
                  className={`text-sm flex items-start gap-2 ${
                    issue.type === 'error' ? 'text-red-600' : 'text-yellow-600'
                  }`}
                >
                  <span>{issue.type === 'error' ? '✕' : '⚠'}</span>
                  <span>{issue.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Main editor area */}
      <div className="flex-1 overflow-auto p-4">
        {/* Add passage button */}
        {!readOnly && (
          <div className="mb-4">
            <button
              onClick={addPassage}
              className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-primary-400 hover:text-primary-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Passage
            </button>
          </div>
        )}

        {/* Passages grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {story.passages.map((passage) => (
            <PassageCard
              key={passage.id}
              passage={passage}
              isStart={passage.name === story.startPassage}
              isSelected={passage.id === selectedPassageId}
              readOnly={readOnly}
              onSelect={() => setSelectedPassageId(passage.id)}
              onUpdate={(updated) => updatePassage(passage.id, updated)}
              onDelete={() => deletePassage(passage.id)}
              onSetStart={() => setStartPassage(passage.name)}
            />
          ))}
        </div>

        {/* Empty state */}
        {story.passages.length === 0 && (
          <div className="text-center py-12">
            <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-gray-500">No passages yet. Click "Add Passage" to start your story.</p>
          </div>
        )}
      </div>

      {/* Help footer */}
      <div className="bg-white border-t border-gray-200 px-4 py-2 text-xs text-gray-500">
        <span className="font-medium">Tip:</span> Use <code className="bg-gray-100 px-1 rounded">[[Link Text]]</code> or{' '}
        <code className="bg-gray-100 px-1 rounded">[[Display|Target]]</code> to create links between passages.
        Press <kbd className="bg-gray-100 px-1 rounded">Ctrl+S</kbd> to save.
      </div>
    </div>
  );
}
