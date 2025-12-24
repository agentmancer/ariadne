/**
 * Survey Builder - Full survey editor with question management
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useSurvey } from '../hooks/useSurvey';
import { api, Question, QuestionType, SurveyTiming } from '../services/api';
import { LoadingSpinner, PageContainer } from '../components';

// Generate unique ID for new questions
const generateId = () => `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const TIMING_OPTIONS: { value: SurveyTiming; label: string }[] = [
  { value: 'PRE_STUDY', label: 'Pre-Study' },
  { value: 'POST_TASK', label: 'Post-Task' },
  { value: 'EXIT', label: 'Exit' },
  { value: 'CUSTOM', label: 'Custom' },
];

const QUESTION_TYPES: { value: QuestionType; label: string; description: string }[] = [
  { value: 'TEXT', label: 'Short Text', description: 'Single line text input' },
  { value: 'TEXTAREA', label: 'Long Text', description: 'Multi-line text area' },
  { value: 'MULTIPLE_CHOICE', label: 'Multiple Choice', description: 'Select one option' },
  { value: 'CHECKBOX', label: 'Checkboxes', description: 'Select multiple options' },
  { value: 'LIKERT', label: 'Likert Scale', description: 'Agreement scale (1-5, 1-7, etc.)' },
  { value: 'SCALE', label: 'Numeric Scale', description: 'Custom numeric range' },
  { value: 'NUMBER', label: 'Number', description: 'Numeric input' },
  { value: 'EMAIL', label: 'Email', description: 'Email address input' },
];

const createDefaultQuestion = (type: QuestionType): Question => {
  const base: Question = {
    id: generateId(),
    type,
    text: '',
    required: false,
  };

  switch (type) {
    case 'MULTIPLE_CHOICE':
    case 'CHECKBOX':
      return { ...base, options: ['Option 1', 'Option 2'] };
    case 'LIKERT':
      return { ...base, scale: 5, labels: { min: 'Strongly Disagree', max: 'Strongly Agree' } };
    case 'SCALE':
      return { ...base, min: 1, max: 10, labels: { min: 'Low', max: 'High' } };
    case 'NUMBER':
      return { ...base, min: 0, max: 100 };
    case 'TEXT':
    case 'TEXTAREA':
    case 'EMAIL':
      return { ...base, placeholder: '' };
    default:
      return base;
  }
};

export function SurveyBuilder() {
  const { studyId, surveyId } = useParams<{ studyId: string; surveyId?: string }>();
  const navigate = useNavigate();
  const { survey, isLoading, error, updateSurvey } = useSurvey(surveyId);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [timing, setTiming] = useState<SurveyTiming>('PRE_STUDY');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);

  // Initialize form from survey data
  useEffect(() => {
    if (survey) {
      setName(survey.name);
      setDescription(survey.description || '');
      setTiming(survey.timing);
      setQuestions(survey.questions || []);
    }
  }, [survey]);

  const handleSave = async () => {
    if (!name.trim()) {
      setSaveError('Survey name is required');
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      if (surveyId) {
        await updateSurvey({
          name: name.trim(),
          description: description.trim() || undefined,
          timing,
          questions,
        });
      } else {
        const newSurvey = await api.createSurvey({
          studyId: studyId!,
          name: name.trim(),
          description: description.trim() || undefined,
          timing,
          questions,
        });
        navigate(`/studies/${studyId}/surveys/${newSurvey.id}/edit`, { replace: true });
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save survey';
      setSaveError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const addQuestion = (type: QuestionType) => {
    const newQuestion = createDefaultQuestion(type);
    setQuestions(prev => [...prev, newQuestion]);
    setExpandedQuestion(newQuestion.id);
  };

  const updateQuestion = useCallback((id: string, updates: Partial<Question>) => {
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, ...updates } : q));
  }, []);

  const removeQuestion = (id: string) => {
    setQuestions(prev => prev.filter(q => q.id !== id));
    if (expandedQuestion === id) {
      setExpandedQuestion(null);
    }
  };

  const moveQuestion = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= questions.length) return;

    const newQuestions = [...questions];
    [newQuestions[index], newQuestions[newIndex]] = [newQuestions[newIndex], newQuestions[index]];
    setQuestions(newQuestions);
  };

  if (isLoading && surveyId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner size="lg" text="Loading survey..." />
      </div>
    );
  }

  if (error && surveyId) {
    return (
      <PageContainer title="Error" subtitle="Failed to load survey">
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
          {error}
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title={surveyId ? 'Edit Survey' : 'New Survey'}
      subtitle={survey?.name || 'Create a new survey'}
    >
      {/* Back link */}
      <Link
        to={`/study/${studyId}`}
        className="inline-flex items-center gap-2 text-primary-600 mb-6"
      >
        ← Back to Study
      </Link>

      <div className="max-w-3xl space-y-6">
        {/* Status Messages */}
        {saveError && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
            {saveError}
          </div>
        )}
        {saveSuccess && (
          <div className="p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg">
            Survey saved successfully!
          </div>
        )}

        {/* Basic Info */}
        <section className="bg-white rounded-lg p-4 lg:p-6 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-4">Survey Details</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="e.g., Demographics Survey"
                disabled={isSaving}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                placeholder="Brief description of this survey..."
                disabled={isSaving}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Timing
              </label>
              <select
                value={timing}
                onChange={(e) => setTiming(e.target.value as SurveyTiming)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                disabled={isSaving}
              >
                {TIMING_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Questions */}
        <section className="bg-white rounded-lg p-4 lg:p-6 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold text-gray-800">Questions</h2>
            <span className="text-sm text-gray-500">{questions.length} questions</span>
          </div>

          {/* Question List */}
          {questions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No questions yet. Add your first question below.</p>
            </div>
          ) : (
            <div className="space-y-3 mb-6">
              {questions.map((question, index) => (
                <QuestionCard
                  key={question.id}
                  question={question}
                  index={index}
                  isExpanded={expandedQuestion === question.id}
                  onToggle={() => setExpandedQuestion(expandedQuestion === question.id ? null : question.id)}
                  onUpdate={(updates) => updateQuestion(question.id, updates)}
                  onRemove={() => removeQuestion(question.id)}
                  onMoveUp={() => moveQuestion(index, 'up')}
                  onMoveDown={() => moveQuestion(index, 'down')}
                  canMoveUp={index > 0}
                  canMoveDown={index < questions.length - 1}
                  disabled={isSaving}
                />
              ))}
            </div>
          )}

          {/* Add Question */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Add Question</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {QUESTION_TYPES.map(type => (
                <button
                  key={type.value}
                  onClick={() => addQuestion(type.value)}
                  disabled={isSaving}
                  className="p-3 text-left border border-gray-200 rounded-lg hover:border-primary-300 hover:bg-primary-50 transition-colors disabled:opacity-50"
                >
                  <span className="block text-sm font-medium text-gray-900">{type.label}</span>
                  <span className="block text-xs text-gray-500 mt-0.5">{type.description}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Save Button */}
        <div className="flex justify-end gap-3">
          <Link
            to={`/study/${studyId}`}
            className="px-6 py-2 text-gray-700 bg-gray-100 font-medium rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </Link>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            {isSaving ? 'Saving...' : 'Save Survey'}
          </button>
        </div>
      </div>
    </PageContainer>
  );
}

// Question Card Component
interface QuestionCardProps {
  question: Question;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdate: (updates: Partial<Question>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  disabled: boolean;
}

function QuestionCard({
  question,
  index,
  isExpanded,
  onToggle,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  disabled,
}: QuestionCardProps) {
  const typeInfo = QUESTION_TYPES.find(t => t.value === question.type);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-3 p-3 bg-gray-50 cursor-pointer"
        onClick={onToggle}
      >
        <span className="text-sm font-medium text-gray-400 w-6">#{index + 1}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {question.text || <span className="text-gray-400 italic">Untitled question</span>}
          </p>
          <p className="text-xs text-gray-500">{typeInfo?.label}</p>
        </div>
        <div className="flex items-center gap-1">
          {question.required && (
            <span className="px-1.5 py-0.5 text-xs bg-red-100 text-red-700 rounded">Required</span>
          )}
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-4 border-t border-gray-200 space-y-4">
          {/* Question Text */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Question Text <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={question.text}
              onChange={(e) => onUpdate({ text: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Enter your question..."
              disabled={disabled}
            />
          </div>

          {/* Required Toggle */}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={question.required || false}
              onChange={(e) => onUpdate({ required: e.target.checked })}
              disabled={disabled}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-gray-700">Required</span>
          </label>

          {/* Type-specific fields */}
          <QuestionTypeFields question={question} onUpdate={onUpdate} disabled={disabled} />

          {/* Actions */}
          <div className="flex justify-between pt-3 border-t border-gray-100">
            <div className="flex gap-1">
              <button
                onClick={onMoveUp}
                disabled={!canMoveUp || disabled}
                className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                title="Move up"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </button>
              <button
                onClick={onMoveDown}
                disabled={!canMoveDown || disabled}
                className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                title="Move down"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
            <button
              onClick={onRemove}
              disabled={disabled}
              className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Type-specific question fields
interface QuestionTypeFieldsProps {
  question: Question;
  onUpdate: (updates: Partial<Question>) => void;
  disabled: boolean;
}

function QuestionTypeFields({ question, onUpdate, disabled }: QuestionTypeFieldsProps) {
  switch (question.type) {
    case 'MULTIPLE_CHOICE':
    case 'CHECKBOX':
      return (
        <OptionsEditor
          options={question.options || []}
          onChange={(options) => onUpdate({ options })}
          allowOther={question.type === 'MULTIPLE_CHOICE' ? question.allowOther : undefined}
          onAllowOtherChange={question.type === 'MULTIPLE_CHOICE' ? (allowOther) => onUpdate({ allowOther }) : undefined}
          disabled={disabled}
        />
      );

    case 'LIKERT':
      return (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Scale Points</label>
            <select
              value={question.scale || 5}
              onChange={(e) => onUpdate({ scale: parseInt(e.target.value, 10) })}
              disabled={disabled}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {[3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                <option key={n} value={n}>{n} points</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Label</label>
              <input
                type="text"
                value={question.labels?.min || ''}
                onChange={(e) => onUpdate({ labels: { ...question.labels, min: e.target.value } })}
                placeholder="e.g., Strongly Disagree"
                disabled={disabled}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Label</label>
              <input
                type="text"
                value={question.labels?.max || ''}
                onChange={(e) => onUpdate({ labels: { ...question.labels, max: e.target.value } })}
                placeholder="e.g., Strongly Agree"
                disabled={disabled}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
        </div>
      );

    case 'SCALE':
    case 'NUMBER':
      return (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Min</label>
            <input
              type="number"
              value={question.min ?? 0}
              onChange={(e) => onUpdate({ min: parseFloat(e.target.value) })}
              disabled={disabled}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max</label>
            <input
              type="number"
              value={question.max ?? 100}
              onChange={(e) => onUpdate({ max: parseFloat(e.target.value) })}
              disabled={disabled}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Step</label>
            <input
              type="number"
              value={question.step ?? 1}
              onChange={(e) => onUpdate({ step: parseFloat(e.target.value) })}
              disabled={disabled}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
      );

    case 'TEXT':
    case 'TEXTAREA':
    case 'EMAIL':
      return (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Placeholder</label>
            <input
              type="text"
              value={question.placeholder || ''}
              onChange={(e) => onUpdate({ placeholder: e.target.value })}
              placeholder="Placeholder text..."
              disabled={disabled}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max Length</label>
            <input
              type="number"
              value={question.maxLength || ''}
              onChange={(e) => onUpdate({ maxLength: e.target.value ? parseInt(e.target.value, 10) : undefined })}
              placeholder="No limit"
              disabled={disabled}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
      );

    default:
      return null;
  }
}

// Options Editor for multiple choice/checkbox
interface OptionsEditorProps {
  options: string[];
  onChange: (options: string[]) => void;
  allowOther?: boolean;
  onAllowOtherChange?: (allowOther: boolean) => void;
  disabled: boolean;
}

function OptionsEditor({ options, onChange, allowOther, onAllowOtherChange, disabled }: OptionsEditorProps) {
  const addOption = () => {
    onChange([...options, `Option ${options.length + 1}`]);
  };

  const updateOption = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    onChange(newOptions);
  };

  const removeOption = (index: number) => {
    if (options.length <= 2) return;
    onChange(options.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">Options</label>
      {options.map((option, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            type="text"
            value={option}
            onChange={(e) => updateOption(index, e.target.value)}
            disabled={disabled}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button
            onClick={() => removeOption(index)}
            disabled={disabled || options.length <= 2}
            className="p-2 text-gray-400 hover:text-red-600 disabled:opacity-30"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
      <button
        onClick={addOption}
        disabled={disabled}
        className="text-sm text-primary-600 hover:text-primary-700 disabled:opacity-50"
      >
        + Add Option
      </button>
      {onAllowOtherChange && (
        <label className="flex items-center gap-2 mt-2">
          <input
            type="checkbox"
            checked={allowOther || false}
            onChange={(e) => onAllowOtherChange(e.target.checked)}
            disabled={disabled}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span className="text-sm text-gray-700">Allow "Other" option</span>
        </label>
      )}
    </div>
  );
}
