/**
 * Unit tests for AgentContext Service - Pure Functions
 *
 * These tests cover the pure utility functions that don't require database access.
 * Database-dependent functions should be tested via integration tests.
 */

import { describe, it, expect } from 'vitest';
import { CollaborativePhase, AgentCollaborativeContext } from '@ariadne/shared';
import {
  buildContextSummary,
  getLatestStoryDraft,
  getStoryDraftForRound,
  getFeedbackForRound,
} from '../../../services/collaborative/agent-context';

describe('AgentContext Service - Pure Functions', () => {
  const testParticipantId = 'participant-123';
  const now = new Date();

  const createMockContext = (
    overrides: Partial<AgentCollaborativeContext> = {}
  ): AgentCollaborativeContext => ({
    id: 'ctx-1',
    participantId: testParticipantId,
    currentRound: 1,
    currentPhase: CollaborativePhase.AUTHOR,
    ownStoryDrafts: [],
    partnerStoriesPlayed: [],
    feedbackGiven: [],
    feedbackReceived: [],
    cumulativeLearnings: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });

  describe('buildContextSummary', () => {
    it('should build basic summary with round and phase', () => {
      const context = createMockContext({
        currentRound: 2,
        currentPhase: CollaborativePhase.PLAY,
      });

      const summary = buildContextSummary(context);

      expect(summary).toContain('## Current State');
      expect(summary).toContain('Round: 2');
      expect(summary).toContain('Phase: PLAY');
    });

    it('should include own story drafts', () => {
      const context = createMockContext({
        ownStoryDrafts: [
          { round: 1, storyDataId: 'story-1', summary: 'First draft about adventure', createdAt: now.toISOString() },
          { round: 2, storyDataId: 'story-2', summary: 'Second draft with mystery', createdAt: now.toISOString() },
        ],
      });

      const summary = buildContextSummary(context);

      expect(summary).toContain('## Your Previous Stories');
      expect(summary).toContain('Round 1: First draft about adventure');
      expect(summary).toContain('Round 2: Second draft with mystery');
    });

    it('should include partner stories played with observations', () => {
      const context = createMockContext({
        partnerStoriesPlayed: [
          {
            round: 1,
            storyDataId: 'partner-1',
            playNotes: 'Interesting branching',
            choicesMade: [],
            observations: ['Good pacing', 'Engaging characters'],
            overallImpression: 'Really enjoyed the narrative flow',
          },
        ],
      });

      const summary = buildContextSummary(context);

      expect(summary).toContain("## Partner Stories You've Played");
      expect(summary).toContain('Round 1: Really enjoyed the narrative flow');
      expect(summary).toContain('Observations: Good pacing; Engaging characters');
    });

    it('should include feedback received with strengths and improvements', () => {
      const context = createMockContext({
        feedbackReceived: [
          {
            round: 1,
            comments: ['Nice work'],
            strengths: ['Creative premise', 'Good dialogue'],
            improvements: ['More branching', 'Add suspense'],
          },
        ],
      });

      const summary = buildContextSummary(context);

      expect(summary).toContain("## Feedback You've Received");
      expect(summary).toContain('Round 1:');
      expect(summary).toContain('Strengths: Creative premise, Good dialogue');
      expect(summary).toContain('To improve: More branching, Add suspense');
    });

    it('should include cumulative learnings with categories', () => {
      const context = createMockContext({
        cumulativeLearnings: [
          { round: 1, insight: 'Shorter passages work better', category: 'pacing' },
          { round: 1, insight: 'Players like meaningful choices', category: 'design' },
        ],
      });

      const summary = buildContextSummary(context);

      expect(summary).toContain('## Your Learnings So Far');
      expect(summary).toContain('[pacing] Shorter passages work better');
      expect(summary).toContain('[design] Players like meaningful choices');
    });

    it('should handle empty context gracefully', () => {
      const context = createMockContext();

      const summary = buildContextSummary(context);

      expect(summary).toContain('## Current State');
      expect(summary).toContain('Round: 1');
      expect(summary).toContain('Phase: AUTHOR');
      expect(summary).not.toContain('## Your Previous Stories');
      expect(summary).not.toContain("## Partner Stories You've Played");
      expect(summary).not.toContain("## Feedback You've Received");
      expect(summary).not.toContain('## Your Learnings So Far');
    });

    it('should use playNotes as fallback when overallImpression is missing', () => {
      const context = createMockContext({
        partnerStoriesPlayed: [
          {
            round: 1,
            storyDataId: 'partner-1',
            playNotes: 'Interesting story mechanics',
            choicesMade: [],
            observations: [],
            overallImpression: undefined,
          },
        ],
      });

      const summary = buildContextSummary(context);

      expect(summary).toContain('Round 1: Interesting story mechanics');
    });
  });

  describe('getLatestStoryDraft', () => {
    it('should return the last story draft', () => {
      const context = createMockContext({
        ownStoryDrafts: [
          { round: 1, storyDataId: 'story-1', summary: 'First', createdAt: '2024-01-01' },
          { round: 2, storyDataId: 'story-2', summary: 'Second', createdAt: '2024-01-02' },
          { round: 3, storyDataId: 'story-3', summary: 'Third', createdAt: '2024-01-03' },
        ],
      });

      const latest = getLatestStoryDraft(context);

      expect(latest).not.toBeNull();
      expect(latest?.storyDataId).toBe('story-3');
      expect(latest?.summary).toBe('Third');
    });

    it('should return null for empty drafts', () => {
      const context = createMockContext({ ownStoryDrafts: [] });

      const latest = getLatestStoryDraft(context);

      expect(latest).toBeNull();
    });
  });

  describe('getStoryDraftForRound', () => {
    it('should find draft for specific round', () => {
      const context = createMockContext({
        ownStoryDrafts: [
          { round: 1, storyDataId: 'story-1', summary: 'First', createdAt: '2024-01-01' },
          { round: 2, storyDataId: 'story-2', summary: 'Second', createdAt: '2024-01-02' },
          { round: 3, storyDataId: 'story-3', summary: 'Third', createdAt: '2024-01-03' },
        ],
      });

      const draft = getStoryDraftForRound(context, 2);

      expect(draft).not.toBeNull();
      expect(draft?.storyDataId).toBe('story-2');
    });

    it('should return null for non-existent round', () => {
      const context = createMockContext({
        ownStoryDrafts: [
          { round: 1, storyDataId: 'story-1', summary: 'First', createdAt: '2024-01-01' },
        ],
      });

      const draft = getStoryDraftForRound(context, 5);

      expect(draft).toBeNull();
    });
  });

  describe('getFeedbackForRound', () => {
    it('should find feedback for specific round', () => {
      const context = createMockContext({
        feedbackReceived: [
          { round: 1, comments: ['Good'], strengths: ['A'], improvements: [] },
          { round: 2, comments: ['Great'], strengths: ['B'], improvements: ['X'] },
        ],
      });

      const feedback = getFeedbackForRound(context, 2);

      expect(feedback).not.toBeNull();
      expect(feedback?.comments).toContain('Great');
      expect(feedback?.improvements).toContain('X');
    });

    it('should return null for non-existent round', () => {
      const context = createMockContext({
        feedbackReceived: [
          { round: 1, comments: ['Good'], strengths: [], improvements: [] },
        ],
      });

      const feedback = getFeedbackForRound(context, 3);

      expect(feedback).toBeNull();
    });
  });
});
