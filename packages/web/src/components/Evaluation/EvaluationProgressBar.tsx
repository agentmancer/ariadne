import { EvaluationProgress } from '../../services/api';

interface EvaluationProgressBarProps {
  progress: EvaluationProgress;
}

/**
 * Shows evaluation progress with visual bar and time estimate.
 */
export default function EvaluationProgressBar({ progress }: EvaluationProgressBarProps) {
  const { totalPassages, completedPassages, percentComplete, estimatedMinutesRemaining } = progress;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">
          Progress: {completedPassages} of {totalPassages} passages
        </span>
        <span className="text-sm text-gray-500">
          {estimatedMinutesRemaining > 0
            ? `~${estimatedMinutesRemaining} min remaining`
            : 'Almost done!'}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary-600 rounded-full transition-all duration-300"
          style={{ width: `${percentComplete}%` }}
        />
      </div>

      {/* Percentage */}
      <div className="mt-1 text-right">
        <span className="text-xs text-gray-500">{Math.round(percentComplete)}% complete</span>
      </div>
    </div>
  );
}
