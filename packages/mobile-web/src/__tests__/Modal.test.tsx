/**
 * Unit tests for Modal component
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from '../components/Modal';

describe('Modal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    title: 'Test Modal',
    children: <div>Modal content</div>,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.style.overflow = 'unset';
  });

  describe('Rendering', () => {
    it('renders when isOpen is true', () => {
      render(<Modal {...defaultProps} />);

      expect(screen.getByText('Test Modal')).toBeInTheDocument();
      expect(screen.getByText('Modal content')).toBeInTheDocument();
    });

    it('does not render when isOpen is false', () => {
      render(<Modal {...defaultProps} isOpen={false} />);

      expect(screen.queryByText('Test Modal')).not.toBeInTheDocument();
      expect(screen.queryByText('Modal content')).not.toBeInTheDocument();
    });

    it('renders footer when provided', () => {
      render(
        <Modal {...defaultProps} footer={<button>Save</button>} />
      );

      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    });

    it('does not render footer section when not provided', () => {
      const { container } = render(<Modal {...defaultProps} />);

      // Footer has bg-gray-50 class, so check for absence
      expect(container.querySelector('.bg-gray-50')).not.toBeInTheDocument();
    });
  });

  describe('Size variants', () => {
    it('applies sm size class', () => {
      const { container } = render(<Modal {...defaultProps} size="sm" />);

      expect(container.querySelector('.max-w-sm')).toBeInTheDocument();
    });

    it('applies md size class by default', () => {
      const { container } = render(<Modal {...defaultProps} />);

      expect(container.querySelector('.max-w-md')).toBeInTheDocument();
    });

    it('applies lg size class', () => {
      const { container } = render(<Modal {...defaultProps} size="lg" />);

      expect(container.querySelector('.max-w-lg')).toBeInTheDocument();
    });

    it('applies xl size class', () => {
      const { container } = render(<Modal {...defaultProps} size="xl" />);

      expect(container.querySelector('.max-w-xl')).toBeInTheDocument();
    });
  });

  describe('Close behavior', () => {
    it('calls onClose when backdrop is clicked', () => {
      const onClose = vi.fn();
      render(<Modal {...defaultProps} onClose={onClose} />);

      // The backdrop has bg-opacity-50 class
      const backdrop = document.querySelector('.bg-opacity-50');
      fireEvent.click(backdrop!);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when close button is clicked', () => {
      const onClose = vi.fn();
      render(<Modal {...defaultProps} onClose={onClose} />);

      // Close button is the only button in the header by default
      const closeButton = screen.getByRole('button');
      fireEvent.click(closeButton);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when Escape key is pressed', () => {
      const onClose = vi.fn();
      render(<Modal {...defaultProps} onClose={onClose} />);

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not call onClose when clicking inside modal content', () => {
      const onClose = vi.fn();
      render(<Modal {...defaultProps} onClose={onClose} />);

      const content = screen.getByText('Modal content');
      fireEvent.click(content);

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('Body scroll lock', () => {
    it('locks body scroll when modal is open', () => {
      render(<Modal {...defaultProps} />);

      expect(document.body.style.overflow).toBe('hidden');
    });

    it('unlocks body scroll when modal is closed', () => {
      const { rerender } = render(<Modal {...defaultProps} />);

      expect(document.body.style.overflow).toBe('hidden');

      rerender(<Modal {...defaultProps} isOpen={false} />);

      expect(document.body.style.overflow).toBe('unset');
    });

    it('unlocks body scroll on unmount', () => {
      const { unmount } = render(<Modal {...defaultProps} />);

      expect(document.body.style.overflow).toBe('hidden');

      unmount();

      expect(document.body.style.overflow).toBe('unset');
    });
  });

  describe('Keyboard event cleanup', () => {
    it('removes keydown listener when isOpen changes to false', () => {
      const onClose = vi.fn();
      const { rerender } = render(<Modal {...defaultProps} onClose={onClose} />);

      rerender(<Modal {...defaultProps} isOpen={false} onClose={onClose} />);

      // After modal is closed, Escape key should not trigger onClose
      fireEvent.keyDown(document, { key: 'Escape' });

      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
