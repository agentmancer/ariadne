/**
 * Badge component for displaying actor type (Human/AI)
 */

interface ActorTypeBadgeProps {
  actorType: 'HUMAN' | 'SYNTHETIC';
  role?: string;
  compact?: boolean;
}

export function ActorTypeBadge({ actorType, role, compact = false }: ActorTypeBadgeProps) {
  const isHuman = actorType === 'HUMAN';

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
          isHuman
            ? 'bg-blue-100 text-blue-800'
            : 'bg-purple-100 text-purple-800'
        }`}
      >
        {isHuman ? '👤' : '🤖'}
        {isHuman ? 'Human' : 'AI'}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
        isHuman
          ? 'bg-blue-100 text-blue-800'
          : 'bg-purple-100 text-purple-800'
      }`}
    >
      {isHuman ? '👤' : '🤖'}
      <span>{isHuman ? 'Human' : 'AI'}</span>
      {role && !isHuman && (
        <span className="text-purple-600">({role})</span>
      )}
    </span>
  );
}
