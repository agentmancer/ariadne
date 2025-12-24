import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TwinePlayer from '../../../components/Twine/TwinePlayer';
import { TwineStory } from '../../../components/Twine/types';

const createTestStory = (overrides?: Partial<TwineStory>): TwineStory => ({
  name: 'Test Story',
  startPassage: 'Start',
  passages: [
    { id: '1', name: 'Start', text: 'Welcome! [[Go to Chapter 1|Chapter 1]]' },
    { id: '2', name: 'Chapter 1', text: 'Chapter 1 content. [[End]]' },
    { id: '3', name: 'End', text: 'The End.' },
  ],
  ...overrides,
});

describe('TwinePlayer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('rendering', () => {
    it('renders story name', () => {
      const story = createTestStory();
      render(<TwinePlayer story={story} />);

      expect(screen.getByText('Test Story')).toBeInTheDocument();
    });

    it('renders start passage content', () => {
      const story = createTestStory();
      render(<TwinePlayer story={story} />);

      expect(screen.getByText(/Welcome!/)).toBeInTheDocument();
    });

    it('renders current passage name', () => {
      const story = createTestStory();
      render(<TwinePlayer story={story} />);

      // "Start" appears multiple times (in passage name display and history)
      expect(screen.getAllByText('Start').length).toBeGreaterThan(0);
    });

    it('renders navigation links as buttons', () => {
      const story = createTestStory();
      render(<TwinePlayer story={story} />);

      expect(screen.getByRole('button', { name: /Go to Chapter 1/ })).toBeInTheDocument();
    });

    it('renders progress footer', () => {
      const story = createTestStory();
      render(<TwinePlayer story={story} />);

      expect(screen.getByText(/passages visited/)).toBeInTheDocument();
      expect(screen.getByText(/steps taken/)).toBeInTheDocument();
    });
  });

  describe('navigation', () => {
    it('navigates to new passage when link clicked', () => {
      const story = createTestStory();
      render(<TwinePlayer story={story} />);

      const link = screen.getByRole('button', { name: /Go to Chapter 1/ });
      fireEvent.click(link);

      expect(screen.getByText(/Chapter 1 content/)).toBeInTheDocument();
    });

    it('calls onPassageChange when navigating', () => {
      const onPassageChange = vi.fn();
      const story = createTestStory();
      render(<TwinePlayer story={story} onPassageChange={onPassageChange} />);

      const link = screen.getByRole('button', { name: /Go to Chapter 1/ });
      fireEvent.click(link);

      expect(onPassageChange).toHaveBeenCalledWith('Chapter 1', 'Start');
    });

    it('calls onChoice when choice is made', () => {
      const onChoice = vi.fn();
      const story = createTestStory();
      render(<TwinePlayer story={story} onChoice={onChoice} />);

      const link = screen.getByRole('button', { name: /Go to Chapter 1/ });
      fireEvent.click(link);

      expect(onChoice).toHaveBeenCalledWith({
        passageName: 'Start',
        choiceIndex: 0,
        choiceText: 'Go to Chapter 1',
        targetPassage: 'Chapter 1',
      });
    });

    it('enables back button after navigation', () => {
      const story = createTestStory();
      render(<TwinePlayer story={story} />);

      // Initially back button should be disabled
      const backButton = screen.getByRole('button', { name: /Go back/ });
      expect(backButton).toBeDisabled();

      // Navigate forward
      const link = screen.getByRole('button', { name: /Go to Chapter 1/ });
      fireEvent.click(link);

      // Now back button should be enabled
      expect(backButton).not.toBeDisabled();
    });

    it('navigates back when back button clicked', () => {
      const story = createTestStory();
      render(<TwinePlayer story={story} />);

      // Navigate forward
      const link = screen.getByRole('button', { name: /Go to Chapter 1/ });
      fireEvent.click(link);

      expect(screen.getByText(/Chapter 1 content/)).toBeInTheDocument();

      // Navigate back
      const backButton = screen.getByRole('button', { name: /Go back/ });
      fireEvent.click(backButton);

      expect(screen.getByText(/Welcome!/)).toBeInTheDocument();
    });
  });

  describe('story completion', () => {
    it('shows completion message when story ends', () => {
      const story = createTestStory();
      render(<TwinePlayer story={story} />);

      // Navigate to End passage
      fireEvent.click(screen.getByRole('button', { name: /Go to Chapter 1/ }));
      fireEvent.click(screen.getByRole('button', { name: /End/ }));

      expect(screen.getByText('Story Complete')).toBeInTheDocument();
    });

    it('calls onComplete when story ends', () => {
      const onComplete = vi.fn();
      const story = createTestStory();
      render(<TwinePlayer story={story} onComplete={onComplete} />);

      // Navigate to End passage
      fireEvent.click(screen.getByRole('button', { name: /Go to Chapter 1/ }));
      fireEvent.click(screen.getByRole('button', { name: /End/ }));

      expect(onComplete).toHaveBeenCalled();
      expect(onComplete).toHaveBeenCalledWith(['Start', 'Chapter 1', 'End']);
    });
  });

  describe('read-only mode', () => {
    it('hides navigation buttons in read-only mode', () => {
      const story = createTestStory();
      render(<TwinePlayer story={story} readOnly />);

      expect(screen.queryByRole('button', { name: /Go back/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Go to Chapter 1/ })).not.toBeInTheDocument();
    });
  });

  describe('history sidebar', () => {
    it('shows history sidebar by default', () => {
      const story = createTestStory();
      render(<TwinePlayer story={story} />);

      expect(screen.getByText('Journey')).toBeInTheDocument();
    });

    it('hides history sidebar when showHistory is false', () => {
      const story = createTestStory();
      render(<TwinePlayer story={story} showHistory={false} />);

      expect(screen.queryByText('Journey')).not.toBeInTheDocument();
    });

    it('tracks visited passages in history', () => {
      const story = createTestStory();
      render(<TwinePlayer story={story} />);

      // Navigate forward
      fireEvent.click(screen.getByRole('button', { name: /Go to Chapter 1/ }));

      // Both passages should appear in history
      const historyButtons = screen.getAllByRole('button', { name: /Start|Chapter 1/ });
      expect(historyButtons.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('error handling', () => {
    it('shows error for empty story', () => {
      const story: TwineStory = {
        name: 'Empty',
        passages: [],
      };
      render(<TwinePlayer story={story} />);

      expect(screen.getByText('Story Error')).toBeInTheDocument();
      expect(screen.getByText(/no passages/)).toBeInTheDocument();
    });

    it('shows error for missing passage', () => {
      const story: TwineStory = {
        name: 'Test',
        startPassage: 'NonExistent',
        passages: [
          { id: '1', name: 'Start', text: 'Hello' },
        ],
      };
      render(<TwinePlayer story={story} />);

      expect(screen.getByText('Story Error')).toBeInTheDocument();
    });
  });

  describe('passage highlighting', () => {
    it('highlights current passage when highlightPassage matches', () => {
      const story = createTestStory();
      const { container } = render(<TwinePlayer story={story} highlightPassage="Start" />);

      const highlightedElement = container.querySelector('.ring-primary-500');
      expect(highlightedElement).toBeInTheDocument();
    });
  });

  describe('text formatting', () => {
    it('renders bold text', () => {
      const story: TwineStory = {
        name: 'Test',
        startPassage: 'Start',
        passages: [
          { id: '1', name: 'Start', text: "This is ''bold'' text" },
        ],
      };
      const { container } = render(<TwinePlayer story={story} />);

      expect(container.querySelector('strong')).toBeInTheDocument();
    });

    it('renders italic text', () => {
      const story: TwineStory = {
        name: 'Test',
        startPassage: 'Start',
        passages: [
          { id: '1', name: 'Start', text: 'This is //italic// text' },
        ],
      };
      const { container } = render(<TwinePlayer story={story} />);

      expect(container.querySelector('em')).toBeInTheDocument();
    });
  });
});
