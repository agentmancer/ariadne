/**
 * Symbiote Orchestration Types
 *
 * Type definitions for software development orchestration experiments.
 * These types track the state of Symbiote agent lifecycle from issue
 * assignment through PR merge and cleanup.
 */

// ============================================
// ORCHESTRATION PHASES
// ============================================

/**
 * Phases in the software development lifecycle orchestration
 */
export enum OrchestrationPhase {
  /** Issue has been assigned to the agent */
  ISSUE_ASSIGNED = 'issue_assigned',
  /** Agent worktree/environment has been provisioned */
  AGENT_PROVISIONED = 'agent_provisioned',
  /** Agent is implementing the solution */
  IMPLEMENTATION = 'implementation',
  /** Pull request has been created */
  PR_CREATED = 'pr_created',
  /** CI pipeline is running */
  CI_RUNNING = 'ci_running',
  /** CI pipeline has failed */
  CI_FAILED = 'ci_failed',
  /** Waiting for code review */
  REVIEW_PENDING = 'review_pending',
  /** Reviewer has requested changes */
  REVIEW_CHANGES_REQUESTED = 'review_changes_requested',
  /** PR has been approved */
  APPROVED = 'approved',
  /** PR is being merged */
  MERGING = 'merging',
  /** PR has been merged */
  MERGED = 'merged',
  /** Cleaning up resources (worktree, branch, etc.) */
  CLEANUP = 'cleanup',
  /** Orchestration completed successfully */
  COMPLETED = 'completed',
  /** Orchestration failed */
  FAILED = 'failed',
}

// ============================================
// ORCHESTRATION ACTIONS
// ============================================

/**
 * Action types that can be performed during orchestration
 */
export enum OrchestrationActionType {
  // Issue actions
  CLAIM_ISSUE = 'claim_issue',
  ANALYZE_ISSUE = 'analyze_issue',

  // Agent lifecycle
  PROVISION_AGENT = 'provision_agent',
  START_IMPLEMENTATION = 'start_implementation',

  // PR actions
  CREATE_PR = 'create_pr',
  UPDATE_PR = 'update_pr',
  REQUEST_REVIEW = 'request_review',

  // CI actions
  WAIT_FOR_CI = 'wait_for_ci',
  FIX_CI = 'fix_ci',
  RETRY_CI = 'retry_ci',

  // Review actions
  RESPOND_TO_REVIEW = 'respond_to_review',
  ADDRESS_FEEDBACK = 'address_feedback',

  // Merge actions
  MERGE_PR = 'merge_pr',
  REBASE_PR = 'rebase_pr',

  // Cleanup actions
  CLEANUP_WORKTREE = 'cleanup_worktree',
  DELETE_BRANCH = 'delete_branch',

  // Terminal actions
  MARK_COMPLETED = 'mark_completed',
  MARK_FAILED = 'mark_failed',
}

/**
 * Result of an orchestration action
 */
export type OrchestrationActionResult = 'success' | 'failure' | 'pending';

/**
 * A recorded action in the orchestration history
 */
export interface OrchestrationAction {
  /** When the action occurred */
  timestamp: Date;
  /** Phase when action was taken */
  phase: OrchestrationPhase;
  /** Action type */
  action: OrchestrationActionType | string;
  /** Result of the action */
  result: OrchestrationActionResult;
  /** Duration of the action in milliseconds */
  duration?: number;
  /** Additional metadata about the action */
  metadata?: Record<string, unknown>;
}

// ============================================
// WORK ITEM
// ============================================

/**
 * The GitHub issue or PR being worked on
 */
export interface WorkItem {
  /** GitHub repository (owner/repo format) */
  repository: string;
  /** Issue number being worked on */
  issueNumber?: number;
  /** PR number (once created) */
  prNumber?: number;
  /** Branch name for the work */
  branch?: string;
  /** Issue/PR title */
  title?: string;
  /** Issue/PR URL */
  url?: string;
}

// ============================================
// AGENT INFO
// ============================================

/**
 * Agent execution environment status
 */
export type AgentStatus = 'provisioning' | 'active' | 'completed' | 'failed';

/**
 * Information about the agent execution environment
 */
export interface AgentInfo {
  /** Agent instance ID */
  id: string;
  /** Git worktree path */
  worktree?: string;
  /** Tmux pane identifier */
  tmuxPane?: string;
  /** Current agent status */
  status: AgentStatus;
  /** Claude session ID (if applicable) */
  claudeSessionId?: string;
}

// ============================================
// ORCHESTRATION METRICS
// ============================================

/**
 * Metrics collected during orchestration
 */
