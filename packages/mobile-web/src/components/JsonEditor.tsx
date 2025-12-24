/**
 * JSON Editor component with validation
 */

import { useState, useEffect } from 'react';

interface JsonEditorProps {
  value: Record<string, unknown> | null | undefined;
  onChange: (value: Record<string, unknown>) => void;
  label?: string;
  error?: string;
  placeholder?: string;
  minHeight?: string;
  disabled?: boolean;
}

export function JsonEditor({
  value,
  onChange,
  label,
  error: externalError,
  placeholder = '{\n  \n}',
  minHeight = '120px',
  disabled = false,
}: JsonEditorProps) {
  const [text, setText] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);

  // Sync text with value prop
  useEffect(() => {
    if (value !== undefined && value !== null) {
      setText(JSON.stringify(value, null, 2));
    } else {
      setText('');
    }
  }, [value]);

  const handleChange = (newText: string) => {
    setText(newText);
    setParseError(null);

    if (!newText.trim()) {
      onChange({});
      return;
    }

    try {
      const parsed = JSON.parse(newText);
      if (typeof parsed !== 'object' || Array.isArray(parsed)) {
        setParseError('Must be a JSON object');
        return;
      }
      onChange(parsed);
    } catch {
      setParseError('Invalid JSON syntax');
    }
  };

  const handlePrettify = () => {
    try {
      const parsed = JSON.parse(text);
      setText(JSON.stringify(parsed, null, 2));
      setParseError(null);
    } catch {
      setParseError('Cannot format invalid JSON');
    }
  };

  const displayError = externalError || parseError;

  return (
    <div>
      {label && (
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-gray-700">
            {label}
          </label>
          <button
            type="button"
            onClick={handlePrettify}
            disabled={disabled}
            className="text-xs text-primary-600 hover:text-primary-800 disabled:opacity-50"
          >
            Format
          </button>
        </div>
      )}
      <textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full px-3 py-2 font-mono text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y ${
          displayError ? 'border-red-300' : 'border-gray-300'
        } ${disabled ? 'bg-gray-50 text-gray-500' : ''}`}
        style={{ minHeight }}
      />
      {displayError && (
        <p className="mt-1 text-sm text-red-600">{displayError}</p>
      )}
    </div>
  );
}
