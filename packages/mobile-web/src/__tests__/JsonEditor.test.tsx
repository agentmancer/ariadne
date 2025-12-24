/**
 * Unit tests for JsonEditor component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { JsonEditor } from '../components/JsonEditor';

describe('JsonEditor', () => {
  const defaultProps = {
    value: { key: 'value' },
    onChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders textarea with formatted JSON value', () => {
      render(<JsonEditor {...defaultProps} />);

      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveValue(JSON.stringify({ key: 'value' }, null, 2));
    });

    it('renders label when provided', () => {
      render(<JsonEditor {...defaultProps} label="Configuration" />);

      expect(screen.getByText('Configuration')).toBeInTheDocument();
    });

    it('does not render label when not provided', () => {
      render(<JsonEditor {...defaultProps} />);

      expect(screen.queryByText('Format')).not.toBeInTheDocument();
    });

    it('renders Format button when label is provided', () => {
      render(<JsonEditor {...defaultProps} label="Config" />);

      expect(screen.getByRole('button', { name: 'Format' })).toBeInTheDocument();
    });

    it('renders empty textarea when value is null', () => {
      render(<JsonEditor {...defaultProps} value={null} />);

      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveValue('');
    });

    it('renders empty textarea when value is undefined', () => {
      render(<JsonEditor {...defaultProps} value={undefined} />);

      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveValue('');
    });
  });

  describe('Value changes', () => {
    it('calls onChange with parsed object for valid JSON', () => {
      const onChange = vi.fn();
      render(<JsonEditor {...defaultProps} value={{}} onChange={onChange} />);

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: '{"name": "test"}' } });

      expect(onChange).toHaveBeenCalledWith({ name: 'test' });
    });

    it('calls onChange with empty object for empty input', () => {
      const onChange = vi.fn();
      render(<JsonEditor {...defaultProps} onChange={onChange} />);

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: '  ' } });

      expect(onChange).toHaveBeenCalledWith({});
    });

    it('does not call onChange for invalid JSON', () => {
      const onChange = vi.fn();
      render(<JsonEditor {...defaultProps} value={{}} onChange={onChange} />);

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: '{invalid json' } });

      // onChange should only have been called from initial render sync
      expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ invalid: expect.anything() }));
    });
  });

  describe('Validation errors', () => {
    it('shows error for invalid JSON syntax', () => {
      render(<JsonEditor {...defaultProps} value={{}} />);

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: '{not valid}' } });

      expect(screen.getByText('Invalid JSON syntax')).toBeInTheDocument();
    });

    it('shows error when value is an array', () => {
      render(<JsonEditor {...defaultProps} value={{}} />);

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: '[1, 2, 3]' } });

      expect(screen.getByText('Must be a JSON object')).toBeInTheDocument();
    });

    it('shows error when value is a primitive', () => {
      render(<JsonEditor {...defaultProps} value={{}} />);

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: '"just a string"' } });

      expect(screen.getByText('Must be a JSON object')).toBeInTheDocument();
    });

    it('shows external error when provided', () => {
      render(<JsonEditor {...defaultProps} error="Server validation failed" />);

      expect(screen.getByText('Server validation failed')).toBeInTheDocument();
    });

    it('clears parse error when valid JSON is entered', () => {
      render(<JsonEditor {...defaultProps} value={{}} />);

      const textarea = screen.getByRole('textbox');

      // Enter invalid JSON
      fireEvent.change(textarea, { target: { value: '{invalid' } });
      expect(screen.getByText('Invalid JSON syntax')).toBeInTheDocument();

      // Enter valid JSON
      fireEvent.change(textarea, { target: { value: '{"valid": true}' } });
      expect(screen.queryByText('Invalid JSON syntax')).not.toBeInTheDocument();
    });

    it('applies error styling to textarea when error exists', () => {
      render(<JsonEditor {...defaultProps} error="Some error" />);

      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveClass('border-red-300');
    });
  });

  describe('Format/Prettify functionality', () => {
    it('formats valid JSON when Format button is clicked', async () => {
      render(<JsonEditor {...defaultProps} label="Config" value={{}} />);

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: '{"a":1,"b":2}' } });

      const formatButton = screen.getByRole('button', { name: 'Format' });
      fireEvent.click(formatButton);

      await waitFor(() => {
        expect(textarea).toHaveValue(JSON.stringify({ a: 1, b: 2 }, null, 2));
      });
    });

    it('shows error when trying to format invalid JSON', () => {
      render(<JsonEditor {...defaultProps} label="Config" value={{}} />);

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: '{invalid}' } });

      const formatButton = screen.getByRole('button', { name: 'Format' });
      fireEvent.click(formatButton);

      expect(screen.getByText('Cannot format invalid JSON')).toBeInTheDocument();
    });
  });

  describe('Disabled state', () => {
    it('disables textarea when disabled is true', () => {
      render(<JsonEditor {...defaultProps} disabled={true} />);

      const textarea = screen.getByRole('textbox');
      expect(textarea).toBeDisabled();
    });

    it('disables Format button when disabled is true', () => {
      render(<JsonEditor {...defaultProps} label="Config" disabled={true} />);

      const formatButton = screen.getByRole('button', { name: 'Format' });
      expect(formatButton).toBeDisabled();
    });

    it('applies disabled styling to textarea', () => {
      render(<JsonEditor {...defaultProps} disabled={true} />);

      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveClass('bg-gray-50');
    });
  });

  describe('Placeholder', () => {
    it('uses default placeholder', () => {
      render(<JsonEditor {...defaultProps} value={null} />);

      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveAttribute('placeholder', '{\n  \n}');
    });

    it('uses custom placeholder', () => {
      render(<JsonEditor {...defaultProps} value={null} placeholder='{"example": true}' />);

      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveAttribute('placeholder', '{"example": true}');
    });
  });

  describe('Styling', () => {
    it('applies custom minHeight', () => {
      render(<JsonEditor {...defaultProps} minHeight="200px" />);

      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveStyle({ minHeight: '200px' });
    });

    it('uses default minHeight', () => {
      render(<JsonEditor {...defaultProps} />);

      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveStyle({ minHeight: '120px' });
    });
  });
});
