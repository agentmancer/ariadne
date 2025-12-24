/**
 * Study Settings Form - Edit study basic settings
 */

import { useState, useEffect } from 'react';
import { api, Study, UpdateStudyInput } from '../../services/api';
import { JsonEditor } from '../JsonEditor';

interface StudySettingsFormProps {
  study: Study;
  onUpdate: () => void;
}

type StudyType = Study['type'];

const STUDY_TYPES: { value: StudyType; label: string; description: string }[] = [
  {
    value: 'SINGLE_PARTICIPANT',
    label: 'Single Participant',
    description: 'One participant per session, independent experiences',
  },
  {
    value: 'PAIRED_COLLABORATIVE',
    label: 'Paired Collaborative',
    description: 'Two participants work together on shared content',
  },
  {
    value: 'MULTI_ROUND',
    label: 'Multi-Round',
    description: 'Multiple rounds of interaction with evolving content',
  },
  {
    value: 'CUSTOM',
    label: 'Custom',
    description: 'Flexible configuration for specialized studies',
  },
];

const PHASES = ['AUTHOR', 'PLAY', 'REVIEW'] as const;

interface WorkflowConfig {
  rounds: number;
  phases: typeof PHASES[number][];
  tasksPerRound: number;
  timePerTask: number;
  feedbackRequired: boolean;
  maxPlayActions: number;
  storyConstraints?: {
    genre?: string;
    theme?: string;
    minPassages?: number;
    maxPassages?: number;
  };
}

const DEFAULT_WORKFLOW: WorkflowConfig = {
  rounds: 3,
  phases: ['AUTHOR', 'PLAY', 'REVIEW'],
  tasksPerRound: 1,
  timePerTask: 15,
  feedbackRequired: true,
  maxPlayActions: 20,
};

