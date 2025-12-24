import { PassageTriad } from '../../services/api';

interface PassageRatingPanelProps {
  passage: PassageTriad;
}

/**
 * Displays a passage triad for evaluation:
 * - Previous scene (context)
 * - Player action (the choice made)
 * - Consequence scene (what happened as a result)
 */
export default function PassageRatingPanel({ passage }: PassageRatingPanelProps) {
  return (
    <div className="space-y-4">
      {/* Passage counter */}
      <div className="text-sm text-gray-500 text-center">
        Passage {passage.index + 1} of {passage.totalCount}
      </div>

      {/* Previous Scene */}
      <PassageCard
        label="Previous Scene"
        labelColor="bg-gray-100 text-gray-700"
        passage={passage.previousScene}
      />

      {/* Player Action - highlighted */}
      <div className="flex items-center justify-center">
        <div className="w-0.5 h-6 bg-primary-300" />
      </div>
      <PassageCard
        label="Player Action"
        labelColor="bg-primary-100 text-primary-700"
        passage={passage.playerAction}
        highlighted
      />

      {/* Arrow down */}
      <div className="flex items-center justify-center">
        <div className="w-0.5 h-6 bg-primary-300" />
      </div>

      {/* Consequence Scene */}
      <PassageCard
        label="Consequence"
        labelColor="bg-green-100 text-green-700"
        passage={passage.consequenceScene}
      />
    </div>
  );
}

interface PassageCardProps {
  label: string;
  labelColor: string;
  passage: {
    name: string;
    text: string;
    tags?: string[];
  };
  highlighted?: boolean;
}

function PassageCard({ label, labelColor, passage, highlighted }: PassageCardProps) {
  return (
    <div
      className={`rounded-lg border ${
        highlighted
          ? 'border-primary-300 bg-primary-50'
          : 'border-gray-200 bg-white'
      } overflow-hidden`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
        <span className={`text-xs font-medium px-2 py-1 rounded ${labelColor}`}>
          {label}
        </span>
        <span className="text-xs text-gray-400 font-mono">
          {passage.name}
        </span>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="prose prose-sm max-w-none">
          {passage.text.split('\n').map((paragraph, i) => (
            <p key={i} className="mb-2 last:mb-0 text-gray-700">
              {paragraph}
            </p>
          ))}
        </div>

        {/* Tags */}
        {passage.tags && passage.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {passage.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
