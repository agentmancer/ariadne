import { describe, it, expect } from 'vitest';
import {
  getAvailableActionsForPhase,
  isActionValidForPhase,
  getExpectedNextActions,
  getPrimaryActionForPhase,
} from '../actions';
import {
  OrchestrationPhase,
  OrchestrationActionType,
  createEmptyOrchestrationState,
} from '../types';

describe('getAvailableActionsForPhase', () => {
  it('should return actions for ISSUE_ASSIGNED phase', () => {
    const state = createEmptyOrchestrationState('study-1', 'org/repo');

    const actions = getAvailableActionsForPhase(state);

    expect(actions.length).toBeGreaterThan(0);
    const actionTypes = actions.map((a) => a.type);
    expect(actionTypes).toContain(OrchestrationActionType.CLAIM_ISSUE);
    expect(actionTypes).toContain(OrchestrationActionType.ANALYZE_ISSUE);
    expect(actionTypes).toContain(OrchestrationActionType.PROVISION_AGENT);
  });

  it('should return actions for AGENT_PROVISIONED phase', () => {
    const state = createEmptyOrchestrationState('study-1', 'org/repo');
    state.currentPhase = OrchestrationPhase.AGENT_PROVISIONED;

    const actions = getAvailableActionsForPhase(state);
    const actionTypes = actions.map((a) => a.type);

    expect(actionTypes).toContain(OrchestrationActionType.START_IMPLEMENTATION);
    expect(actionTypes).toContain(OrchestrationActionType.MARK_FAILED);
  });

  it('should return actions for IMPLEMENTATION phase', () => {
    const state = createEmptyOrchestrationState('study-1', 'org/repo');
    state.currentPhase = OrchestrationPhase.IMPLEMENTATION;

    const actions = getAvailableActionsForPhase(state);
    const actionTypes = actions.map((a) => a.type);

    expect(actionTypes).toContain(OrchestrationActionType.CREATE_PR);
  });

  it('should return actions for PR_CREATED phase', () => {
    const state = createEmptyOrchestrationState('study-1', 'org/repo');
    state.currentPhase = OrchestrationPhase.PR_CREATED;

    const actions = getAvailableActionsForPhase(state);
    const actionTypes = actions.map((a) => a.type);

    expect(actionTypes).toContain(OrchestrationActionType.UPDATE_PR);
    expect(actionTypes).toContain(OrchestrationActionType.WAIT_FOR_CI);
    expect(actionTypes).toContain(OrchestrationActionType.REQUEST_REVIEW);
  });

  it('should return actions for CI_FAILED phase', () => {
    const state = createEmptyOrchestrationState('study-1', 'org/repo');
    state.currentPhase = OrchestrationPhase.CI_FAILED;

    const actions = getAvailableActionsForPhase(state);
    const actionTypes = actions.map((a) => a.type);

    expect(actionTypes).toContain(OrchestrationActionType.FIX_CI);
    expect(actionTypes).toContain(OrchestrationActionType.RETRY_CI);
    expect(actionTypes).toContain(OrchestrationActionType.MARK_FAILED);
  });

  it('should return actions for APPROVED phase', () => {
    const state = createEmptyOrchestrationState('study-1', 'org/repo');
    state.currentPhase = OrchestrationPhase.APPROVED;

    const actions = getAvailableActionsForPhase(state);
    const actionTypes = actions.map((a) => a.type);

    expect(actionTypes).toContain(OrchestrationActionType.MERGE_PR);
    expect(actionTypes).toContain(OrchestrationActionType.REBASE_PR);
  });

  it('should return empty array for COMPLETED phase', () => {
    const state = createEmptyOrchestrationState('study-1', 'org/repo');
    state.currentPhase = OrchestrationPhase.COMPLETED;

    const actions = getAvailableActionsForPhase(state);

    expect(actions).toEqual([]);
  });

  it('should return empty array for FAILED phase', () => {
    const state = createEmptyOrchestrationState('study-1', 'org/repo');
    state.currentPhase = OrchestrationPhase.FAILED;

    const actions = getAvailableActionsForPhase(state);

    expect(actions).toEqual([]);
  });

  it('should include metadata with description', () => {
    const state = createEmptyOrchestrationState('study-1', 'org/repo');

    const actions = getAvailableActionsForPhase(state);

    actions.forEach((action) => {
      expect(action.metadata).toBeDefined();
      expect(action.metadata?.description).toBeTruthy();
    });
  });

  it('should build default params based on state', () => {
    const state = createEmptyOrchestrationState('study-1', 'org/repo');
    state.workItem.issueNumber = 42;

    const actions = getAvailableActionsForPhase(state);
    const provisionAction = actions.find(
      (a) => a.type === OrchestrationActionType.PROVISION_AGENT
    );

    expect(provisionAction?.params.worktreePath).toContain('issue-42');
  });
});

