import { useState } from 'react';

interface TutorialProps {
  onComplete: () => void;
}

const TUTORIAL_STEPS = [
  {
    title: 'Welcome to the Study',
    content: 'In this session, you will create and explore interactive stories. Take your time and enjoy the creative process.',
  },
  {
    title: 'Creating Your Story',
    content: 'During the authoring phase, you will use a story editor to create branching narratives. Your choices determine how the story unfolds.',
  },
  {
    title: 'Exploring Stories',
    content: 'During the playing phase, you will read and explore stories created by your partner. You can leave comments and feedback.',
  },
  {
    title: 'Multiple Rounds',
    content: 'The session consists of multiple rounds. In each round, you will author and play, building on your creative work.',
  },
  {
    title: 'Ready to Begin',
    content: 'When you are ready, click the button below to start the session. Good luck and have fun!',
  },
];

export default function Tutorial({ onComplete }: TutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const isLastStep = currentStep === TUTORIAL_STEPS.length - 1;
  const step = TUTORIAL_STEPS[currentStep];

  const handleNext = () => {
    if (isLastStep) {
      onComplete();
    } else {
      setCurrentStep(s => s + 1);
    }
  };

  const handlePrev = () => {
    setCurrentStep(s => Math.max(0, s - 1));
  };

  return (
    <div className="max-w-xl mx-auto p-6">
      {/* Progress dots */}
      <div className="flex justify-center gap-2 mb-8">
        {TUTORIAL_STEPS.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrentStep(i)}
            className={`w-2.5 h-2.5 rounded-full transition-colors ${
              i === currentStep
                ? 'bg-primary-600'
                : i < currentStep
                ? 'bg-primary-300'
                : 'bg-gray-300'
            }`}
            aria-label={`Go to step ${i + 1}`}
          />
        ))}
      </div>

      {/* Content */}
      <div className="bg-white rounded-lg shadow-md p-8 mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          {step.title}
        </h2>
        <p className="text-gray-600 leading-relaxed">
          {step.content}
        </p>
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={handlePrev}
          disabled={currentStep === 0}
          className="px-4 py-2 text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Back
        </button>

        <button
          onClick={handleNext}
          className="px-6 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors"
        >
          {isLastStep ? 'Start Session' : 'Next'}
        </button>
      </div>
    </div>
  );
}
