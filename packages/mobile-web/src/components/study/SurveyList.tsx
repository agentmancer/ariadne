/**
 * Survey List - Manage surveys for a study
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSurveys } from '../../hooks/useSurveys';
import { Survey, SurveyTiming } from '../../services/api';
import { LoadingSpinner, Modal, ConfirmDialog } from '../../components';

interface SurveyListProps {
  studyId: string;
}

const TIMING_LABELS: Record<SurveyTiming, { label: string; color: string }> = {
  PRE_STUDY: { label: 'Pre-Study', color: 'bg-blue-100 text-blue-700' },
  POST_TASK: { label: 'Post-Task', color: 'bg-purple-100 text-purple-700' },
  EXIT: { label: 'Exit', color: 'bg-green-100 text-green-700' },
  CUSTOM: { label: 'Custom', color: 'bg-gray-100 text-gray-700' },
};

export function SurveyList({ studyId }: SurveyListProps) {
  const navigate = useNavigate();
  const { surveys, isLoading, error, createSurvey, deleteSurvey } = useSurveys(studyId);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Survey | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Quick create form
  const [newSurveyName, setNewSurveyName] = useState('');
  const [newSurveyTiming, setNewSurveyTiming] = useState<SurveyTiming>('PRE_STUDY');

  const handleCreate = async () => {
    if (!newSurveyName.trim()) {
      setFormError('Name is required');
      return;
    }

    setIsSaving(true);
    setFormError(null);

    try {
      const survey = await createSurvey({
        name: newSurveyName.trim(),
        timing: newSurveyTiming,
      });
      setIsCreateModalOpen(false);
      setNewSurveyName('');
      setNewSurveyTiming('PRE_STUDY');
      // Navigate to editor
      navigate(`/studies/${studyId}/surveys/${survey.id}/edit`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create survey';
      setFormError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsSaving(true);
    try {
      await deleteSurvey(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      // Error handled by hook
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner text="Loading surveys..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Surveys</h2>
          <p className="text-sm text-gray-500">Create and manage surveys for data collection</p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
        >
          + Add Survey
        </button>
      </div>

      {/* Surveys List */}
      {surveys.length === 0 ? (
        <div className="bg-white rounded-lg p-8 shadow-sm text-center">
          <div className="text-gray-400 mb-2">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
          </div>
          <h3 className="text-gray-900 font-medium">No surveys yet</h3>
          <p className="text-sm text-gray-500 mt-1">Add surveys to collect data from participants at different stages.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {surveys.map((survey) => {
            const timing = TIMING_LABELS[survey.timing];
            return (
              <div
                key={survey.id}
                className="bg-white rounded-lg p-4 shadow-sm border border-gray-200"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-900">{survey.name}</h3>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${timing.color}`}>
                        {timing.label}
                      </span>
                    </div>
                    {survey.description && (
                      <p className="text-sm text-gray-500 mt-1">{survey.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                      <span>{survey.questions?.length || 0} questions</span>
                      <span>{survey._count?.responses || 0} responses</span>
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Link
                      to={`/studies/${studyId}/surveys/${survey.id}/edit`}
                      className="px-3 py-1 text-sm text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded transition-colors"
                    >
                      Edit
                    </Link>
                    <button
                      onClick={() => setDeleteTarget(survey)}
                      className="px-3 py-1 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                      disabled={(survey._count?.responses || 0) > 0}
                      title={(survey._count?.responses || 0) > 0 ? 'Cannot delete: has responses' : 'Delete survey'}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="New Survey"
        size="md"
        footer={
          <>
            <button
              onClick={() => setIsCreateModalOpen(false)}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {isSaving ? 'Creating...' : 'Create & Edit'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Survey Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={newSurveyName}
              onChange={(e) => setNewSurveyName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="e.g., Demographics Survey, Exit Questionnaire"
              disabled={isSaving}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Timing
            </label>
            <select
              value={newSurveyTiming}
              onChange={(e) => setNewSurveyTiming(e.target.value as SurveyTiming)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              disabled={isSaving}
            >
              <option value="PRE_STUDY">Pre-Study (before main task)</option>
              <option value="POST_TASK">Post-Task (after each task)</option>
              <option value="EXIT">Exit (at study completion)</option>
              <option value="CUSTOM">Custom (manual trigger)</option>
            </select>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Survey"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={isSaving}
      />
    </div>
  );
}
