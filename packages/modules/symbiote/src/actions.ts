/**
 * Available Actions Logic
 *
 * Determines which actions are valid based on the current orchestration phase.
 * This implements the state machine for the SDLC workflow.
 */

import { PluginAction } from '@ariadne/plugins';
import {
  OrchestrationState,
  OrchestrationPhase,
  OrchestrationActionType,
} from './types';

/**
 * Action definition with metadata
 */
interface ActionDefinition {
  type: OrchestrationActionType;
  description: string;
  requiredParams?: string[];
}

/**
 * Map of phases to available actions
 */
const PHASE_ACTIONS: Record<OrchestrationPhase, ActionDefinition[]> = {
  [OrchestrationPhase.ISSUE_ASSIGNED]: [
    {
      type: OrchestrationActionType.CLAIM_ISSUE,
      description: 'Claim the assigned issue',
      requiredParams: ['issueNumber'],
    },
    {
      type: OrchestrationActionType.ANALYZE_ISSUE,
      description: 'Analyze issue requirements',
    },
    {
      type: OrchestrationActionType.PROVISION_AGENT,
      description: 'Provision agent environment',
      requiredParams: ['worktreePath'],
    },
  ],

  [OrchestrationPhase.AGENT_PROVISIONED]: [
    {
      type: OrchestrationActionType.START_IMPLEMENTATION,
      description: 'Start implementing the solution',
    },
    {
      type: OrchestrationActionType.MARK_FAILED,
      description: 'Mark orchestration as failed',
      requiredParams: ['reason'],
    },
  ],

  [OrchestrationPhase.IMPLEMENTATION]: [
    {
      type: OrchestrationActionType.CREATE_PR,
      description: 'Create a pull request',
    },
    {
      type: OrchestrationActionType.MARK_FAILED,
      description: 'Mark orchestration as failed',
      requiredParams: ['reason'],
    },
  ],

  [OrchestrationPhase.PR_CREATED]: [
    {
      type: OrchestrationActionType.UPDATE_PR,
      description: 'Update the pull request',
    },
    {
      type: OrchestrationActionType.WAIT_FOR_CI,
      description: 'Wait for CI checks to complete',
    },
    {
      type: OrchestrationActionType.REQUEST_REVIEW,
      description: 'Request code review',
    },
  ],

  [OrchestrationPhase.CI_RUNNING]: [
    {
      type: OrchestrationActionType.WAIT_FOR_CI,
      description: 'Continue waiting for CI',
    },
  ],

  [OrchestrationPhase.CI_FAILED]: [
    {
      type: OrchestrationActionType.FIX_CI,
      description: 'Attempt to fix CI failures',
    },
    {
      type: OrchestrationActionType.RETRY_CI,
      description: 'Retry CI checks',
    },
    {
      type: OrchestrationActionType.MARK_FAILED,
      description: 'Mark orchestration as failed',
      requiredParams: ['reason'],
    },
  ],

  [OrchestrationPhase.REVIEW_PENDING]: [
    {
      type: OrchestrationActionType.RESPOND_TO_REVIEW,
      description: 'Respond to review comments',
    },
  ],

  [OrchestrationPhase.REVIEW_CHANGES_REQUESTED]: [
    {
      type: OrchestrationActionType.ADDRESS_FEEDBACK,
      description: 'Address reviewer feedback',
    },
    {
      type: OrchestrationActionType.UPDATE_PR,
      description: 'Update PR with changes',
    },
    {
      type: OrchestrationActionType.MARK_FAILED,
      description: 'Mark orchestration as failed',
      requiredParams: ['reason'],
    },
  ],

  [OrchestrationPhase.APPROVED]: [
    {
      type: OrchestrationActionType.MERGE_PR,
      description: 'Merge the pull request',
    },
    {
      type: OrchestrationActionType.REBASE_PR,
      description: 'Rebase before merging',
    },
  ],

  [OrchestrationPhase.MERGING]: [
    {
      type: OrchestrationActionType.MERGE_PR,
      description: 'Complete the merge',
    },
  ],

  [OrchestrationPhase.MERGED]: [
    {
      type: OrchestrationActionType.CLEANUP_WORKTREE,
      description: 'Clean up agent worktree',
    },
    {
      type: OrchestrationActionType.DELETE_BRANCH,
      description: 'Delete feature branch',
    },
  ],

  [OrchestrationPhase.CLEANUP]: [
    {
      type: OrchestrationActionType.CLEANUP_WORKTREE,
      description: 'Clean up agent worktree',
    },
    {
      type: OrchestrationActionType.DELETE_BRANCH,
      description: 'Delete feature branch',
    },
    {
      type: OrchestrationActionType.MARK_COMPLETED,
      description: 'Mark orchestration as completed',
    },
  ],

  [OrchestrationPhase.COMPLETED]: [],
  [OrchestrationPhase.FAILED]: [],
};

