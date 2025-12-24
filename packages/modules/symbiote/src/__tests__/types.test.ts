import { describe, it, expect } from 'vitest';
import {
  OrchestrationPhase,
  OrchestrationActionType,
  createEmptyOrchestrationState,
  isTerminalPhase,
  getNextPhase,
  recordAction,
  type OrchestrationState,
} from '../types';

describe('OrchestrationPhase', () => {
  it('should have all expected phases', () => {
    expect(OrchestrationPhase.ISSUE_ASSIGNED).toBe('issue_assigned');
    expect(OrchestrationPhase.AGENT_PROVISIONED).toBe('agent_provisioned');
    expect(OrchestrationPhase.IMPLEMENTATION).toBe('implementation');
    expect(OrchestrationPhase.PR_CREATED).toBe('pr_created');
    expect(OrchestrationPhase.CI_RUNNING).toBe('ci_running');
    expect(OrchestrationPhase.CI_FAILED).toBe('ci_failed');
    expect(OrchestrationPhase.REVIEW_PENDING).toBe('review_pending');
    expect(OrchestrationPhase.REVIEW_CHANGES_REQUESTED).toBe('review_changes_requested');
    expect(OrchestrationPhase.APPROVED).toBe('approved');
    expect(OrchestrationPhase.MERGING).toBe('merging');
    expect(OrchestrationPhase.MERGED).toBe('merged');
    expect(OrchestrationPhase.CLEANUP).toBe('cleanup');
    expect(OrchestrationPhase.COMPLETED).toBe('completed');
    expect(OrchestrationPhase.FAILED).toBe('failed');
  });
});

describe('OrchestrationActionType', () => {
  it('should have all expected action types', () => {
    expect(OrchestrationActionType.CLAIM_ISSUE).toBe('claim_issue');
    expect(OrchestrationActionType.CREATE_PR).toBe('create_pr');
    expect(OrchestrationActionType.FIX_CI).toBe('fix_ci');
    expect(OrchestrationActionType.MERGE_PR).toBe('merge_pr');
    expect(OrchestrationActionType.CLEANUP_WORKTREE).toBe('cleanup_worktree');
  });
});

describe('createEmptyOrchestrationState', () => {
  it('should create a valid initial state', () => {
    const state = createEmptyOrchestrationState('study-123', 'org/repo');

    expect(state.pluginType).toBe('symbiote-orchestrator');
    expect(state.version).toBe(1);
    expect(state.metadata.studyId).toBe('study-123');
    expect(state.metadata.startedAt).toBeInstanceOf(Date);
    expect(state.currentPhase).toBe(OrchestrationPhase.ISSUE_ASSIGNED);
    expect(state.workItem.repository).toBe('org/repo');
    expect(state.agent.status).toBe('provisioning');
    expect(state.history).toHaveLength(0);
    expect(state.metrics.ciAttempts).toBe(0);
    expect(state.metrics.errors).toHaveLength(0);
    expect(state.config).toEqual({});
  });

  it('should accept custom config', () => {
    const config = { timeout: 300000, maxRetries: 3 };
    const state = createEmptyOrchestrationState('study-123', 'org/repo', config);

    expect(state.config).toEqual(config);
  });
});

describe('isTerminalPhase', () => {
  it('should return true for COMPLETED', () => {
    expect(isTerminalPhase(OrchestrationPhase.COMPLETED)).toBe(true);
  });

  it('should return true for FAILED', () => {
    expect(isTerminalPhase(OrchestrationPhase.FAILED)).toBe(true);
  });

  it('should return false for non-terminal phases', () => {
    expect(isTerminalPhase(OrchestrationPhase.ISSUE_ASSIGNED)).toBe(false);
    expect(isTerminalPhase(OrchestrationPhase.IMPLEMENTATION)).toBe(false);
    expect(isTerminalPhase(OrchestrationPhase.PR_CREATED)).toBe(false);
    expect(isTerminalPhase(OrchestrationPhase.MERGED)).toBe(false);
  });
});

