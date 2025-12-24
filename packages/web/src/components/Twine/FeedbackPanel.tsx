import { useState, useMemo, useEffect } from 'react';
import { Comment, CommentType } from '../../services/api';

interface FeedbackPanelProps {
  /** All comments for this story */
  comments: Comment[];
  /** Current passage being viewed (for filtering/context) */
  currentPassage?: string;
  /** Current round number */
  round: number;
  /** Called when adding a new comment */
  onAddComment: (content: string, type: CommentType, passageName?: string) => void;
  /** Show only comments for current passage */
  filterByPassage?: boolean;
  /** Read-only mode (hide add form) */
  readOnly?: boolean;
}

const COMMENT_TYPE_CONFIG: Record<CommentType, { label: string; icon: string; color: string }> = {
  [CommentType.FEEDBACK]: {
    label: 'Feedback',
    icon: '💬',
    color: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  [CommentType.SUGGESTION]: {
    label: 'Suggestion',
    icon: '💡',
    color: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  },
  [CommentType.QUESTION]: {
    label: 'Question',
    icon: '❓',
    color: 'bg-purple-100 text-purple-700 border-purple-200',
  },
  [CommentType.PRAISE]: {
    label: 'Praise',
    icon: '⭐',
    color: 'bg-green-100 text-green-700 border-green-200',
  },
  [CommentType.CRITIQUE]: {
    label: 'Critique',
    icon: '📝',
    color: 'bg-orange-100 text-orange-700 border-orange-200',
  },
};

/**
 * FeedbackPanel - Sidebar for viewing and adding comments during story playthrough
 */
export default function FeedbackPanel({
  comments,
  currentPassage,
  round,
  onAddComment,
  filterByPassage = false,
  readOnly = false,
}: FeedbackPanelProps) {
  const [newComment, setNewComment] = useState('');
  const [commentType, setCommentType] = useState<CommentType>(CommentType.FEEDBACK);
  const [attachToPassage, setAttachToPassage] = useState(!!currentPassage);
  const [showTypeSelector, setShowTypeSelector] = useState(false);

  // Reset attachToPassage when currentPassage changes
  useEffect(() => {
    setAttachToPassage(!!currentPassage);
  }, [currentPassage]);

  // Filter and sort comments
  const filteredComments = useMemo(() => {
    let filtered = comments;

    // Filter by current passage if enabled
    if (filterByPassage && currentPassage) {
      filtered = filtered.filter(c => c.passageName === currentPassage);
    }

    // Sort by round (descending) then by creation time (ascending within round)
    return [...filtered].sort((a, b) => {
      if (b.round !== a.round) return b.round - a.round;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [comments, currentPassage, filterByPassage]);

  // Group comments by round
  const commentsByRound = useMemo(() => {
    const groups: Record<number, Comment[]> = {};
    filteredComments.forEach(comment => {
      if (!groups[comment.round]) {
        groups[comment.round] = [];
      }
      groups[comment.round].push(comment);
    });
    return groups;
  }, [filteredComments]);

  const handleSubmit = () => {
    if (!newComment.trim()) return;

    onAddComment(
      newComment.trim(),
      commentType,
      attachToPassage ? currentPassage : undefined
    );

    setNewComment('');
    setShowTypeSelector(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-gray-900">Feedback</h3>
          <span className="text-xs text-gray-500">
            {filteredComments.length} comment{filteredComments.length !== 1 ? 's' : ''}
          </span>
        </div>
        {currentPassage && filterByPassage && (
          <p className="text-xs text-gray-500 mt-1 truncate">
            On: {currentPassage}
          </p>
        )}
      </div>

      {/* Comments list */}
      <div className="flex-1 overflow-auto">
        {filteredComments.length === 0 ? (
          <div className="p-4 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-sm text-gray-500">
              {filterByPassage
                ? 'No comments on this passage yet.'
                : 'No comments yet. Share your thoughts!'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {Object.entries(commentsByRound)
              .sort(([a], [b]) => Number(b) - Number(a))
              .map(([roundNum, roundComments]) => (
                <div key={roundNum} className="py-2">
                  {/* Round header */}
                  <div className="px-4 py-1">
                    <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Round {roundNum}
                    </span>
                  </div>

                  {/* Comments in this round */}
                  <div className="space-y-2 px-3">
                    {roundComments.map((comment) => {
                      const typeConfig = comment.commentType
                        ? COMMENT_TYPE_CONFIG[comment.commentType]
                        : COMMENT_TYPE_CONFIG[CommentType.FEEDBACK];

                      return (
                        <div
                          key={comment.id}
                          className={`rounded-lg border p-3 ${typeConfig.color}`}
                        >
                          <div className="flex items-start gap-2">
                            <span className="text-sm">{typeConfig.icon}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm">{comment.content}</p>
                              {comment.passageName && !filterByPassage && (
                                <p className="text-xs opacity-70 mt-1 truncate">
                                  On: {comment.passageName}
                                </p>
                              )}
                            </div>
                          </div>
                          {comment.resolved && (
                            <div className="mt-2 pt-2 border-t border-current border-opacity-20">
                              <span className="text-xs">
                                Addressed in Round {comment.addressedInRound}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Add comment form */}
      {!readOnly && (
        <div className="border-t border-gray-200 p-3">
          {/* Comment type selector */}
          {showTypeSelector && (
            <div className="mb-3 flex flex-wrap gap-1">
              {Object.entries(COMMENT_TYPE_CONFIG).map(([type, config]) => (
                <button
                  key={type}
                  onClick={() => {
                    setCommentType(type as CommentType);
                    setShowTypeSelector(false);
                  }}
                  className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                    commentType === type
                      ? config.color
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {config.icon} {config.label}
                </button>
              ))}
            </div>
          )}

          {/* Current type badge */}
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => setShowTypeSelector(!showTypeSelector)}
              className={`px-2 py-1 text-xs rounded-full border ${COMMENT_TYPE_CONFIG[commentType].color}`}
            >
              {COMMENT_TYPE_CONFIG[commentType].icon} {COMMENT_TYPE_CONFIG[commentType].label}
            </button>

            {currentPassage && (
              <label className="flex items-center gap-1 text-xs text-gray-500">
                <input
                  type="checkbox"
                  checked={attachToPassage}
                  onChange={(e) => setAttachToPassage(e.target.checked)}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                Attach to passage
              </label>
            )}
          </div>

          {/* Text input */}
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Share your thoughts..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            rows={3}
          />

          {/* Submit button */}
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-gray-400">
              Round {round}
            </span>
            <button
              onClick={handleSubmit}
              disabled={!newComment.trim()}
              className="px-4 py-1.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Add Comment
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
