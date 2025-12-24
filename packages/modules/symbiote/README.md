# @ariadne/module-symbiote

Symbiote orchestration module for software development agent experiments on the Ariadne research platform.

## Overview

This module enables systematic experimentation with Symbiote agents working on GitHub issues. It tracks the full lifecycle of an agent from issue assignment through code implementation, CI/CD, code review, and merge.

## Installation

```bash
pnpm install
```

## Features

- **Orchestration State Machine**: Tracks agent progress through defined phases
- **Phase Transitions**: Issue assignment → Implementation → PR Creation → CI → Review → Merge
- **Metrics Collection**: Time tracking, CI attempts, review iterations
- **MCP Adapter**: Execute orchestration actions via external systems
- **Headless Mode**: Automated execution without UI

## Usage

### Plugin Registration

```typescript
import { pluginRegistry } from '@ariadne/plugins';
import { SymbiotePlugin } from '@ariadne/module-symbiote';

// Register the plugin
pluginRegistry.register(SymbiotePlugin);
```

### Headless Execution

```typescript
import { SymbiotePlugin, OrchestrationActionType } from '@ariadne/module-symbiote';

const plugin = new SymbiotePlugin();

// Initialize in headless mode with context
await plugin.initHeadless({
  study: { id: 'study-123' },
  trial: {
    id: 'trial-456',
    parameters: {
      temperature: 0.7,
      maxRetries: 3
    }
  },
  session: { id: 'session-789' },
  condition: {
    config: {
      repository: 'org/repo',
      apiBaseUrl: 'https://api.symbiote.dev'
    }
  },
  api: {
    logEvent: async (event) => console.log(event)
  }
});

// Execute orchestration actions
const claimResult = await plugin.executeHeadless({
  type: OrchestrationActionType.CLAIM_ISSUE,
  params: { issueNumber: 42 }
});

if (claimResult.success) {
  const provisionResult = await plugin.executeHeadless({
    type: OrchestrationActionType.PROVISION_AGENT,
    params: { worktreePath: '/tmp/worktrees/issue-42' }
  });
}

// Check orchestration state
const state = plugin.getOrchestrationState();
console.log('Current phase:', state.currentPhase);
console.log('Metrics:', state.metrics);

// Check if orchestration is complete
if (plugin.isComplete()) {
  console.log('Orchestration finished');
}
```

### Direct State Creation

```typescript
import { createEmptyOrchestrationState, OrchestrationPhase } from '@ariadne/module-symbiote';

// Create initial state
const state = createEmptyOrchestrationState(
  'study-123',
  'my-org/my-repo',
  { timeout: 300000, maxRetries: 3 }
);

console.log(state.currentPhase); // 'idle'
```

## Orchestration Phases

| Phase | Description |
|-------|-------------|
| `IDLE` | Initial state, waiting for issue assignment |
| `ISSUE_ASSIGNED` | Issue claimed, ready for agent provisioning |
| `AGENT_PROVISIONING` | Setting up worktree and agent environment |
| `IMPLEMENTATION` | Agent is implementing the solution |
| `PR_CREATED` | Pull request has been opened |
| `CI_RUNNING` | CI/CD pipeline is executing |
| `CI_FAILED` | CI failed, requires fixes |
| `REVIEW_PENDING` | Awaiting code review |
| `REVIEW_CHANGES_REQUESTED` | Changes requested by reviewer |
| `APPROVED` | PR approved, ready to merge |
| `MERGING` | Merge in progress |
| `COMPLETED` | Successfully merged (terminal) |
| `FAILED` | Orchestration failed (terminal) |
| `ABANDONED` | Issue/PR abandoned (terminal) |

## Action Types

### Issue Actions
- `CLAIM_ISSUE` - Assign issue to the agent
- `ANALYZE_ISSUE` - Parse and understand the issue

### Agent Lifecycle
- `PROVISION_AGENT` - Create worktree and initialize agent
- `START_IMPLEMENTATION` - Begin coding phase

### PR Actions
- `CREATE_PR` - Open pull request
- `UPDATE_PR` - Push new commits
- `REQUEST_REVIEW` - Request code review
- `REBASE_PR` - Rebase on target branch
- `MERGE_PR` - Merge pull request

### CI Actions
- `WAIT_FOR_CI` - Poll CI status
- `FIX_CI` - Address CI failures
- `RETRY_CI` - Retry failed CI run

