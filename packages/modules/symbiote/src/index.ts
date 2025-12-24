/**
 * @ariadne/module-symbiote
 *
 * Symbiote orchestration module for software development agent experiments.
 * Enables systematic experimentation with Symbiote agent configurations
 * through the Ariadne research platform.
 *
 * @example
 * ```typescript
 * import {
 *   SymbiotePlugin,
 *   OrchestrationState,
 *   OrchestrationPhase,
 *   createEmptyOrchestrationState,
 * } from '@ariadne/module-symbiote';
 *
 * // Register the plugin
 * pluginRegistry.register(SymbiotePlugin);
 *
 * // Or create initial state directly
 * const state = createEmptyOrchestrationState(
 *   'study-123',
 *   'my-org/my-repo',
 *   { timeout: 300000, maxRetries: 3 }
 * );
 *
 * console.log(state.currentPhase); // 'issue_assigned'
 * ```
 */

// Plugin implementation
export { SymbiotePlugin } from './plugin';

// MCP Adapter
export {
  SymbioteMcpAdapter,
  type SymbioteMcpConfig,
  type McpActionResult,
} from './mcp-adapter';

// Actions logic
export {
  getAvailableActionsForPhase,
  isActionValidForPhase,
  getExpectedNextActions,
  getPrimaryActionForPhase,
} from './actions';

// All types and enums
export {
  // Phases
  OrchestrationPhase,

  // Action types
  OrchestrationActionType,
  type OrchestrationActionResult,
  type OrchestrationAction,

  // Work item
  type WorkItem,

  // Agent info
  type AgentStatus,
  type AgentInfo,

  // Metrics
  type OrchestrationMetrics,

  // Main state interface
  type OrchestrationState,

  // Helper functions
  createEmptyOrchestrationState,
  isTerminalPhase,
  getNextPhase,
  recordAction,
} from './types';