/**
 * Get available actions for the current orchestration state
 */
export function getAvailableActionsForPhase(state: OrchestrationState): PluginAction[] {
  const actions = PHASE_ACTIONS[state.currentPhase] || [];

  return actions.map((action) => ({
    type: action.type,
    params: buildDefaultParams(action, state),
    metadata: {
      description: action.description,
    },
  }));
}

/**
 * Build default parameters based on current state
 */
function buildDefaultParams(
  action: ActionDefinition,
  state: OrchestrationState
): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  switch (action.type) {
    case OrchestrationActionType.CLAIM_ISSUE:
      params.issueNumber = state.workItem.issueNumber;
      break;

    case OrchestrationActionType.PROVISION_AGENT:
      params.worktreePath = state.config.worktreePath ||
        `/tmp/worktrees/issue-${state.workItem.issueNumber}`;
      break;

    case OrchestrationActionType.START_IMPLEMENTATION:
      params.branch = `issue-${state.workItem.issueNumber}`;
      break;

    case OrchestrationActionType.CREATE_PR:
      params.title = `Fix #${state.workItem.issueNumber}`;
      params.branch = state.workItem.branch;
      break;

    case OrchestrationActionType.MERGE_PR:
      params.mergeMethod = state.config.mergeMethod || 'squash';
      break;
  }

  return params;
}

/**
 * Check if an action is valid for the current phase
 */
export function isActionValidForPhase(
  actionType: OrchestrationActionType,
  phase: OrchestrationPhase
): boolean {
  const availableActions = PHASE_ACTIONS[phase] || [];
  return availableActions.some((action) => action.type === actionType);
}

/**
 * Get the expected next actions for a given phase (for planning)
 */
export function getExpectedNextActions(phase: OrchestrationPhase): OrchestrationActionType[] {
  // Map showing the "happy path" action for each phase
  const happyPath: Partial<Record<OrchestrationPhase, OrchestrationActionType>> = {
    [OrchestrationPhase.ISSUE_ASSIGNED]: OrchestrationActionType.PROVISION_AGENT,
    [OrchestrationPhase.AGENT_PROVISIONED]: OrchestrationActionType.START_IMPLEMENTATION,
    [OrchestrationPhase.IMPLEMENTATION]: OrchestrationActionType.CREATE_PR,
    [OrchestrationPhase.PR_CREATED]: OrchestrationActionType.WAIT_FOR_CI,
    [OrchestrationPhase.CI_RUNNING]: OrchestrationActionType.WAIT_FOR_CI,
    [OrchestrationPhase.CI_FAILED]: OrchestrationActionType.FIX_CI,
    [OrchestrationPhase.REVIEW_PENDING]: OrchestrationActionType.RESPOND_TO_REVIEW,
    [OrchestrationPhase.REVIEW_CHANGES_REQUESTED]: OrchestrationActionType.ADDRESS_FEEDBACK,
    [OrchestrationPhase.APPROVED]: OrchestrationActionType.MERGE_PR,
    [OrchestrationPhase.MERGING]: OrchestrationActionType.MERGE_PR,
    [OrchestrationPhase.MERGED]: OrchestrationActionType.CLEANUP_WORKTREE,
    [OrchestrationPhase.CLEANUP]: OrchestrationActionType.MARK_COMPLETED,
  };

  const nextAction = happyPath[phase];
  return nextAction ? [nextAction] : [];
}

/**
 * Determine the primary action recommendation for a phase
 */
export function getPrimaryActionForPhase(
  state: OrchestrationState
): PluginAction | null {
  const expectedActions = getExpectedNextActions(state.currentPhase);

  if (expectedActions.length === 0) {
    return null;
  }

  const actionType = expectedActions[0];
  const actionDef = PHASE_ACTIONS[state.currentPhase]?.find(
    (a) => a.type === actionType
  );

  if (!actionDef) {
    return null;
  }

  return {
    type: actionType,
    params: buildDefaultParams(actionDef, state),
    metadata: {
      description: `${actionDef.description} (Recommended)`,
    },
  };
}
