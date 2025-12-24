/**
 * Enrollment Portal - Public page for participants to enroll in a study
 */

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { enrollmentApi, PublicEnrollmentPortal, EnrollmentSubmission } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';

type Step = 'welcome' | 'consent' | 'demographics' | 'complete';

export default function EnrollmentPortal() {
  const { slug } = useParams<{ slug: string }>();
  const [portal, setPortal] = useState<PublicEnrollmentPortal | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Wizard state
  const [currentStep, setCurrentStep] = useState<Step>('welcome');
  const [email, setEmail] = useState('');
  const [consentChecked, setConsentChecked] = useState(false);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, unknown>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load portal data
  useEffect(() => {
    async function loadPortal() {
      if (!slug) return;

      setIsLoading(true);
      setError(null);

      try {
        const data = await enrollmentApi.getPortalBySlug(slug);
        setPortal(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load enrollment portal';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    }

    loadPortal();
  }, [slug]);

  // Handle enrollment submission
  const handleSubmit = async () => {
    if (!slug || !portal) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const submission: EnrollmentSubmission = {
        email,
        consentGiven: true,
        customFieldData: customFieldValues,
      };

      await enrollmentApi.submitEnrollment(slug, submission);
      setCurrentStep('complete');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit enrollment';
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  // Render error state
  if (error || !portal) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md text-center">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h1 className="text-xl font-semibold text-red-800 mb-2">
              Portal Not Found
            </h1>
            <p className="text-red-600">
              {error || 'The enrollment portal you are looking for does not exist or is no longer available.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Render closed state
  if (!portal.isOpen) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md text-center">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <h1 className="text-xl font-semibold text-yellow-800 mb-2">
              Enrollment Closed
            </h1>
            <p className="text-yellow-700">
              Enrollment for this study is currently closed. Please check back later or contact the research team for more information.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Progress indicator
  const steps: Step[] = ['welcome', 'consent', 'demographics', 'complete'];
  const currentStepIndex = steps.indexOf(currentStep);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-gray-900">{portal.studyName}</h1>
          {portal.studyDescription && (
            <p className="mt-1 text-gray-600">{portal.studyDescription}</p>
          )}
        </div>
      </header>

      {/* Progress bar */}
      <div className="max-w-3xl mx-auto px-4 py-4">
        <div className="flex items-center">
          {steps.slice(0, -1).map((step, index) => (
            <div key={step} className="flex-1 flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  index <= currentStepIndex
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}
              >
                {index + 1}
              </div>
              {index < steps.length - 2 && (
                <div
                  className={`flex-1 h-1 mx-2 ${
                    index < currentStepIndex ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex mt-2 text-xs text-gray-500">
          <span className="flex-1">Welcome</span>
          <span className="flex-1 text-center">Consent</span>
          <span className="flex-1 text-right">Details</span>
        </div>
      </div>

      {/* Main content */}
      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className="bg-white rounded-lg shadow-sm p-6">
          {/* Welcome Step */}
          {currentStep === 'welcome' && (
            <div>
              {portal.content.welcome ? (
                <div
                  className="prose max-w-none"
                  dangerouslySetInnerHTML={{ __html: portal.content.welcome }}
                />
              ) : (
                <div className="text-center py-8">
                  <h2 className="text-xl font-semibold text-gray-800 mb-4">
                    Welcome to {portal.studyName}
                  </h2>
                  <p className="text-gray-600">
                    Thank you for your interest in participating in our research study.
                  </p>
                </div>
              )}
              <div className="mt-8 flex justify-end">
                <button
                  onClick={() => setCurrentStep('consent')}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Consent Step */}
          {currentStep === 'consent' && (
            <div>
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Informed Consent
              </h2>
              {portal.content.consent ? (
                <div
                  className="prose max-w-none border border-gray-200 rounded-lg p-4 max-h-96 overflow-y-auto mb-6"
                  dangerouslySetInnerHTML={{ __html: portal.content.consent }}
                />
              ) : (
                <div className="border border-gray-200 rounded-lg p-4 mb-6">
                  <p className="text-gray-600">
                    By participating in this study, you agree to allow researchers to collect and analyze data about your participation for research purposes.
                  </p>
                </div>
              )}
              <label className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(e) => setConsentChecked(e.target.checked)}
                  className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mt-0.5"
                />
                <span className="text-sm text-gray-700">
                  I have read and understood the consent form above. I voluntarily agree to participate in this research study.
                </span>
              </label>
              <div className="mt-8 flex justify-between">
                <button
                  onClick={() => setCurrentStep('welcome')}
                  className="px-6 py-3 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setCurrentStep('demographics')}
                  disabled={!consentChecked}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  I Agree & Continue
                </button>
              </div>
            </div>
          )}

          {/* Demographics Step */}
          {currentStep === 'demographics' && (
            <div>
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Your Information
              </h2>

              {/* Email (required) */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="your@email.com"
                  required
                />
                <p className="mt-1 text-sm text-gray-500">
                  We will send you confirmation and study instructions via email.
                </p>
              </div>

              {/* Custom Fields */}
              {portal.customFields.map((field) => (
                <div key={field.id} className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {field.label}
                    {field.required && <span className="text-red-500"> *</span>}
                  </label>
                  {field.type === 'text' && (
                    <input
                      type="text"
                      value={(customFieldValues[field.id] as string) || ''}
                      onChange={(e) =>
                        setCustomFieldValues((prev) => ({
                          ...prev,
                          [field.id]: e.target.value,
                        }))
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder={field.placeholder}
                      required={field.required}
                    />
                  )}
                  {field.type === 'select' && (
                    <select
                      value={(customFieldValues[field.id] as string) || ''}
                      onChange={(e) =>
                        setCustomFieldValues((prev) => ({
                          ...prev,
                          [field.id]: e.target.value,
                        }))
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required={field.required}
                    >
                      <option value="">Select...</option>
                      {field.options?.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  )}
                  {field.type === 'checkbox' && (
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={(customFieldValues[field.id] as boolean) || false}
                        onChange={(e) =>
                          setCustomFieldValues((prev) => ({
                            ...prev,
                            [field.id]: e.target.checked,
                          }))
                        }
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                      />
                      <span className="text-sm text-gray-600">{field.placeholder}</span>
                    </label>
                  )}
                </div>
              ))}

              {submitError && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                  {submitError}
                </div>
              )}

              <div className="mt-8 flex justify-between">
                <button
                  onClick={() => setCurrentStep('consent')}
                  className="px-6 py-3 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!email || isSubmitting}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Submitting...' : 'Complete Enrollment'}
                </button>
              </div>
            </div>
          )}

          {/* Complete Step */}
          {currentStep === 'complete' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">
                Enrollment Complete!
              </h2>
              {portal.content.completion ? (
                <div
                  className="prose max-w-none text-left"
                  dangerouslySetInnerHTML={{ __html: portal.content.completion }}
                />
              ) : (
                <div>
                  <p className="text-gray-600 mb-4">
                    Thank you for enrolling in {portal.studyName}!
                  </p>
                  <p className="text-gray-600">
                    You will receive a confirmation email at <strong>{email}</strong> with further instructions.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-3xl mx-auto px-4 py-6 text-center text-sm text-gray-500">
        Powered by Ariadne Research Platform
      </footer>
    </div>
  );
}
