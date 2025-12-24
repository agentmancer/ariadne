import { useState } from 'react';

interface ExitSurveyProps {
  onComplete: () => void;
}

interface SurveyAnswers {
  enjoyment: number;
  creativity: number;
  partnerExperience: number;
  feedback: string;
}

export default function ExitSurvey({ onComplete }: ExitSurveyProps) {
  const [answers, setAnswers] = useState<SurveyAnswers>({
    enjoyment: 0,
    creativity: 0,
    partnerExperience: 0,
    feedback: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRatingChange = (field: keyof SurveyAnswers, value: number) => {
    setAnswers(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    // TODO: Submit survey answers to API
    await new Promise(r => setTimeout(r, 1000));
    setIsSubmitting(false);
    onComplete();
  };

  const isComplete = answers.enjoyment > 0 && answers.creativity > 0 && answers.partnerExperience > 0;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-md p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Exit Survey
        </h2>
        <p className="text-gray-600 mb-8">
          Please take a moment to share your experience. Your feedback helps us improve.
        </p>

        <div className="space-y-8">
          {/* Enjoyment rating */}
          <RatingQuestion
            label="How much did you enjoy this session?"
            value={answers.enjoyment}
            onChange={(v) => handleRatingChange('enjoyment', v)}
          />

          {/* Creativity rating */}
          <RatingQuestion
            label="How creative did you feel during the authoring phases?"
            value={answers.creativity}
            onChange={(v) => handleRatingChange('creativity', v)}
          />

          {/* Partner experience rating */}
          <RatingQuestion
            label="How was your experience collaborating with your partner?"
            value={answers.partnerExperience}
            onChange={(v) => handleRatingChange('partnerExperience', v)}
          />

          {/* Open feedback */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Any additional feedback? (optional)
            </label>
            <textarea
              value={answers.feedback}
              onChange={(e) => setAnswers(prev => ({ ...prev, feedback: e.target.value }))}
              placeholder="Share your thoughts..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none"
              rows={4}
            />
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!isComplete || isSubmitting}
          className="mt-8 w-full py-3 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? 'Submitting...' : 'Submit & Continue'}
        </button>
      </div>
    </div>
  );
}

interface RatingQuestionProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
}

function RatingQuestion({ label, value, onChange }: RatingQuestionProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-3">
        {label}
      </label>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((rating) => (
          <button
            key={rating}
            onClick={() => onChange(rating)}
            className={`w-12 h-12 rounded-lg border-2 font-medium transition-colors ${
              value === rating
                ? 'bg-primary-600 border-primary-600 text-white'
                : 'border-gray-300 text-gray-600 hover:border-primary-400'
            }`}
          >
            {rating}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-xs text-gray-500 mt-1 px-1">
        <span>Poor</span>
        <span>Excellent</span>
      </div>
    </div>
  );
}
