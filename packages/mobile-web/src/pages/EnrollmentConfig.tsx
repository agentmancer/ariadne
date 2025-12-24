/**
 * Enrollment Configuration page
 * Allows researchers to configure the enrollment portal for their study
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, EnrollmentConfig as EnrollmentConfigType, CreateEnrollmentConfigInput } from '../services/api';
import { LoadingSpinner, ErrorMessage, PageContainer } from '../components';
import { RichTextEditor } from '../components/RichTextEditor';

export function EnrollmentConfig() {
  const { studyId } = useParams<{ studyId: string }>();
  const [config, setConfig] = useState<EnrollmentConfigType | null>(null);
  const [studyName, setStudyName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form state
  const [slug, setSlug] = useState('');
  const [slugError, setSlugError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [maxParticipants, setMaxParticipants] = useState<string>('');
  const [openAt, setOpenAt] = useState('');
  const [closeAt, setCloseAt] = useState('');
  const [welcomeContent, setWelcomeContent] = useState('');
  const [consentDocument, setConsentDocument] = useState('');
  const [instructionsContent, setInstructionsContent] = useState('');
  const [completionContent, setCompletionContent] = useState('');
  const [requireAvailability, setRequireAvailability] = useState(true);
  const [sendConfirmationEmail, setSendConfirmationEmail] = useState(true);
  const [confirmationEmailTemplate, setConfirmationEmailTemplate] = useState('');

  // Tab state
  const [activeTab, setActiveTab] = useState<'general' | 'content' | 'email'>('general');

  // Load study and config
  useEffect(() => {
    async function loadData() {
      if (!studyId) return;

      setIsLoading(true);
      setError(null);

      try {
        const [study, existingConfig] = await Promise.all([
          api.getStudy(studyId),
          api.getEnrollmentConfig(studyId).catch(() => null),
        ]);

        setStudyName(study.name);

        if (existingConfig) {
          setConfig(existingConfig);
          setSlug(existingConfig.slug);
          setEnabled(existingConfig.enabled);
          setMaxParticipants(existingConfig.maxParticipants?.toString() || '');
          setOpenAt(existingConfig.openAt ? existingConfig.openAt.slice(0, 16) : '');
          setCloseAt(existingConfig.closeAt ? existingConfig.closeAt.slice(0, 16) : '');
          setWelcomeContent(existingConfig.welcomeContent || '');
          setConsentDocument(existingConfig.consentDocument || '');
          setInstructionsContent(existingConfig.instructionsContent || '');
          setCompletionContent(existingConfig.completionContent || '');
          setRequireAvailability(existingConfig.requireAvailability);
          setSendConfirmationEmail(existingConfig.sendConfirmationEmail);
          setConfirmationEmailTemplate(existingConfig.confirmationEmailTemplate || '');
        } else {
          // Generate default slug from study name
          const defaultSlug = study.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
          setSlug(defaultSlug);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load data';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [studyId]);

  // Validate slug
  const validateSlug = useCallback(async (newSlug: string) => {
    if (!studyId || !newSlug) {
      setSlugError(null);
      return;
    }

    if (newSlug.length < 3) {
      setSlugError('Slug must be at least 3 characters');
      return;
    }

    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(newSlug)) {
      setSlugError('Slug must be lowercase alphanumeric with hyphens');
      return;
    }

    try {
      const available = await api.checkSlugAvailability(studyId, newSlug);
      setSlugError(available ? null : 'This slug is already in use');
    } catch {
      // Ignore errors during validation
    }
  }, [studyId]);

  // Debounced slug validation
  useEffect(() => {
    const timer = setTimeout(() => {
      validateSlug(slug);
    }, 500);
    return () => clearTimeout(timer);
  }, [slug, validateSlug]);

  // Save configuration
  const handleSave = async () => {
    if (!studyId || !slug || slugError) return;

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const data: CreateEnrollmentConfigInput = {
        slug,
        enabled,
        maxParticipants: maxParticipants ? parseInt(maxParticipants, 10) : undefined,
        openAt: openAt || undefined,
        closeAt: closeAt || undefined,
        welcomeContent: welcomeContent || undefined,
        consentDocument: consentDocument || undefined,
        instructionsContent: instructionsContent || undefined,
        completionContent: completionContent || undefined,
        requireAvailability,
        sendConfirmationEmail,
        confirmationEmailTemplate: confirmationEmailTemplate || undefined,
      };

      let result: EnrollmentConfigType;
      if (config) {
        result = await api.updateEnrollmentConfig(studyId, data);
      } else {
        result = await api.createEnrollmentConfig(studyId, data);
      }

      setConfig(result);
      setSuccessMessage('Configuration saved successfully');

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save configuration';
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle enabled status
  const handleToggle = async () => {
    if (!studyId || !config) return;

    setIsSaving(true);
    setError(null);

    try {
      const result = await api.toggleEnrollmentConfig(studyId, !enabled);
      setConfig(result);
      setEnabled(result.enabled);
      setSuccessMessage(`Enrollment ${result.enabled ? 'enabled' : 'disabled'}`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to toggle enrollment';
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  // Send test email
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  const handleSendTestEmail = async () => {
    if (!studyId || !testEmail) return;

    setSendingTest(true);
    setError(null);

    try {
      await api.sendTestEmail(studyId, testEmail);
      setSuccessMessage(`Test email sent to ${testEmail}`);
      setTestEmail('');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send test email';
      setError(message);
    } finally {
      setSendingTest(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner size="lg" text="Loading configuration..." />
      </div>
    );
  }

  const portalUrl = config ? `${window.location.origin}/enroll/${config.slug}` : null;

  return (
    <PageContainer
      title="Enrollment Configuration"
      subtitle={studyName}
      actions={
        <div className="flex gap-2">
          {config && (
            <button
              onClick={handleToggle}
              disabled={isSaving}
              className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                enabled
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {enabled ? 'Disable' : 'Enable'} Enrollment
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving || !!slugError || !slug}
            className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      }
    >
      {/* Back link */}
      <Link
        to={`/studies/${studyId}`}
        className="inline-flex items-center gap-2 text-primary-600 mb-4"
      >
        &larr; Back to Study
      </Link>

      {/* Messages */}
      {error && <ErrorMessage message={error} />}
      {successMessage && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
          {successMessage}
        </div>
      )}

      {/* Portal URL */}
      {config && portalUrl && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <span className="text-sm font-medium text-blue-800">Portal URL:</span>
            <code className="text-sm bg-blue-100 px-2 py-1 rounded break-all">{portalUrl}</code>
            <button
              onClick={() => navigator.clipboard.writeText(portalUrl)}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Copy
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                enabled ? 'bg-green-500' : 'bg-gray-400'
              }`}
            />
            <span className="text-sm text-blue-700">
              {enabled ? 'Portal is active' : 'Portal is disabled'}
            </span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-4">
          {(['general', 'content', 'email'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </div>

      {/* General Settings Tab */}
      {activeTab === 'general' && (
        <div className="space-y-6">
          {/* Slug */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Portal Slug
            </label>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">/enroll/</span>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                className={`flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 ${
                  slugError ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="my-study"
              />
            </div>
            {slugError && <p className="mt-1 text-sm text-red-600">{slugError}</p>}
          </div>

          {/* Capacity */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Maximum Participants
            </label>
            <input
              type="number"
              value={maxParticipants}
              onChange={(e) => setMaxParticipants(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              placeholder="Leave empty for unlimited"
              min="1"
            />
          </div>

          {/* Timing */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Open At
              </label>
              <input
                type="datetime-local"
                value={openAt}
                onChange={(e) => setOpenAt(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Close At
              </label>
              <input
                type="datetime-local"
                value={closeAt}
                onChange={(e) => setCloseAt(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          {/* Options */}
          <div className="space-y-3">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={requireAvailability}
                onChange={(e) => setRequireAvailability(e.target.checked)}
                className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">
                Require participants to provide availability
              </span>
            </label>
          </div>
        </div>
      )}

      {/* Content Tab */}
      {activeTab === 'content' && (
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Welcome Message
            </label>
            <RichTextEditor
              value={welcomeContent}
              onChange={setWelcomeContent}
              placeholder="Welcome message shown to participants..."
              minHeight="150px"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Consent Document
            </label>
            <RichTextEditor
              value={consentDocument}
              onChange={setConsentDocument}
              placeholder="Informed consent document..."
              minHeight="200px"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Study Instructions
            </label>
            <RichTextEditor
              value={instructionsContent}
              onChange={setInstructionsContent}
              placeholder="Instructions for participants..."
              minHeight="150px"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Completion Message
            </label>
            <RichTextEditor
              value={completionContent}
              onChange={setCompletionContent}
              placeholder="Message shown after enrollment..."
              minHeight="150px"
            />
          </div>
        </div>
      )}

      {/* Email Tab */}
      {activeTab === 'email' && (
        <div className="space-y-6">
          <div>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={sendConfirmationEmail}
                onChange={(e) => setSendConfirmationEmail(e.target.checked)}
                className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">
                Send confirmation email after enrollment
              </span>
            </label>
          </div>

          {sendConfirmationEmail && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Template
                </label>
                <p className="text-sm text-gray-500 mb-2">
                  Use {'{{participantName}}'}, {'{{studyName}}'}, and {'{{participantEmail}}'} as variables.
                </p>
                <RichTextEditor
                  value={confirmationEmailTemplate}
                  onChange={setConfirmationEmailTemplate}
                  placeholder="Custom email template (leave empty for default)..."
                  minHeight="200px"
                />
              </div>

              {config && (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Send Test Email</h3>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      placeholder="test@example.com"
                    />
                    <button
                      onClick={handleSendTestEmail}
                      disabled={sendingTest || !testEmail}
                      className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
                    >
                      {sendingTest ? 'Sending...' : 'Send Test'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </PageContainer>
  );
}