describe('isActionValidForPhase', () => {
  it('should return true for valid actions', () => {
    expect(
      isActionValidForPhase(
        OrchestrationActionType.PROVISION_AGENT,
        OrchestrationPhase.ISSUE_ASSIGNED
      )
    ).toBe(true);

    expect(
      isActionValidForPhase(
        OrchestrationActionType.CREATE_PR,
        OrchestrationPhase.IMPLEMENTATION
      )
    ).toBe(true);

    expect(
      isActionValidForPhase(
        OrchestrationActionType.MERGE_PR,
        OrchestrationPhase.APPROVED
      )
    ).toBe(true);
  });

  it('should return false for invalid actions', () => {
    expect(
      isActionValidForPhase(
        OrchestrationActionType.MERGE_PR,
        OrchestrationPhase.ISSUE_ASSIGNED
      )
    ).toBe(false);

    expect(
      isActionValidForPhase(
        OrchestrationActionType.CREATE_PR,
        OrchestrationPhase.COMPLETED
      )
    ).toBe(false);

    expect(
      isActionValidForPhase(
        OrchestrationActionType.PROVISION_AGENT,
        OrchestrationPhase.MERGED
      )
    ).toBe(false);
  });
});

describe('getExpectedNextActions', () => {
  it('should return PROVISION_AGENT for ISSUE_ASSIGNED', () => {
    const actions = getExpectedNextActions(OrchestrationPhase.ISSUE_ASSIGNED);
    expect(actions).toContain(OrchestrationActionType.PROVISION_AGENT);
  });

  it('should return START_IMPLEMENTATION for AGENT_PROVISIONED', () => {
    const actions = getExpectedNextActions(OrchestrationPhase.AGENT_PROVISIONED);
    expect(actions).toContain(OrchestrationActionType.START_IMPLEMENTATION);
  });

  it('should return CREATE_PR for IMPLEMENTATION', () => {
    const actions = getExpectedNextActions(OrchestrationPhase.IMPLEMENTATION);
    expect(actions).toContain(OrchestrationActionType.CREATE_PR);
  });

  it('should return MERGE_PR for APPROVED', () => {
    const actions = getExpectedNextActions(OrchestrationPhase.APPROVED);
    expect(actions).toContain(OrchestrationActionType.MERGE_PR);
  });

  it('should return MARK_COMPLETED for CLEANUP', () => {
    const actions = getExpectedNextActions(OrchestrationPhase.CLEANUP);
    expect(actions).toContain(OrchestrationActionType.MARK_COMPLETED);
  });

  it('should return empty array for terminal phases', () => {
    expect(getExpectedNextActions(OrchestrationPhase.COMPLETED)).toEqual([]);
    expect(getExpectedNextActions(OrchestrationPhase.FAILED)).toEqual([]);
  });
});

describe('getPrimaryActionForPhase', () => {
  it('should return recommended action for ISSUE_ASSIGNED', () => {
    const state = createEmptyOrchestrationState('study-1', 'org/repo');

    const action = getPrimaryActionForPhase(state);

    expect(action).not.toBeNull();
    expect(action?.type).toBe(OrchestrationActionType.PROVISION_AGENT);
    expect(action?.metadata?.description).toContain('Recommended');
  });

  it('should return recommended action for IMPLEMENTATION', () => {
    const state = createEmptyOrchestrationState('study-1', 'org/repo');
    state.currentPhase = OrchestrationPhase.IMPLEMENTATION;
    state.workItem.issueNumber = 42;

    const action = getPrimaryActionForPhase(state);

    expect(action).not.toBeNull();
    expect(action?.type).toBe(OrchestrationActionType.CREATE_PR);
    expect(action?.params.title).toContain('#42');
  });

  it('should return null for terminal phases', () => {
    const state = createEmptyOrchestrationState('study-1', 'org/repo');
    state.currentPhase = OrchestrationPhase.COMPLETED;

    const action = getPrimaryActionForPhase(state);

    expect(action).toBeNull();
  });
});
