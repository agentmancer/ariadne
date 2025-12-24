import { useState, useRef, useEffect } from 'react';
import { TwinePassage, extractLinks } from './types';

interface PassageCardProps {
  passage: TwinePassage;
  isStart: boolean;
  isSelected: boolean;
  readOnly?: boolean;
  onSelect: () => void;
  onUpdate: (passage: TwinePassage) => void;
  onDelete: () => void;
  onSetStart: () => void;
}

export default function PassageCard({
  passage,
  isStart,
  isSelected,
  readOnly,
  onSelect,
  onUpdate,
  onDelete,
  onSetStart,
}: PassageCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(passage.name);
  const [editText, setEditText] = useState(passage.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const links = extractLinks(passage.text);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEditing]);

  const handleSave = () => {
    onUpdate({
      ...passage,
      name: editName.trim() || passage.name,
      text: editText,
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditName(passage.name);
    setEditText(passage.text);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancel();
    }
    if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    }
  };

  // Render link syntax with highlighting
  const renderTextWithLinks = (text: string) => {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    const regex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      // Add text before the link
      if (match.index > lastIndex) {
        parts.push(
          <span key={lastIndex}>{text.slice(lastIndex, match.index)}</span>
        );
      }
      // Add highlighted link
      const displayText = match[1];
      const target = match[2] || displayText;
      parts.push(
        <span
          key={match.index}
          className="text-primary-600 font-medium bg-primary-50 px-1 rounded"
          title={`Links to: ${target}`}
        >
          {match[0]}
        </span>
      );
      lastIndex = match.index + match[0].length;
    }
    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(<span key={lastIndex}>{text.slice(lastIndex)}</span>);
    }

    return parts.length > 0 ? parts : text;
  };

  return (
    <div
      onClick={onSelect}
      className={`
        bg-white rounded-lg border-2 transition-all cursor-pointer
        ${isSelected ? 'border-primary-500 shadow-lg ring-2 ring-primary-200' : 'border-gray-200 hover:border-gray-300'}
        ${isStart ? 'ring-2 ring-green-200' : ''}
      `}
    >
      {/* Header */}
      <div className={`px-3 py-2 border-b ${isStart ? 'bg-green-50' : 'bg-gray-50'} rounded-t-lg`}>
        <div className="flex items-center justify-between">
          {isEditing && !readOnly ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 px-2 py-1 text-sm font-medium border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="Passage name"
            />
          ) : (
            <h3 className="font-medium text-gray-900 truncate flex items-center gap-2">
              {passage.name}
              {isStart && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                  Start
                </span>
              )}
            </h3>
          )}

          {!readOnly && (
            <div className="flex items-center gap-1 ml-2">
              {!isStart && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSetStart();
                  }}
                  className="p-1 text-gray-400 hover:text-green-600 rounded"
                  title="Set as start passage"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l14 9-14 9V3z" />
                  </svg>
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="p-1 text-gray-400 hover:text-red-600 rounded"
                title="Delete passage"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Tags */}
        {passage.tags && passage.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {passage.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3">
        {isEditing && !readOnly ? (
          <div className="space-y-2">
            <textarea
              ref={textareaRef}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full h-32 px-2 py-1 text-sm font-mono border border-gray-300 rounded resize-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="Write your passage content here. Use [[Link Text]] or [[Display|Target]] for links."
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={handleCancel}
                className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-3 py-1 text-sm bg-primary-600 text-white rounded hover:bg-primary-700"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <div
            onClick={(e) => {
              if (!readOnly) {
                e.stopPropagation();
                setIsEditing(true);
              }
            }}
            className={`text-sm text-gray-700 whitespace-pre-wrap ${!readOnly ? 'hover:bg-gray-50 rounded p-1 -m-1 cursor-text' : ''}`}
          >
            {passage.text ? (
              <div className="line-clamp-4">{renderTextWithLinks(passage.text)}</div>
            ) : (
              <span className="text-gray-400 italic">Click to add content...</span>
            )}
          </div>
        )}

        {/* Links summary */}
        {links.length > 0 && !isEditing && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <span>{links.length} link{links.length !== 1 ? 's' : ''}</span>
              <span className="text-gray-400">
                ({links.map(l => l.target).join(', ')})
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
