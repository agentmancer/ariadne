import { describe, it, expect, beforeEach } from 'vitest';
import { SymbioteMcpAdapter, SymbioteMcpConfig } from '../mcp-adapter';
import {
  OrchestrationState,
  OrchestrationPhase,
  OrchestrationActionType,
  createEmptyOrchestrationState,
} from '../types';

describe('SymbioteMcpAdapter', () => {
  let adapter: SymbioteMcpAdapter;
  let state: OrchestrationState;

  beforeEach(() => {
    adapter = new SymbioteMcpAdapter();
    state = createEmptyOrchestrationState('study-1', 'org/repo');
  });

  describe('constructor', () => {
    it('should use default configuration', () => {
      const defaultAdapter = new SymbioteMcpAdapter();
      expect(defaultAdapter).toBeDefined();
    });

    it('should accept custom configuration', () => {
      const config: SymbioteMcpConfig = {
        apiBaseUrl: 'http://custom:3000',
        authToken: 'test-token',
        timeout: 60000,
      };
      const customAdapter = new SymbioteMcpAdapter(config);
      expect(customAdapter).toBeDefined();
    });
  });

  describe('executeAction', () => {
    it('should return error for unknown action type', async () => {
      const result = await adapter.executeAction(
        'UNKNOWN_ACTION' as OrchestrationActionType,
        {},
        state
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown action type');
    });

    it('should catch and handle errors gracefully', async () => {
      // Create a state that will cause an error by setting it to null-like
      const badState = null as unknown as OrchestrationState;

      const result = await adapter.executeAction(
        OrchestrationActionType.CLAIM_ISSUE,
        { issueNumber: 42 },
        badState
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Issue Actions', () => {
    describe('claimIssue', () => {
      it('should claim an issue successfully', async () => {
        const result = await adapter.executeAction(
          OrchestrationActionType.CLAIM_ISSUE,
          { issueNumber: 42 },
          state
        );

        expect(result.success).toBe(true);
        expect(result.metadata?.issueNumber).toBe(42);
        expect(state.workItem.issueNumber).toBe(42);
      });

      it('should fail when issue number is missing', async () => {
        const result = await adapter.executeAction(
          OrchestrationActionType.CLAIM_ISSUE,
          {},
          state
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('Issue number is required');
      });
    });

    describe('analyzeIssue', () => {
      it('should analyze an issue successfully', async () => {
        state.workItem.issueNumber = 42;

        const result = await adapter.executeAction(
          OrchestrationActionType.ANALYZE_ISSUE,
          {},
          state
        );

        expect(result.success).toBe(true);
        expect(result.metadata?.analyzed).toBe(true);
      });
    });
  });

  describe('Agent Lifecycle Actions', () => {
    describe('provisionAgent', () => {
      it('should provision an agent successfully', async () => {
        const result = await adapter.executeAction(
          OrchestrationActionType.PROVISION_AGENT,
          { worktreePath: '/tmp/worktrees/issue-42' },
          state
        );

        expect(result.success).toBe(true);
        expect(result.metadata?.status).toBe('active');
        expect(state.agent.status).toBe('active');
        expect(state.agent.worktree).toBe('/tmp/worktrees/issue-42');
      });

      it('should generate agent ID if not provided', async () => {
        const result = await adapter.executeAction(
          OrchestrationActionType.PROVISION_AGENT,
          { worktreePath: '/tmp/worktrees/issue-42' },
          state
        );

        expect(result.success).toBe(true);
        expect(state.agent.id).toMatch(/^agent-\d+$/);
      });

      it('should use provided agent ID', async () => {
        const result = await adapter.executeAction(
          OrchestrationActionType.PROVISION_AGENT,
          { worktreePath: '/tmp/worktrees/issue-42', agentId: 'custom-agent' },
          state
        );

        expect(result.success).toBe(true);
        expect(state.agent.id).toBe('custom-agent');
      });
    });

    describe('startImplementation', () => {
      it('should start implementation when agent is active', async () => {
        state.agent.status = 'active';
        state.workItem.issueNumber = 42;

        const result = await adapter.executeAction(
          OrchestrationActionType.START_IMPLEMENTATION,
          {},
          state
        );

        expect(result.success).toBe(true);
        expect(state.workItem.branch).toBe('issue-42');
      });

      it('should fail when agent is not active', async () => {
        state.agent.status = 'provisioning';

        const result = await adapter.executeAction(
          OrchestrationActionType.START_IMPLEMENTATION,
          {},
          state
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('Agent is not active');
      });

      it('should use custom branch if provided', async () => {
        state.agent.status = 'active';

        const result = await adapter.executeAction(
          OrchestrationActionType.START_IMPLEMENTATION,
          { branch: 'feature/custom-branch' },
          state
        );

        expect(result.success).toBe(true);
        expect(state.workItem.branch).toBe('feature/custom-branch');
      });
    });
  });

  describe('PR Actions', () => {
    describe('createPR', () => {
      it('should create a PR successfully', async () => {
        state.workItem.issueNumber = 42;
        state.workItem.branch = 'issue-42';

        const result = await adapter.executeAction(
          OrchestrationActionType.CREATE_PR,
          { title: 'Fix #42' },
          state
        );

        expect(result.success).toBe(true);
        expect(result.metadata?.title).toBe('Fix #42');
        expect(state.workItem.prNumber).toBeDefined();
        expect(state.workItem.title).toBe('Fix #42');
      });

      it('should generate default title from issue number', async () => {
        state.workItem.issueNumber = 42;

        const result = await adapter.executeAction(
          OrchestrationActionType.CREATE_PR,
          {},
          state
        );

        expect(result.success).toBe(true);
        expect(result.metadata?.title).toBe('Fix #42');
      });
    });

    describe('updatePR', () => {
      it('should update an existing PR', async () => {
        state.workItem.prNumber = 100;

        const result = await adapter.executeAction(
          OrchestrationActionType.UPDATE_PR,
          {},
          state
        );

        expect(result.success).toBe(true);
        expect(result.metadata?.updated).toBe(true);
      });

      it('should fail when no PR exists', async () => {
        const result = await adapter.executeAction(
          OrchestrationActionType.UPDATE_PR,
          {},
          state
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('No PR exists');
      });
    });

    describe('requestReview', () => {
      it('should request review for existing PR', async () => {
        state.workItem.prNumber = 100;

        const result = await adapter.executeAction(
          OrchestrationActionType.REQUEST_REVIEW,
          { reviewers: ['user1', 'user2'] },
          state
        );

        expect(result.success).toBe(true);
        expect(result.metadata?.reviewers).toEqual(['user1', 'user2']);
      });

      it('should fail when no PR exists', async () => {
        const result = await adapter.executeAction(
          OrchestrationActionType.REQUEST_REVIEW,
          {},
          state
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('No PR exists');
      });
    });
  });

  describe('CI Actions', () => {
    describe('waitForCI', () => {
      it('should return success when CI passes', async () => {
        state.workItem.prNumber = 100;

        const result = await adapter.executeAction(
          OrchestrationActionType.WAIT_FOR_CI,
          { simulatePass: true },
          state
        );

        expect(result.success).toBe(true);
        expect(result.metadata?.ciStatus).toBe('passed');
      });

      it('should return failure when CI fails', async () => {
        state.workItem.prNumber = 100;

        const result = await adapter.executeAction(
          OrchestrationActionType.WAIT_FOR_CI,
          { simulatePass: false },
          state
        );

        expect(result.success).toBe(false);
        expect(result.metadata?.ciStatus).toBe('failed');
      });
    });

    describe('fixCI', () => {
      it('should attempt to fix CI', async () => {
        state.workItem.prNumber = 100;

        const result = await adapter.executeAction(
          OrchestrationActionType.FIX_CI,
          {},
          state
        );

        expect(result.success).toBe(true);
        expect(result.metadata?.fixAttempted).toBe(true);
      });
    });

    describe('retryCI', () => {
      it('should retry CI', async () => {
        state.workItem.prNumber = 100;

        const result = await adapter.executeAction(
          OrchestrationActionType.RETRY_CI,
          {},
          state
        );

        expect(result.success).toBe(true);
        expect(result.metadata?.retried).toBe(true);
      });
    });
  });

  describe('Review Actions', () => {
    describe('respondToReview', () => {
      it('should respond to review', async () => {
        state.workItem.prNumber = 100;

        const result = await adapter.executeAction(
          OrchestrationActionType.RESPOND_TO_REVIEW,
          { response: 'Thanks for the feedback!' },
          state
        );

        expect(result.success).toBe(true);
        expect(result.metadata?.responseLength).toBe(24);
      });
    });

    describe('addressFeedback', () => {
      it('should address feedback', async () => {
        state.workItem.prNumber = 100;

        const result = await adapter.executeAction(
          OrchestrationActionType.ADDRESS_FEEDBACK,
          {},
          state
        );

        expect(result.success).toBe(true);
        expect(result.metadata?.feedbackAddressed).toBe(true);
      });
    });
  });

  describe('Merge Actions', () => {
    describe('mergePR', () => {
      it('should merge PR with default squash method', async () => {
        state.workItem.prNumber = 100;

        const result = await adapter.executeAction(
          OrchestrationActionType.MERGE_PR,
          {},
          state
        );

        expect(result.success).toBe(true);
        expect(result.metadata?.mergeMethod).toBe('squash');
        expect(result.metadata?.merged).toBe(true);
      });

      it('should merge PR with custom merge method', async () => {
        state.workItem.prNumber = 100;

        const result = await adapter.executeAction(
          OrchestrationActionType.MERGE_PR,
          { mergeMethod: 'rebase' },
          state
        );

        expect(result.success).toBe(true);
        expect(result.metadata?.mergeMethod).toBe('rebase');
      });

      it('should fail when no PR exists', async () => {
        const result = await adapter.executeAction(
          OrchestrationActionType.MERGE_PR,
          {},
          state
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('No PR exists');
      });
    });

    describe('rebasePR', () => {
      it('should rebase PR', async () => {
        state.workItem.prNumber = 100;

        const result = await adapter.executeAction(
          OrchestrationActionType.REBASE_PR,
          {},
          state
        );

        expect(result.success).toBe(true);
        expect(result.metadata?.rebased).toBe(true);
      });

      it('should fail when no PR exists', async () => {
        const result = await adapter.executeAction(
          OrchestrationActionType.REBASE_PR,
          {},
          state
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('No PR exists');
      });
    });
  });

  describe('Cleanup Actions', () => {
    describe('cleanupWorktree', () => {
      it('should cleanup worktree', async () => {
        state.agent.worktree = '/tmp/worktrees/issue-42';

        const result = await adapter.executeAction(
          OrchestrationActionType.CLEANUP_WORKTREE,
          {},
          state
        );

        expect(result.success).toBe(true);
        expect(result.metadata?.cleaned).toBe(true);
        expect(state.agent.worktree).toBeUndefined();
      });

      it('should succeed when no worktree exists', async () => {
        const result = await adapter.executeAction(
          OrchestrationActionType.CLEANUP_WORKTREE,
          {},
          state
        );

        expect(result.success).toBe(true);
        expect(result.metadata?.noWorktree).toBe(true);
      });
    });

    describe('deleteBranch', () => {
      it('should delete branch', async () => {
        state.workItem.branch = 'issue-42';

        const result = await adapter.executeAction(
          OrchestrationActionType.DELETE_BRANCH,
          {},
          state
        );

        expect(result.success).toBe(true);
        expect(result.metadata?.deleted).toBe(true);
        expect(result.metadata?.branch).toBe('issue-42');
      });

      it('should succeed when no branch exists', async () => {
        const result = await adapter.executeAction(
          OrchestrationActionType.DELETE_BRANCH,
          {},
          state
        );

        expect(result.success).toBe(true);
        expect(result.metadata?.noBranch).toBe(true);
      });
    });
  });

  describe('Terminal Actions', () => {
    describe('markCompleted', () => {
      it('should mark orchestration as completed', async () => {
        state.history.push({
          action: OrchestrationActionType.PROVISION_AGENT,
          timestamp: new Date(),
          result: 'success',
          duration: 100,
        });

        const result = await adapter.executeAction(
          OrchestrationActionType.MARK_COMPLETED,
          {},
          state
        );

        expect(result.success).toBe(true);
        expect(state.agent.status).toBe('completed');
        expect(state.metadata.completedAt).toBeDefined();
        expect(result.metadata?.totalActions).toBe(1);
      });
    });

    describe('markFailed', () => {
      it('should mark orchestration as failed with reason', async () => {
        const result = await adapter.executeAction(
          OrchestrationActionType.MARK_FAILED,
          { reason: 'CI failures exceeded retry limit' },
          state
        );

        expect(result.success).toBe(true);
        expect(state.agent.status).toBe('failed');
        expect(result.metadata?.reason).toBe('CI failures exceeded retry limit');
        expect(state.metrics.errors).toContain('CI failures exceeded retry limit');
      });

      it('should use default reason if not provided', async () => {
        const result = await adapter.executeAction(
          OrchestrationActionType.MARK_FAILED,
          {},
          state
        );

        expect(result.success).toBe(true);
        expect(result.metadata?.reason).toBe('Unknown failure');
      });
    });
  });

  describe('State Mutations', () => {
    it('should properly track history through multiple actions', async () => {
      // Provision agent
      await adapter.executeAction(
        OrchestrationActionType.PROVISION_AGENT,
        { worktreePath: '/tmp/test' },
        state
      );
      expect(state.agent.status).toBe('active');

      // Start implementation
      state.workItem.issueNumber = 42;
      await adapter.executeAction(
        OrchestrationActionType.START_IMPLEMENTATION,
        {},
        state
      );
      expect(state.workItem.branch).toBe('issue-42');

      // Create PR
      await adapter.executeAction(
        OrchestrationActionType.CREATE_PR,
        {},
        state
      );
      expect(state.workItem.prNumber).toBeDefined();

      // Merge PR
      await adapter.executeAction(
        OrchestrationActionType.MERGE_PR,
        {},
        state
      );
      expect(state.workItem.prNumber).toBeDefined();
    });
  });
});