describe('getNextPhase', () => {
  it('should return correct next phase for PROVISION_AGENT', () => {
    expect(
      getNextPhase(OrchestrationPhase.ISSUE_ASSIGNED, OrchestrationActionType.PROVISION_AGENT)
    ).toBe(OrchestrationPhase.AGENT_PROVISIONED);
  });

  it('should return correct next phase for CREATE_PR', () => {
    expect(
      getNextPhase(OrchestrationPhase.IMPLEMENTATION, OrchestrationActionType.CREATE_PR)
    ).toBe(OrchestrationPhase.PR_CREATED);
  });

  it('should return correct next phase for MERGE_PR', () => {
    expect(
      getNextPhase(OrchestrationPhase.APPROVED, OrchestrationActionType.MERGE_PR)
    ).toBe(OrchestrationPhase.MERGING);
  });

  it('should return correct next phase for MARK_COMPLETED', () => {
    expect(
      getNextPhase(OrchestrationPhase.CLEANUP, OrchestrationActionType.MARK_COMPLETED)
    ).toBe(OrchestrationPhase.COMPLETED);
  });

  it('should return current phase for unknown action', () => {
    expect(
      getNextPhase(OrchestrationPhase.IMPLEMENTATION, 'unknown_action' as OrchestrationActionType)
    ).toBe(OrchestrationPhase.IMPLEMENTATION);
  });
});

describe('recordAction', () => {
  it('should add action to history', () => {
    const state = createEmptyOrchestrationState('study-123', 'org/repo');

    const action = recordAction(
      state,
      OrchestrationActionType.PROVISION_AGENT,
      'success',
      1500,
      { worktree: '/path/to/worktree' }
    );

    expect(state.history).toHaveLength(1);
    expect(action.phase).toBe(OrchestrationPhase.ISSUE_ASSIGNED);
    expect(action.action).toBe(OrchestrationActionType.PROVISION_AGENT);
    expect(action.result).toBe('success');
    expect(action.duration).toBe(1500);
    expect(action.metadata).toEqual({ worktree: '/path/to/worktree' });
    expect(action.timestamp).toBeInstanceOf(Date);
  });

  it('should work with string action type', () => {
    const state = createEmptyOrchestrationState('study-123', 'org/repo');

    const action = recordAction(state, 'custom_action', 'failure');

    expect(state.history).toHaveLength(1);
    expect(action.action).toBe('custom_action');
    expect(action.result).toBe('failure');
  });

  it('should accumulate multiple actions', () => {
    const state = createEmptyOrchestrationState('study-123', 'org/repo');

    recordAction(state, OrchestrationActionType.PROVISION_AGENT, 'success');
    recordAction(state, OrchestrationActionType.START_IMPLEMENTATION, 'success');
    recordAction(state, OrchestrationActionType.CREATE_PR, 'success');

    expect(state.history).toHaveLength(3);
  });
});

describe('OrchestrationState interface', () => {
  it('should allow complete state object', () => {
    const state: OrchestrationState = {
      pluginType: 'symbiote-orchestrator',
      version: 1,
      metadata: {
        studyId: 'study-123',
        trialId: 'trial-456',
        sessionId: 'session-789',
        startedAt: new Date(),
        completedAt: new Date(),
      },
      currentPhase: OrchestrationPhase.COMPLETED,
      workItem: {
        repository: 'org/repo',
        issueNumber: 42,
        prNumber: 100,
        branch: 'feat/issue-42',
        title: 'Add feature X',
        url: 'https://github.com/org/repo/pull/100',
      },
      agent: {
        id: 'agent-001',
        worktree: '/tmp/worktrees/issue-42',
        tmuxPane: 'main:0.1',
        status: 'completed',
        claudeSessionId: 'claude-session-123',
      },
      history: [
        {
          timestamp: new Date(),
          phase: OrchestrationPhase.ISSUE_ASSIGNED,
          action: OrchestrationActionType.PROVISION_AGENT,
          result: 'success',
          duration: 5000,
        },
      ],
      metrics: {
        timeToFirstPR: 60000,
        ciAttempts: 2,
        ciFailures: 1,
        reviewIterations: 1,
        timeToMerge: 120000,
        cleanupSuccess: true,
        implementationTime: 45000,
        ciWaitTime: 30000,
        reviewWaitTime: 15000,
        errors: [],
      },
      config: {
        timeout: 300000,
        maxRetries: 3,
      },
    };

    expect(state.pluginType).toBe('symbiote-orchestrator');
    expect(state.workItem.prNumber).toBe(100);
    expect(state.metrics.ciAttempts).toBe(2);
  });
});