export function StudySettingsForm({ study, onUpdate }: StudySettingsFormProps) {
  const [name, setName] = useState(study.name);
  const [description, setDescription] = useState(study.description || '');
  const [studyType, setStudyType] = useState<StudyType>(study.type);
  const [config, setConfig] = useState<Record<string, unknown>>(study.config || {});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Workflow configuration - extracted from config for easier editing
  const [workflow, setWorkflow] = useState<WorkflowConfig>(() => {
    const cfg = study.config || {};
    return {
      rounds: (cfg.rounds as number) || DEFAULT_WORKFLOW.rounds,
      phases: (cfg.phases as typeof PHASES[number][]) || DEFAULT_WORKFLOW.phases,
      tasksPerRound: (cfg.tasksPerRound as number) || DEFAULT_WORKFLOW.tasksPerRound,
      timePerTask: (cfg.timePerTask as number) || DEFAULT_WORKFLOW.timePerTask,
      feedbackRequired: cfg.feedbackRequired !== undefined ? (cfg.feedbackRequired as boolean) : DEFAULT_WORKFLOW.feedbackRequired,
      maxPlayActions: (cfg.maxPlayActions as number) || DEFAULT_WORKFLOW.maxPlayActions,
      storyConstraints: cfg.storyConstraints as WorkflowConfig['storyConstraints'],
    };
  });

  // Show workflow config for multi-round and collaborative studies
  const showWorkflowConfig = studyType === 'MULTI_ROUND' || studyType === 'PAIRED_COLLABORATIVE';

  // Reset form when study changes
  useEffect(() => {
    setName(study.name);
    setDescription(study.description || '');
    setStudyType(study.type);
    setConfig(study.config || {});
    // Reset workflow from config
    const cfg = study.config || {};
    setWorkflow({
      rounds: (cfg.rounds as number) || DEFAULT_WORKFLOW.rounds,
      phases: (cfg.phases as typeof PHASES[number][]) || DEFAULT_WORKFLOW.phases,
      tasksPerRound: (cfg.tasksPerRound as number) || DEFAULT_WORKFLOW.tasksPerRound,
      timePerTask: (cfg.timePerTask as number) || DEFAULT_WORKFLOW.timePerTask,
      feedbackRequired: cfg.feedbackRequired !== undefined ? (cfg.feedbackRequired as boolean) : DEFAULT_WORKFLOW.feedbackRequired,
      maxPlayActions: (cfg.maxPlayActions as number) || DEFAULT_WORKFLOW.maxPlayActions,
      storyConstraints: cfg.storyConstraints as WorkflowConfig['storyConstraints'],
    });
  }, [study]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!name.trim()) {
      setError('Study name is required');
      return;
    }

    setIsSaving(true);
    try {
      // Merge workflow config into the main config for workflow-enabled study types
      const mergedConfig = showWorkflowConfig
        ? {
            ...config,
            rounds: workflow.rounds,
            phases: workflow.phases,
            tasksPerRound: workflow.tasksPerRound,
            timePerTask: workflow.timePerTask,
            feedbackRequired: workflow.feedbackRequired,
            maxPlayActions: workflow.maxPlayActions,
            ...(workflow.storyConstraints && { storyConstraints: workflow.storyConstraints }),
          }
        : config;

      const data: UpdateStudyInput = {
        name: name.trim(),
        description: description.trim() || undefined,
        type: studyType,
        config: Object.keys(mergedConfig).length > 0 ? mergedConfig : undefined,
      };
      await api.updateStudy(study.id, data);
      setSuccess('Settings saved successfully');
      onUpdate();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save settings';
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  // Build merged config for comparison
  const currentMergedConfig = showWorkflowConfig
    ? { ...config, rounds: workflow.rounds, phases: workflow.phases, tasksPerRound: workflow.tasksPerRound, timePerTask: workflow.timePerTask, feedbackRequired: workflow.feedbackRequired, maxPlayActions: workflow.maxPlayActions }
    : config;

  const hasChanges =
    name !== study.name ||
    description !== (study.description || '') ||
    studyType !== study.type ||
    JSON.stringify(currentMergedConfig) !== JSON.stringify(study.config || {});

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
          {error}
        </div>
      )}
      {success && (
        <div className="p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg">
          {success}
        </div>
      )}

      {/* Basic Details */}
      <section className="bg-white rounded-lg p-4 lg:p-6 shadow-sm">
        <h2 className="font-semibold text-gray-800 mb-4">Basic Details</h2>

        <div className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Study Name <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              disabled={isSaving}
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              disabled={isSaving}
              placeholder="Brief description of the study's purpose and goals..."
            />
          </div>
        </div>
      </section>

      {/* Study Type */}
      <section className="bg-white rounded-lg p-4 lg:p-6 shadow-sm">
        <h2 className="font-semibold text-gray-800 mb-4">Study Type</h2>

        <div className="space-y-3">
          {STUDY_TYPES.map((type) => (
            <label
              key={type.value}
              className={`block p-4 border rounded-lg cursor-pointer transition-colors ${
                studyType === type.value
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300'
              } ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="studyType"
                  value={type.value}
                  checked={studyType === type.value}
                  onChange={(e) => setStudyType(e.target.value as StudyType)}
                  className="mt-1"
                  disabled={isSaving}
                />
                <div>
                  <span className="font-medium text-gray-900">{type.label}</span>
                  <p className="text-sm text-gray-500 mt-0.5">{type.description}</p>
                </div>
              </div>
            </label>
          ))}
        </div>
      </section>

      {/* Workflow Configuration - shown for multi-round and collaborative studies */}
      {showWorkflowConfig && (
        <section className="bg-white rounded-lg p-4 lg:p-6 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-4">Workflow Configuration</h2>
          <p className="text-sm text-gray-500 mb-4">
            Configure the rounds, timing, and phases for this study.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Number of Rounds */}
            <div>
              <label htmlFor="rounds" className="block text-sm font-medium text-gray-700 mb-1">
                Number of Rounds
              </label>
              <input
                id="rounds"
                type="number"
                min="1"
                max="10"
                value={workflow.rounds}
                onChange={(e) => setWorkflow(prev => ({ ...prev, rounds: parseInt(e.target.value, 10) || 1 }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                disabled={isSaving}
              />
              <p className="text-xs text-gray-500 mt-1">How many author-play-review cycles</p>
            </div>

            {/* Tasks per Round */}
            <div>
              <label htmlFor="tasksPerRound" className="block text-sm font-medium text-gray-700 mb-1">
                Tasks per Round
              </label>
              <input
                id="tasksPerRound"
                type="number"
                min="1"
                max="10"
                value={workflow.tasksPerRound}
                onChange={(e) => setWorkflow(prev => ({ ...prev, tasksPerRound: parseInt(e.target.value, 10) || 1 }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                disabled={isSaving}
              />
              <p className="text-xs text-gray-500 mt-1">Number of tasks in each round</p>
            </div>

            {/* Time per Task */}
            <div>
              <label htmlFor="timePerTask" className="block text-sm font-medium text-gray-700 mb-1">
                Time per Task (minutes)
              </label>
              <input
                id="timePerTask"
                type="number"
                min="1"
                max="120"
                value={workflow.timePerTask}
                onChange={(e) => setWorkflow(prev => ({ ...prev, timePerTask: parseInt(e.target.value, 10) || 15 }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                disabled={isSaving}
              />
              <p className="text-xs text-gray-500 mt-1">Suggested time for each task</p>
            </div>

            {/* Max Play Actions */}
            <div>
              <label htmlFor="maxPlayActions" className="block text-sm font-medium text-gray-700 mb-1">
                Max Play Actions
              </label>
              <input
                id="maxPlayActions"
                type="number"
                min="5"
                max="100"
                value={workflow.maxPlayActions}
                onChange={(e) => setWorkflow(prev => ({ ...prev, maxPlayActions: parseInt(e.target.value, 10) || 20 }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                disabled={isSaving}
              />
              <p className="text-xs text-gray-500 mt-1">Maximum actions during play phase</p>
            </div>
          </div>

          {/* Phases */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Phases per Round
            </label>
            <div className="flex flex-wrap gap-3">
              {PHASES.map((phase) => (
                <label key={phase} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={workflow.phases.includes(phase)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setWorkflow(prev => ({ ...prev, phases: [...prev.phases, phase].sort((a, b) => PHASES.indexOf(a) - PHASES.indexOf(b)) }));
                      } else {
                        setWorkflow(prev => ({ ...prev, phases: prev.phases.filter(p => p !== phase) }));
                      }
                    }}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    disabled={isSaving}
                  />
                  <span className="text-sm text-gray-700">{phase}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1">Which phases to include in each round</p>
          </div>

          {/* Feedback Required */}
          <div className="mt-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={workflow.feedbackRequired}
                onChange={(e) => setWorkflow(prev => ({ ...prev, feedbackRequired: e.target.checked }))}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                disabled={isSaving}
              />
              <span className="text-sm font-medium text-gray-700">Require feedback after each round</span>
            </label>
          </div>

          {/* Story Constraints */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <h3 className="text-sm font-medium text-gray-800 mb-3">Story Constraints (Optional)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="genre" className="block text-sm font-medium text-gray-700 mb-1">
                  Genre
                </label>
                <input
                  id="genre"
                  type="text"
                  value={workflow.storyConstraints?.genre || ''}
                  onChange={(e) => setWorkflow(prev => ({
                    ...prev,
                    storyConstraints: { ...prev.storyConstraints, genre: e.target.value || undefined }
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="e.g., Fantasy, Sci-Fi, Mystery"
                  disabled={isSaving}
                />
              </div>
              <div>
                <label htmlFor="theme" className="block text-sm font-medium text-gray-700 mb-1">
                  Theme
                </label>
                <input
                  id="theme"
                  type="text"
                  value={workflow.storyConstraints?.theme || ''}
                  onChange={(e) => setWorkflow(prev => ({
                    ...prev,
                    storyConstraints: { ...prev.storyConstraints, theme: e.target.value || undefined }
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="e.g., Redemption, Discovery"
                  disabled={isSaving}
                />
              </div>
              <div>
                <label htmlFor="minPassages" className="block text-sm font-medium text-gray-700 mb-1">
                  Min Passages
                </label>
                <input
                  id="minPassages"
                  type="number"
                  min="1"
                  value={workflow.storyConstraints?.minPassages || ''}
                  onChange={(e) => setWorkflow(prev => ({
                    ...prev,
                    storyConstraints: { ...prev.storyConstraints, minPassages: parseInt(e.target.value, 10) || undefined }
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Minimum story passages"
                  disabled={isSaving}
                />
              </div>
              <div>
                <label htmlFor="maxPassages" className="block text-sm font-medium text-gray-700 mb-1">
                  Max Passages
                </label>
                <input
                  id="maxPassages"
                  type="number"
                  min="1"
                  value={workflow.storyConstraints?.maxPassages || ''}
                  onChange={(e) => setWorkflow(prev => ({
                    ...prev,
                    storyConstraints: { ...prev.storyConstraints, maxPassages: parseInt(e.target.value, 10) || undefined }
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Maximum story passages"
                  disabled={isSaving}
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Advanced Configuration */}
      <section className="bg-white rounded-lg p-4 lg:p-6 shadow-sm">
        <h2 className="font-semibold text-gray-800 mb-4">Advanced Configuration</h2>
        <p className="text-sm text-gray-500 mb-4">
          Additional configuration for this study. This JSON object will be available to plugins and integrations.
          {showWorkflowConfig && ' Workflow settings above are automatically included.'}
        </p>
        <JsonEditor
          value={config}
          onChange={setConfig}
          disabled={isSaving}
          minHeight="150px"
        />
      </section>

      {/* Save Button */}
      <div className="flex justify-end gap-3">
        <button
          type="submit"
          disabled={isSaving || !hasChanges}
          className="px-6 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}
