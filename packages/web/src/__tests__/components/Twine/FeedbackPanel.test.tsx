import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FeedbackPanel from '../../../components/Twine/FeedbackPanel';
import { Comment, CommentType } from '../../../services/api';

const createMockComment = (overrides?: Partial<Comment>): Comment => ({
  id: '1',
  authorId: 'author-1',
  targetParticipantId: 'participant-1',
  content: 'Test comment',
  passageName: 'Start',
  round: 1,
  phase: 'REVIEW',
  commentType: CommentType.FEEDBACK,
  resolved: false,
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe('FeedbackPanel', () => {
  const defaultProps = {
    comments: [],
    round: 1,
    onAddComment: vi.fn(),
  };

  describe('rendering', () => {
    it('renders header with comment count', () => {
      render(<FeedbackPanel {...defaultProps} />);

      expect(screen.getByText('Feedback')).toBeInTheDocument();
      expect(screen.getByText('0 comments')).toBeInTheDocument();
    });

    it('shows singular "comment" for single comment', () => {
      const comments = [createMockComment()];
      render(<FeedbackPanel {...defaultProps} comments={comments} />);

      expect(screen.getByText('1 comment')).toBeInTheDocument();
    });

    it('shows empty state when no comments', () => {
      render(<FeedbackPanel {...defaultProps} />);

      expect(screen.getByText(/No comments yet/)).toBeInTheDocument();
    });

    it('renders comments', () => {
      const comments = [
        createMockComment({ content: 'First comment' }),
        createMockComment({ id: '2', content: 'Second comment' }),
      ];
      render(<FeedbackPanel {...defaultProps} comments={comments} />);

      expect(screen.getByText('First comment')).toBeInTheDocument();
      expect(screen.getByText('Second comment')).toBeInTheDocument();
    });

    it('groups comments by round', () => {
      const comments = [
        createMockComment({ round: 1, content: 'Round 1 comment' }),
        createMockComment({ id: '2', round: 2, content: 'Round 2 comment' }),
      ];
      render(<FeedbackPanel {...defaultProps} comments={comments} />);

      // Use getAllByText since "Round 1" appears in both header and footer
      expect(screen.getAllByText('Round 1').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Round 2').length).toBeGreaterThan(0);
    });

    it('shows passage name on comments when not filtering', () => {
      const comments = [createMockComment({ passageName: 'Chapter 1' })];
      render(<FeedbackPanel {...defaultProps} comments={comments} filterByPassage={false} />);

      expect(screen.getByText(/On: Chapter 1/)).toBeInTheDocument();
    });
  });

  describe('comment types', () => {
    it('renders feedback type with correct icon', () => {
      const comments = [createMockComment({ commentType: CommentType.FEEDBACK })];
      render(<FeedbackPanel {...defaultProps} comments={comments} />);

      expect(screen.getByText(/Test comment/)).toBeInTheDocument();
    });

    it('renders suggestion type', () => {
      const comments = [createMockComment({ commentType: CommentType.SUGGESTION })];
      render(<FeedbackPanel {...defaultProps} comments={comments} />);

      expect(screen.getByText(/Test comment/)).toBeInTheDocument();
    });

    it('renders question type', () => {
      const comments = [createMockComment({ commentType: CommentType.QUESTION })];
      render(<FeedbackPanel {...defaultProps} comments={comments} />);

      expect(screen.getByText(/Test comment/)).toBeInTheDocument();
    });

    it('renders praise type', () => {
      const comments = [createMockComment({ commentType: CommentType.PRAISE })];
      render(<FeedbackPanel {...defaultProps} comments={comments} />);

      expect(screen.getByText(/Test comment/)).toBeInTheDocument();
    });

    it('renders critique type', () => {
      const comments = [createMockComment({ commentType: CommentType.CRITIQUE })];
      render(<FeedbackPanel {...defaultProps} comments={comments} />);

      expect(screen.getByText(/Test comment/)).toBeInTheDocument();
    });
  });

  describe('resolved comments', () => {
    it('shows addressed in round for resolved comments', () => {
      const comments = [createMockComment({ resolved: true, addressedInRound: 2 })];
      render(<FeedbackPanel {...defaultProps} comments={comments} />);

      expect(screen.getByText(/Addressed in Round 2/)).toBeInTheDocument();
    });
  });

  describe('filtering', () => {
    it('filters by current passage when enabled', () => {
      const comments = [
        createMockComment({ passageName: 'Start', content: 'On Start' }),
        createMockComment({ id: '2', passageName: 'End', content: 'On End' }),
      ];
      render(
        <FeedbackPanel
          {...defaultProps}
          comments={comments}
          currentPassage="Start"
          filterByPassage={true}
        />
      );

      expect(screen.getByText('On Start')).toBeInTheDocument();
      expect(screen.queryByText('On End')).not.toBeInTheDocument();
    });

    it('shows current passage name when filtering', () => {
      render(
        <FeedbackPanel
          {...defaultProps}
          currentPassage="Chapter 1"
          filterByPassage={true}
        />
      );

      expect(screen.getByText(/On: Chapter 1/)).toBeInTheDocument();
    });
  });

  describe('add comment form', () => {
    it('renders add comment form in non-read-only mode', () => {
      render(<FeedbackPanel {...defaultProps} />);

      expect(screen.getByPlaceholderText('Share your thoughts...')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add Comment' })).toBeInTheDocument();
    });

    it('hides add comment form in read-only mode', () => {
      render(<FeedbackPanel {...defaultProps} readOnly />);

      expect(screen.queryByPlaceholderText('Share your thoughts...')).not.toBeInTheDocument();
    });

    it('calls onAddComment when form submitted', () => {
      const onAddComment = vi.fn();
      render(<FeedbackPanel {...defaultProps} onAddComment={onAddComment} />);

      const textarea = screen.getByPlaceholderText('Share your thoughts...');
      fireEvent.change(textarea, { target: { value: 'New comment' } });

      const submitButton = screen.getByRole('button', { name: 'Add Comment' });
      fireEvent.click(submitButton);

      expect(onAddComment).toHaveBeenCalledWith('New comment', CommentType.FEEDBACK, undefined);
    });

    it('includes passage name when attached', () => {
      const onAddComment = vi.fn();
      render(
        <FeedbackPanel
          {...defaultProps}
          onAddComment={onAddComment}
          currentPassage="Chapter 1"
        />
      );

      const textarea = screen.getByPlaceholderText('Share your thoughts...');
      fireEvent.change(textarea, { target: { value: 'Comment on passage' } });

      const submitButton = screen.getByRole('button', { name: 'Add Comment' });
      fireEvent.click(submitButton);

      expect(onAddComment).toHaveBeenCalledWith('Comment on passage', CommentType.FEEDBACK, 'Chapter 1');
    });

    it('clears textarea after submission', () => {
      const onAddComment = vi.fn();
      render(<FeedbackPanel {...defaultProps} onAddComment={onAddComment} />);

      const textarea = screen.getByPlaceholderText('Share your thoughts...') as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: 'New comment' } });

      const submitButton = screen.getByRole('button', { name: 'Add Comment' });
      fireEvent.click(submitButton);

      expect(textarea.value).toBe('');
    });

    it('disables submit button when textarea is empty', () => {
      render(<FeedbackPanel {...defaultProps} />);

      const submitButton = screen.getByRole('button', { name: 'Add Comment' });
      expect(submitButton).toBeDisabled();
    });

    it('enables submit button when text is entered', () => {
      render(<FeedbackPanel {...defaultProps} />);

      const textarea = screen.getByPlaceholderText('Share your thoughts...');
      fireEvent.change(textarea, { target: { value: 'Some text' } });

      const submitButton = screen.getByRole('button', { name: 'Add Comment' });
      expect(submitButton).not.toBeDisabled();
    });

    it('does not submit whitespace-only comments', () => {
      const onAddComment = vi.fn();
      render(<FeedbackPanel {...defaultProps} onAddComment={onAddComment} />);

      const textarea = screen.getByPlaceholderText('Share your thoughts...');
      fireEvent.change(textarea, { target: { value: '   ' } });

      const submitButton = screen.getByRole('button', { name: 'Add Comment' });
      fireEvent.click(submitButton);

      expect(onAddComment).not.toHaveBeenCalled();
    });
  });

  describe('comment type selector', () => {
    it('shows current comment type badge', () => {
      render(<FeedbackPanel {...defaultProps} />);

      // The badge button should exist in the form area
      expect(screen.getByRole('button', { name: /Feedback/ })).toBeInTheDocument();
    });

    it('opens type selector when badge clicked', () => {
      render(<FeedbackPanel {...defaultProps} />);

      const badge = screen.getByRole('button', { name: /Feedback/ });
      fireEvent.click(badge);

      // All type options should be visible
      expect(screen.getByRole('button', { name: /Suggestion/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Question/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Praise/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Critique/ })).toBeInTheDocument();
    });

    it('changes comment type when option selected', () => {
      const onAddComment = vi.fn();
      render(<FeedbackPanel {...defaultProps} onAddComment={onAddComment} />);

      // Open type selector
      const badge = screen.getByRole('button', { name: /Feedback/ });
      fireEvent.click(badge);

      // Select Suggestion
      const suggestionButton = screen.getByRole('button', { name: /Suggestion/ });
      fireEvent.click(suggestionButton);

      // Submit comment
      const textarea = screen.getByPlaceholderText('Share your thoughts...');
      fireEvent.change(textarea, { target: { value: 'A suggestion' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add Comment' }));

      expect(onAddComment).toHaveBeenCalledWith('A suggestion', CommentType.SUGGESTION, undefined);
    });
  });

  describe('attach to passage toggle', () => {
    it('shows attach checkbox when current passage exists', () => {
      render(<FeedbackPanel {...defaultProps} currentPassage="Chapter 1" />);

      expect(screen.getByLabelText('Attach to passage')).toBeInTheDocument();
    });

    it('hides attach checkbox when no current passage', () => {
      render(<FeedbackPanel {...defaultProps} />);

      expect(screen.queryByLabelText('Attach to passage')).not.toBeInTheDocument();
    });

    it('does not attach passage when unchecked', () => {
      const onAddComment = vi.fn();
      render(
        <FeedbackPanel
          {...defaultProps}
          onAddComment={onAddComment}
          currentPassage="Chapter 1"
        />
      );

      // Uncheck attach to passage
      const checkbox = screen.getByLabelText('Attach to passage');
      fireEvent.click(checkbox);

      // Submit comment
      const textarea = screen.getByPlaceholderText('Share your thoughts...');
      fireEvent.change(textarea, { target: { value: 'General comment' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add Comment' }));

      expect(onAddComment).toHaveBeenCalledWith('General comment', CommentType.FEEDBACK, undefined);
    });
  });

  describe('keyboard shortcuts', () => {
    it('submits on Ctrl+Enter', () => {
      const onAddComment = vi.fn();
      render(<FeedbackPanel {...defaultProps} onAddComment={onAddComment} />);

      const textarea = screen.getByPlaceholderText('Share your thoughts...');
      fireEvent.change(textarea, { target: { value: 'Quick comment' } });
      fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

      expect(onAddComment).toHaveBeenCalledWith('Quick comment', CommentType.FEEDBACK, undefined);
    });

    it('submits on Meta+Enter (Mac)', () => {
      const onAddComment = vi.fn();
      render(<FeedbackPanel {...defaultProps} onAddComment={onAddComment} />);

      const textarea = screen.getByPlaceholderText('Share your thoughts...');
      fireEvent.change(textarea, { target: { value: 'Quick comment' } });
      fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });

      expect(onAddComment).toHaveBeenCalledWith('Quick comment', CommentType.FEEDBACK, undefined);
    });
  });
});
