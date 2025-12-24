/**
 * Symbiote Orchestration Plugin
 *
 * Plugin for software development orchestration experiments.
 * Tracks the full lifecycle of a Symbiote agent working on GitHub issues.
 */

import { BaseStoryPlugin } from '@ariadne/plugins';
import {
  PluginMetadata,
  PluginCapability,
  PluginContext,
  PluginAction,
  PluginActionResult,
  PluginEvent,
  StoryState,
} from '@ariadne/plugins';
import {
  OrchestrationState,
  OrchestrationPhase,
  OrchestrationActionType,
  createEmptyOrchestrationState,
  isTerminalPhase,
  getNextPhase,
  recordAction,
} from './types';
import { SymbioteMcpAdapter, SymbioteMcpConfig } from './mcp-adapter';
import { getAvailableActionsForPhase } from './actions';

/**
 * Symbiote Orchestration Plugin
 *
 * Enables systematic experimentation with Symbiote agent configurations
 * through the Ariadne research platform.
 */
export class SymbiotePlugin extends BaseStoryPlugin {
  readonly metadata: PluginMetadata = {
    id: 'symbiote-orchestrator',
    name: 'Symbiote Orchestrator',
    version: '1.0.0',
    description: 'Software orchestration experiments for Symbiote agent lifecycle',
    author: 'Symbiotic AI',
    capabilities: [
      PluginCapability.ORCHESTRATION,
      PluginCapability.CI_INTEGRATION,
      PluginCapability.CODE_REVIEW,
      PluginCapability.AGENT_LIFECYCLE,
      PluginCapability.METRICS_COLLECTION,
    ],
  };

  private orchestrationState: OrchestrationState | null = null;
  private mcpAdapter: SymbioteMcpAdapter | null = null;
  private isHeadless = false;
  private startTime: number = 0;

  // ============================================
  // LIFECYCLE METHODS
  // ============================================

  protected async onInit(): Promise<void> {
    this.isHeadless = false;
    this.resetState();
  }

  /**
   * Initialize in headless mode for automated experiments
   */
  async initHeadless(context: PluginContext): Promise<void> {
    this.context = context;
    this.isHeadless = true;
    this.startTime = Date.now();

    // Get configuration from trial parameters or condition config
    const config = context.trial?.parameters ?? context.condition?.config ?? {};

    // Extract repository from config (required)
    const repository = (config.repository as string) || 'unknown/repo';

    // Create initial orchestration state
    this.orchestrationState = createEmptyOrchestrationState(
      context.study.id,
      repository,
      config
    );

    // Set trial and session IDs if available
    if (context.trial?.id) {
      this.orchestrationState.metadata.trialId = context.trial.id;
    }
    if (context.session?.id) {
      this.orchestrationState.metadata.sessionId = context.session.id;
    }

    // Initialize MCP adapter with config
    const mcpConfig: SymbioteMcpConfig = {
      apiBaseUrl: (config.apiBaseUrl as string) || process.env.SYMBIOTE_API_URL,
      authToken: (config.authToken as string) || process.env.SYMBIOTE_AUTH_TOKEN,
      timeout: (config.timeout as number) || 300000, // 5 minute default
    };
    this.mcpAdapter = new SymbioteMcpAdapter(mcpConfig);

    // Log session start
    await this.logOrchestrationEvent('session_start', {
      repository,
      config,
      trialId: context.trial?.id,
    });

    this.emit(PluginEvent.INITIALIZED, { headless: true, context });
  }

  private resetState(): void {
    this.orchestrationState = null;
    this.mcpAdapter = null;
    this.startTime = 0;
  }

  protected async onRender(container: HTMLElement): Promise<void> {
    if (this.isHeadless) {
      throw new Error('Cannot render in headless mode');
    }
    // UI rendering for monitoring/visualization
    container.innerHTML = `
      <div class="symbiote-plugin">
        <div class="symbiote-dashboard">
          <p>Symbiote Orchestration Dashboard (UI implementation pending)</p>
        </div>
      </div>
    `;
  }

  protected async onDestroy(): Promise<void> {
    if (this.orchestrationState) {
      const duration = Date.now() - this.startTime;

      await this.logOrchestrationEvent('session_end', {
        phase: this.orchestrationState.currentPhase,
        duration,
        metrics: this.orchestrationState.metrics,
        actionsCount: this.orchestrationState.history.length,
      });
    }

    this.resetState();
  }