### Review Actions
- `RESPOND_TO_REVIEW` - Reply to reviewer comments
- `ADDRESS_FEEDBACK` - Implement requested changes

### Cleanup
- `CLEANUP_WORKTREE` - Remove worktree
- `DELETE_BRANCH` - Delete feature branch

### Terminal Actions
- `MARK_COMPLETED` - Mark as successfully completed
- `MARK_FAILED` - Mark as failed with reason

## Metrics

The orchestration state tracks various metrics:

```typescript
interface OrchestrationMetrics {
  timeToFirstPR: number | null;      // Time from start to PR creation
  timeToMerge: number | null;        // Time from start to merge
  ciAttempts: number;                // Total CI runs
  ciFailures: number;                // Failed CI runs
  reviewIterations: number;          // Review round-trips
  implementationTime: number;        // Time in implementation phase
  ciWaitTime: number;                // Time waiting for CI
  reviewWaitTime: number;            // Time in review phases
  cleanupSuccess: boolean | null;    // Cleanup completed
  errors: string[];                  // Error messages
}
```

## Integration with Trials

The Symbiote plugin integrates with Ariadne's trials system for systematic experimentation:

```typescript
// Trial configuration
const trialParams = {
  // Agent configuration
  temperature: 0.7,
  maxTokens: 4000,

  // Orchestration settings
  maxCIRetries: 3,
  reviewTimeout: 3600000,

  // Repository
  repository: 'org/repo',
  targetBranch: 'main'
};

// Create trial with these parameters
const trial = await apiClient.createTrial({
  studyId: 'study-123',
  conditionId: 'condition-456',
  parameters: trialParams
});

// Run sessions for the trial
await apiClient.runTrialBatch({
  trialId: trial.id,
  sessionCount: 10
});

// Each session initializes a SymbiotePlugin in headless mode
// with the trial parameters
```

## MCP Adapter

The `SymbioteMcpAdapter` executes actions by interfacing with external systems:

```typescript
import { SymbioteMcpAdapter, SymbioteMcpConfig } from '@ariadne/module-symbiote';

const config: SymbioteMcpConfig = {
  apiBaseUrl: 'https://api.symbiote.dev',
  authToken: 'your-token',
  timeout: 300000  // 5 minutes
};

const adapter = new SymbioteMcpAdapter(config);

// Execute an action
const result = await adapter.executeAction(
  OrchestrationActionType.CREATE_PR,
  { title: 'Fix #42: Implement feature' },
  state
);

if (result.success) {
  console.log('PR created:', result.metadata.prNumber);
}
```

## API Reference

### SymbiotePlugin

#### Methods

| Method | Description |
|--------|-------------|
| `initHeadless(context)` | Initialize plugin for automated execution |
| `executeHeadless(action)` | Execute an orchestration action |
| `getOrchestrationState()` | Get current state |
| `getAvailableActions()` | Get valid actions for current phase |
| `isComplete()` | Check if in terminal phase |
| `execute(command, args)` | Execute plugin commands |

#### Plugin Commands

- `getPhase` - Get current phase
- `getMetrics` - Get metrics
- `getHistory` - Get action history
- `getWorkItem` - Get issue/PR info
- `getAgentInfo` - Get agent status
- `setIssue` - Set issue details
- `setPR` - Set PR details
- `setAgentStatus` - Update agent status

### Helper Functions

| Function | Description |
|----------|-------------|
| `createEmptyOrchestrationState(studyId, repo, config)` | Create initial state |
| `isTerminalPhase(phase)` | Check if phase is terminal |
| `getNextPhase(currentPhase, action)` | Get phase after action |
| `recordAction(state, action, result, duration, metadata)` | Record action in history |
| `getAvailableActionsForPhase(state)` | Get valid actions |
| `isActionValidForPhase(phase, action)` | Validate action |

## Testing

```bash
# Run unit tests
pnpm test

# Watch mode
pnpm test -- --watch

# Coverage
pnpm test -- --coverage
```

## Development

```bash
# Build
pnpm build

# Type check
pnpm type-check

# Development with watch
pnpm dev
```

## Related

- [RFC-002: Trials Feature and Orchestrator Module](../../docs/RFC-002.md)
- [@ariadne/plugins](../../packages/plugins/README.md)
- [@ariadne/mcp-server](../../packages/mcp-server/README.md)

## License

MIT
