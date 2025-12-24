interface Stage {
  stage: number;
  name: string;
  duration?: number;
}

interface StageProgressProps {
  stages: Stage[];
  currentStage: number;
}

export default function StageProgress({ stages, currentStage }: StageProgressProps) {
  if (!stages || stages.length === 0) {
    return null;
  }

  // Calculate progress percentage with safe bounds checking
  const currentIndex = stages.findIndex(s => s.stage === currentStage);
  const validIndex = currentIndex >= 0 && currentIndex < stages.length;
  const progress = validIndex
    ? ((currentIndex + 1) / stages.length) * 100
    : 0;
  const currentStageInfo = validIndex ? stages[currentIndex] : null;

  return (
    <div className="bg-white border-b border-gray-200 px-4 py-3">
      <div className="max-w-4xl mx-auto">
        {/* Progress bar */}
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
          <div
            className="h-full bg-primary-600 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Stage info */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">
            Stage {validIndex ? currentIndex + 1 : '?'} of {stages.length}
          </span>
          <span className="font-medium text-gray-900">
            {formatStageName(currentStageInfo?.name || 'Unknown')}
          </span>
        </div>
      </div>
    </div>
  );
}

function formatStageName(name: string): string {
  // Convert snake_case or camelCase to Title Case
  return name
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase());
}