  // ============================================
  // STATE MANAGEMENT
  // ============================================

  async getState(): Promise<StoryState> {
    if (!this.orchestrationState) {
      return this.createEmptyState();
    }

    // Return orchestration state as StoryState (compatible interface)
    return this.orchestrationState as unknown as StoryState;
  }

  protected async onStateChanged(state: StoryState): Promise<void> {
    // Restore orchestration state from StoryState
    this.orchestrationState = state as unknown as OrchestrationState;
  }

  /**
   * Get the current orchestration state (typed accessor)
   */
  getOrchestrationState(): OrchestrationState | null {
    return this.orchestrationState;
  }

  // ============================================
  // HEADLESS EXECUTION
  // ============================================

  /**
   * Execute an action in headless mode
   */
  async executeHeadless(action: PluginAction): Promise<PluginActionResult> {
    if (!this.orchestrationState) {
      return {
        success: false,
        newState: await this.getState(),
        error: 'Plugin not initialized',
      };
    }

    const actionType = action.type as OrchestrationActionType;
    const startTime = Date.now();

    try {
      // Execute action via MCP adapter
      const result = await this.executeAction(actionType, action.params);

      // Record action in history
      recordAction(
        this.orchestrationState,
        actionType,
        result.success ? 'success' : 'failure',
        Date.now() - startTime,
        result.metadata
      );

      // Update phase if action succeeded
      if (result.success) {
        const previousPhase = this.orchestrationState.currentPhase;
        const nextPhase = getNextPhase(previousPhase, actionType);
        if (nextPhase !== previousPhase) {
          // Calculate time spent in previous phase for metrics
          this.updatePhaseTimeMetrics(previousPhase);

          // Update phase and timestamp
          this.orchestrationState.currentPhase = nextPhase;
          this.orchestrationState.metadata.phaseEnteredAt = new Date();

          await this.logOrchestrationEvent('phase_transition', {
            fromPhase: previousPhase,
            toPhase: nextPhase,
            action: actionType,
          });
        }
      }

      // Update metrics based on action
      this.updateMetrics(actionType, result.success);

      // Log the action
      await this.logOrchestrationEvent('action_executed', {
        action: actionType,
        success: result.success,
        duration: Date.now() - startTime,
        phase: this.orchestrationState.currentPhase,
      });

      return {
        success: result.success,
        newState: await this.getState(),
        error: result.error,
        metadata: result.metadata,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Record failed action
      recordAction(
        this.orchestrationState,
        actionType,
        'failure',
        Date.now() - startTime,
        { error: errorMessage }
      );

      // Track error in metrics
      this.orchestrationState.metrics.errors.push(errorMessage);

      return {
        success: false,
        newState: await this.getState(),
        error: errorMessage,
      };
    }
  }

  /**
   * Execute a specific action type
   */
  private async executeAction(
    actionType: OrchestrationActionType,
    params: Record<string, unknown>
  ): Promise<{ success: boolean; error?: string; metadata?: Record<string, unknown> }> {
    if (!this.mcpAdapter) {
      return { success: false, error: 'MCP adapter not initialized' };
    }

    // Delegate to MCP adapter for actual execution
    return this.mcpAdapter.executeAction(actionType, params, this.orchestrationState!);
  }

  /**
   * Update metrics based on action type
   */
  private updateMetrics(actionType: OrchestrationActionType, success: boolean): void {
    if (!this.orchestrationState) return;

    const metrics = this.orchestrationState.metrics;
    const now = Date.now();

    switch (actionType) {
      case OrchestrationActionType.CREATE_PR:
        if (success && !metrics.timeToFirstPR) {
          metrics.timeToFirstPR = now - this.startTime;
        }
        break;

      case OrchestrationActionType.WAIT_FOR_CI:
      case OrchestrationActionType.RETRY_CI:
        metrics.ciAttempts++;
        if (!success) {
          metrics.ciFailures++;
        }
        break;

      case OrchestrationActionType.RESPOND_TO_REVIEW:
      case OrchestrationActionType.ADDRESS_FEEDBACK:
        metrics.reviewIterations++;
        break;

      case OrchestrationActionType.MERGE_PR:
        if (success) {
          metrics.timeToMerge = now - this.startTime;
        }
        break;

      case OrchestrationActionType.CLEANUP_WORKTREE:
      case OrchestrationActionType.DELETE_BRANCH:
        metrics.cleanupSuccess = success;
        break;
    }
  }

  /**
   * Update phase-based timing metrics when leaving a phase
   */
  private updatePhaseTimeMetrics(leavingPhase: OrchestrationPhase): void {
    if (!this.orchestrationState) return;

    const metrics = this.orchestrationState.metrics;
    const phaseEnteredAt = this.orchestrationState.metadata.phaseEnteredAt;

    if (!phaseEnteredAt) return;

    const timeInPhase = Date.now() - new Date(phaseEnteredAt).getTime();

    switch (leavingPhase) {
      case OrchestrationPhase.IMPLEMENTATION:
        // Track implementation time (time spent coding)
        metrics.implementationTime = (metrics.implementationTime || 0) + timeInPhase;
        break;

      case OrchestrationPhase.CI_RUNNING:
        // Track CI wait time
        metrics.ciWaitTime = (metrics.ciWaitTime || 0) + timeInPhase;
        break;

      case OrchestrationPhase.REVIEW_PENDING:
      case OrchestrationPhase.REVIEW_CHANGES_REQUESTED:
        // Track review wait time (both waiting and addressing)
        metrics.reviewWaitTime = (metrics.reviewWaitTime || 0) + timeInPhase;
        break;
    }
  }

  /**
   * Check if orchestration is complete
   */
  isComplete(): boolean {
    if (!this.orchestrationState) {
      return false;
    }
    return isTerminalPhase(this.orchestrationState.currentPhase);
  }

  /**
   * Get available actions at current state
   */
  async getAvailableActions(): Promise<PluginAction[]> {
    if (!this.orchestrationState) {
      return [];
    }
    return getAvailableActionsForPhase(this.orchestrationState);
  }

  // ============================================
  // COMMAND EXECUTION
  // ============================================

  async execute(command: string, args?: unknown): Promise<unknown> {
    switch (command) {
      case 'getPhase':
        return this.orchestrationState?.currentPhase;

      case 'getMetrics':
        return this.orchestrationState?.metrics;

      case 'getHistory':
        return this.orchestrationState?.history;

      case 'getWorkItem':
        return this.orchestrationState?.workItem;

      case 'getAgentInfo':
        return this.orchestrationState?.agent;

      case 'setIssue':
        if (this.orchestrationState && typeof args === 'object' && args !== null) {
          const issueArgs = args as { issueNumber: number; title?: string; url?: string };
          this.orchestrationState.workItem.issueNumber = issueArgs.issueNumber;
          if (issueArgs.title) this.orchestrationState.workItem.title = issueArgs.title;
          if (issueArgs.url) this.orchestrationState.workItem.url = issueArgs.url;
          return true;
        }
        return false;

      case 'setPR':
        if (this.orchestrationState && typeof args === 'object' && args !== null) {
          const prArgs = args as { prNumber: number; branch?: string; url?: string };
          this.orchestrationState.workItem.prNumber = prArgs.prNumber;
          if (prArgs.branch) this.orchestrationState.workItem.branch = prArgs.branch;
          if (prArgs.url) this.orchestrationState.workItem.url = prArgs.url;
          return true;
        }
        return false;

      case 'setAgentStatus':
        if (this.orchestrationState && typeof args === 'string') {
          this.orchestrationState.agent.status = args as 'provisioning' | 'active' | 'completed' | 'failed';
          return true;
        }
        return false;

      default:
        return super.execute(command, args);
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Log an orchestration event
   */
  private async logOrchestrationEvent(
    type: string,
    data: Record<string, unknown>
  ): Promise<void> {
    if (!this.context?.api) return;

    try {
      await this.context.api.logEvent({
        type: `orchestration.${type}`,
        timestamp: new Date(),
        data: {
          ...data,
          pluginType: 'symbiote-orchestrator',
          studyId: this.orchestrationState?.metadata.studyId,
          trialId: this.orchestrationState?.metadata.trialId,
          sessionId: this.orchestrationState?.metadata.sessionId,
        },
      });
    } catch (error) {
      console.error(`[SymbiotePlugin] Failed to log event ${type}:`, error);
    }
  }
}
