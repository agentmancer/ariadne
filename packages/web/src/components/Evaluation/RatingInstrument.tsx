import { useState } from 'react';
import { EvaluationScale, OpenQuestion } from '../../services/api';

interface RatingInstrumentProps {
  scales: EvaluationScale[];
  openQuestions: OpenQuestion[];
  onRatingsChange: (ratings: Record<string, Record<string, number>>) => void;
  onResponsesChange: (responses: Record<string, string>) => void;
  ratings: Record<string, Record<string, number>>;
  responses: Record<string, string>;
}

/**
 * Multi-scale rating instrument with Likert scales and open questions.
 * Supports FDG 2026 instrument: Transportation, Narrative Quality, Interactive Quality, Overall.
 */
export default function RatingInstrument({
  scales,
  openQuestions,
  onRatingsChange,
  onResponsesChange,
  ratings,
  responses,
}: RatingInstrumentProps) {
  const [expandedScale, setExpandedScale] = useState<string | null>(scales[0]?.id || null);

  const handleItemRating = (scaleId: string, itemId: string, value: number) => {
    onRatingsChange({
      ...ratings,
      [scaleId]: {
        ...ratings[scaleId],
        [itemId]: value,
      },
    });
  };

  const handleOpenResponse = (questionId: string, value: string) => {
    onResponsesChange({ ...responses, [questionId]: value });
  };

  const getScaleProgress = (scale: EvaluationScale): { completed: number; total: number } => {
    const scaleRatings = ratings[scale.id] || {};
    const completed = Object.keys(scaleRatings).length;
    return { completed, total: scale.items.length };
  };

  return (
    <div className="space-y-4">
      {/* Rating Scales */}
      {scales.map((scale) => {
        const progress = getScaleProgress(scale);
        const isComplete = progress.completed === progress.total;
        const isExpanded = expandedScale === scale.id;

        return (
          <div
            key={scale.id}
            className={`border rounded-lg overflow-hidden transition-colors ${
              isComplete ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'
            }`}
          >
            {/* Scale Header */}
            <button
              onClick={() => setExpandedScale(isExpanded ? null : scale.id)}
              className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
            >
              <div>
                <h3 className="font-medium text-gray-900">{scale.name}</h3>
                <p className="text-sm text-gray-500">{scale.description}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-sm ${isComplete ? 'text-green-600' : 'text-gray-500'}`}>
                  {progress.completed}/{progress.total}
                </span>
                <svg
                  className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {/* Scale Items */}
            {isExpanded && (
              <div className="border-t border-gray-100">
                {/* Scale Labels */}
                <div className="px-4 py-2 bg-gray-50 flex justify-end">
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <span className="w-20 text-center">{scale.minLabel}</span>
                    {Array.from({ length: scale.maxValue - scale.minValue + 1 }, (_, i) => (
                      <span key={i} className="w-8 text-center">
                        {scale.minValue + i}
                      </span>
                    ))}
                    <span className="w-20 text-center">{scale.maxLabel}</span>
                  </div>
                </div>

                {/* Items */}
                <div className="divide-y divide-gray-100">
                  {scale.items.map((item) => (
                    <div key={item.id} className="px-4 py-3 flex items-center justify-between gap-4">
                      <p className="text-sm text-gray-700 flex-1">{item.text}</p>
                      <div className="flex items-center gap-1">
                        <span className="w-20" />
                        {Array.from({ length: scale.maxValue - scale.minValue + 1 }, (_, i) => {
                          const value = scale.minValue + i;
                          const isSelected = ratings[scale.id]?.[item.id] === value;
                          return (
                            <button
                              key={value}
                              onClick={() => handleItemRating(scale.id, item.id, value)}
                              aria-label={`Rate ${value} out of ${scale.maxValue}`}
                              className={`w-8 h-8 rounded-full border-2 text-sm font-medium transition-colors ${
                                isSelected
                                  ? 'bg-primary-600 border-primary-600 text-white'
                                  : 'border-gray-300 text-gray-600 hover:border-primary-400'
                              }`}
                            >
                              {value}
                            </button>
                          );
                        })}
                        <span className="w-20" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Open Questions */}
      {openQuestions.length > 0 && (
        <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <h3 className="font-medium text-gray-900">Additional Questions</h3>
          </div>
          <div className="p-4 space-y-4">
            {openQuestions.map((question) => (
              <div key={question.id}>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {question.text}
                  {question.required && <span className="text-red-500 ml-1">*</span>}
                </label>
                <textarea
                  value={responses[question.id] || ''}
                  onChange={(e) => handleOpenResponse(question.id, e.target.value)}
                  placeholder="Your response..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none"
                  rows={3}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Check if all required items are completed
 */
export function isInstrumentComplete(
  scales: EvaluationScale[],
  openQuestions: OpenQuestion[],
  ratings: Record<string, Record<string, number>>,
  responses: Record<string, string>
): boolean {
  const allScalesRated = scales.every(scale =>
    scale.items.every(item => ratings[scale.id]?.[item.id] !== undefined)
  );

  if (!allScalesRated) {
    return false;
  }

  return openQuestions
    .filter(question => question.required)
    .every(question => responses[question.id]?.trim());
}
