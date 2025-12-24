/**
 * Condition List - Manage experimental conditions
 */

import { useState } from 'react';
import { useConditions } from '../../hooks/useConditions';
import { Condition } from '../../services/api';
import { LoadingSpinner, Modal, JsonEditor, ConfirmDialog } from '../../components';

interface ConditionListProps {
  studyId: string;
}

interface ConditionFormData {
  name: string;
  description: string;
  config: Record<string, unknown>;
}

export function ConditionList({ studyId }: ConditionListProps) {
  const { conditions, isLoading, error, createCondition, updateCondition, deleteCondition } = useConditions(studyId);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCondition, setEditingCondition] = useState<Condition | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Condition | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<ConditionFormData>({
    name: '',
    description: '',
    config: {},
  });

  const openCreateModal = () => {
    setEditingCondition(null);
    setFormData({ name: '', description: '', config: {} });
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (condition: Condition) => {
    setEditingCondition(condition);
    setFormData({
      name: condition.name,
      description: condition.description || '',
      config: condition.config || {},
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setFormError('Name is required');
      return;
    }

    setIsSaving(true);
    setFormError(null);

    try {
      if (editingCondition) {
        await updateCondition(editingCondition.id, {
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          config: Object.keys(formData.config).length > 0 ? formData.config : undefined,
        });
      } else {
        await createCondition({
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          config: Object.keys(formData.config).length > 0 ? formData.config : undefined,
        });
      }
      setIsModalOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save condition';
      setFormError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsSaving(true);
    try {
      await deleteCondition(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      // Error is handled by hook
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner text="Loading conditions..." />
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
          <h2 className="text-lg font-semibold text-gray-900">Experimental Conditions</h2>
          <p className="text-sm text-gray-500">Define different treatment groups for your study</p>
        </div>
        <button
          onClick={openCreateModal}
          className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
        >
          + Add Condition
        </button>
      </div>

      {/* Conditions List */}
      {conditions.length === 0 ? (
        <div className="bg-white rounded-lg p-8 shadow-sm text-center">
          <div className="text-gray-400 mb-2">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h3 className="text-gray-900 font-medium">No conditions yet</h3>
          <p className="text-sm text-gray-500 mt-1">Add experimental conditions to organize participants into treatment groups.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {conditions.map((condition) => (
            <div
              key={condition.id}
              className="bg-white rounded-lg p-4 shadow-sm border border-gray-200"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900">{condition.name}</h3>
                  {condition.description && (
                    <p className="text-sm text-gray-500 mt-1">{condition.description}</p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                    <span>{condition._count?.participants || 0} participants</span>
                    {condition.config && Object.keys(condition.config).length > 0 && (
                      <span>Has custom config</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => openEditModal(condition)}
                    className="px-3 py-1 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDeleteTarget(condition)}
                    className="px-3 py-1 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                    disabled={(condition._count?.participants || 0) > 0}
                    title={(condition._count?.participants || 0) > 0 ? 'Cannot delete: has assigned participants' : 'Delete condition'}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingCondition ? 'Edit Condition' : 'New Condition'}
        size="lg"
        footer={
          <>
            <button
              onClick={() => setIsModalOpen(false)}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {isSaving ? 'Saving...' : editingCondition ? 'Save Changes' : 'Create Condition'}
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
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="e.g., Control Group, Treatment A"
              disabled={isSaving}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              placeholder="Describe this condition..."
              disabled={isSaving}
            />
          </div>

          <div>
            <JsonEditor
              label="Configuration (JSON)"
              value={formData.config}
              onChange={(value) => setFormData(prev => ({ ...prev, config: value }))}
              disabled={isSaving}
              minHeight="100px"
            />
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Condition"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={isSaving}
      />
    </div>
  );
}
