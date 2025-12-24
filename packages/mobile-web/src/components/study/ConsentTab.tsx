/**
 * Consent Tab - Links to enrollment config for consent management
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, EnrollmentConfig } from '../../services/api';
import { LoadingSpinner } from '../../components';

/**
 * Sanitize HTML to prevent XSS attacks.
 * Removes script tags, event handlers, and dangerous attributes.
 */
function sanitizeHtml(html: string): string {
  // Create a temporary element to parse HTML
  const temp = document.createElement('div');
  temp.innerHTML = html;

  // Remove script tags
  const scripts = temp.querySelectorAll('script');
  scripts.forEach(s => s.remove());

  // Remove iframe, object, embed tags
  const dangerous = temp.querySelectorAll('iframe, object, embed, form');
  dangerous.forEach(el => el.remove());

  // Remove event handlers and dangerous attributes from all elements
  const allElements = temp.querySelectorAll('*');
  allElements.forEach(el => {
    // Remove event handlers (onclick, onerror, etc.)
    const attrs = Array.from(el.attributes);
    attrs.forEach(attr => {
      if (attr.name.startsWith('on') || attr.name === 'href' && attr.value.startsWith('javascript:')) {
        el.removeAttribute(attr.name);
      }
    });
  });

  return temp.innerHTML;
}

interface ConsentTabProps {
  studyId: string;
}

export function ConsentTab({ studyId }: ConsentTabProps) {
  const [config, setConfig] = useState<EnrollmentConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const data = await api.getEnrollmentConfig(studyId);
        setConfig(data);
      } catch (err) {
        // 404 means no config exists yet, which is fine
        if (err instanceof Error && !err.message.includes('not found')) {
          setError(err.message);
        }
      } finally {
        setIsLoading(false);
      }
    };
    fetchConfig();
  }, [studyId]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner text="Loading consent configuration..." />
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
    <div className="space-y-6">
      {/* Info Card */}
      <section className="bg-white rounded-lg p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-blue-100 rounded-lg">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900">Consent Document</h2>
            <p className="text-sm text-gray-500 mt-1">
              The consent document is managed through the Enrollment Portal configuration.
              This keeps consent, welcome messages, and enrollment settings together.
            </p>
          </div>
        </div>
      </section>

      {/* Current Status */}
      {config ? (
        <section className="bg-white rounded-lg p-6 shadow-sm">
          <h3 className="font-semibold text-gray-800 mb-4">Current Consent Configuration</h3>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-600">Consent Version</span>
              <span className="font-medium text-gray-900">{config.consentVersion || '1.0'}</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-600">Document Status</span>
              <span className={`px-2 py-1 text-xs rounded-full ${
                config.consentDocument
                  ? 'bg-green-100 text-green-700'
                  : 'bg-yellow-100 text-yellow-700'
              }`}>
                {config.consentDocument ? 'Configured' : 'Not Set'}
              </span>
            </div>

            {config.consentDocument && (
              <div className="border border-gray-200 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Preview</h4>
                <div className="prose prose-sm max-w-none text-gray-600 max-h-48 overflow-y-auto">
                  <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(config.consentDocument.slice(0, 500) + (config.consentDocument.length > 500 ? '...' : '')) }} />
                </div>
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="bg-white rounded-lg p-6 shadow-sm">
          <div className="text-center py-4">
            <div className="text-gray-400 mb-2">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-gray-900 font-medium">No Enrollment Portal Configured</h3>
            <p className="text-sm text-gray-500 mt-1">
              Set up the enrollment portal to configure consent documents.
            </p>
          </div>
        </section>
      )}

      {/* Action Button */}
      <div className="flex justify-center">
        <Link
          to={`/studies/${studyId}/enrollment`}
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          {config ? 'Edit Enrollment Portal' : 'Configure Enrollment Portal'}
        </Link>
      </div>
    </div>
  );
}