export interface OrchestrationMetrics {
  /** Time from issue assignment to first PR creation (ms) */
  timeToFirstPR?: number;
  /** Number of CI runs */
  ciAttempts: number;
  /** Number of CI failures */
  ciFailures: number;
  /** Number of review rounds */
  reviewIterations: number;
  /** Time from issue assignment to merge (ms) */
  timeToMerge?: number;
  /** Whether cleanup succeeded */
  cleanupSuccess?: boolean;
  /** Time spent in implementation phase (ms) */
  implementationTime?: number;
  /** Time spent waiting for CI (ms) */
  ciWaitTime?: number;
  /** Time spent waiting for review (ms) */
  reviewWaitTime?: number;
  /** Error messages encountered */
  errors: string[];
}

// ============================================
// ORCHESTRATION STATE
// ============================================

/**
 * Complete state of an orchestration experiment session
 *
 * This replaces StoryState for software orchestration experiments.
 * It tracks the full lifecycle of a Symbiote agent working on an issue.
 */
export interface OrchestrationState {
  /** Plugin type identifier */
  pluginType: 'symbiote-orchestrator';
  /** State schema version */
  version: number;

  /** Experiment metadata */
  metadata: {
    /** Ariadne study ID */
    studyId: string;
    /** Trial ID (for parameter sweep experiments) */
    trialId?: string;
    /** Session ID */
    sessionId?: string;
    /** When orchestration started */
    startedAt: Date;
    /** When orchestration completed */
    completedAt?: Date;
    /** When current phase was entered (for timing metrics) */
    phaseEnteredAt?: Date;
  };

  /** Current phase in the SDLC loop */
  currentPhase: OrchestrationPhase;

  /** Issue/PR being worked on */
  workItem: WorkItem;

  /** Agent execution environment */
  agent: AgentInfo;

  /** Action history */
  history: OrchestrationAction[];

  /** Collected metrics */
  metrics: OrchestrationMetrics;

  /** Configuration from trial parameters */
  config: Record<string, unknown>;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Create an empty orchestration state for a new session
 */
export function createEmptyOrchestrationState(
  studyId: string,
  repository: string,
  config: Record<string, unknown> = {}
): OrchestrationState {
  const now = new Date();
  return {
    pluginType: 'symbiote-orchestrator',
    version: 1,
    metadata: {
      studyId,
      startedAt: now,
      phaseEnteredAt: now,
    },
    currentPhase: OrchestrationPhase.ISSUE_ASSIGNED,
    workItem: {
      repository,
    },
    agent: {
      id: '',
      status: 'provisioning',
    },
    history: [],
    metrics: {
      ciAttempts: 0,
      ciFailures: 0,
      reviewIterations: 0,
      errors: [],
    },
    config,
  };
}

/**
 * Check if a phase is terminal (completed or failed)
 */
export function isTerminalPhase(phase: OrchestrationPhase): boolean {
  return phase === OrchestrationPhase.COMPLETED || phase === OrchestrationPhase.FAILED;
}

/**
 * Get the next logical phase after a successful action
 */
export function getNextPhase(
  currentPhase: OrchestrationPhase,
  action: OrchestrationActionType
): OrchestrationPhase {
  const transitions: Partial<Record<OrchestrationActionType, OrchestrationPhase>> = {
    [OrchestrationActionType.PROVISION_AGENT]: OrchestrationPhase.AGENT_PROVISIONED,
    [OrchestrationActionType.START_IMPLEMENTATION]: OrchestrationPhase.IMPLEMENTATION,
    [OrchestrationActionType.CREATE_PR]: OrchestrationPhase.PR_CREATED,
    [OrchestrationActionType.WAIT_FOR_CI]: OrchestrationPhase.CI_RUNNING,
    [OrchestrationActionType.REQUEST_REVIEW]: OrchestrationPhase.REVIEW_PENDING,
    [OrchestrationActionType.MERGE_PR]: OrchestrationPhase.MERGING,
    [OrchestrationActionType.CLEANUP_WORKTREE]: OrchestrationPhase.CLEANUP,
    [OrchestrationActionType.MARK_COMPLETED]: OrchestrationPhase.COMPLETED,
    [OrchestrationActionType.MARK_FAILED]: OrchestrationPhase.FAILED,
  };

  return transitions[action] ?? currentPhase;
}

/**
 * Record an action in the orchestration history
 */
export function recordAction(
  state: OrchestrationState,
  action: OrchestrationActionType | string,
  result: OrchestrationActionResult,
  duration?: number,
  metadata?: Record<string, unknown>
): OrchestrationAction {
  const entry: OrchestrationAction = {
    timestamp: new Date(),
    phase: state.currentPhase,
    action,
    result,
    duration,
    metadata,
  };

  state.history.push(entry);
  return entry;
}
