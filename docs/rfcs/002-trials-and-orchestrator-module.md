# RFC-002: Trials Feature and Orchestrator Module

**Status:** Approved
**Implementation Status:** Phase 1 (Core Trials) - Complete
**Author:** u-claude (with John)
**Created:** 2025-12-13
**Updated:** 2025-12-23
**Related:** RFC-001 (Symbiote-Sherlock Integration Architecture)

## Executive Summary

This RFC proposes two additions to Sherlock:

1. **Trials** (Core Feature) - A new abstraction for parameter sweep experiments, sitting between Conditions and Sessions
2. **module-symbiote** (Plugin) - A domain-specific module for software orchestration experiments

These features enable systematic experimentation with software development agent configurations while maintaining Sherlock's generic research platform architecture.

## Motivation

### Current Limitations

Sherlock's current experiment model:

```
Study → Condition → Session
```

This works for A/B testing (Condition A vs B), but lacks support for:

1. **Parameter Sweeps** - Systematically varying parameters (e.g., timeout: 100ms, 200ms, 300ms)
2. **Progressive Trials** - Running experiments with incrementally changing configurations
3. **Statistical Replication** - Multiple runs per parameter configuration for significance

### Use Case: Symbiote Agent Optimization

When optimizing Symbiote's autonomous SDLC loop, we need to answer questions like:

- "What cleanup timeout maximizes success rate?"
- "Does database-based discovery outperform title-based discovery?"
- "How many CI retry attempts is optimal?"

These require controlled experiments with varying parameters - not just categorical A/B conditions.

## Proposed Design

### Part 1: Trials (Core Sherlock Feature)

#### New Data Model

```
Study (Experiment)
└── Condition (Categorical variant: A vs B)
    └── Trial (Parameter configuration)
        └── Session (Execution instance)
```

#### Schema Addition

```prisma
// Trial status enum for type safety
enum TrialStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
}

model Trial {
  id            String    @id @default(cuid())
  studyId       String
  study         Study     @relation(fields: [studyId], references: [id], onDelete: Cascade)
  // Optional: trials can belong to a condition or be study-wide parameter sweeps
  conditionId   String?
  condition     Condition? @relation(fields: [conditionId], references: [id])

  // Trial identification
  sequence      Int       // Trial number within condition (1, 2, 3...)
  name          String?   // Optional human-readable name

  // Parameter configuration
  parameters    Json      // The parameter set for this trial

  // Parameter sweep definition (optional)
  parameterKey  String?   // Which parameter is being varied
  parameterValue String?  // Value as string for indexing

  // Results aggregation
  sessionCount  Int       @default(0)
  successCount  Int       @default(0)
  failureCount  Int       @default(0)

  // Computed metrics (updated after sessions complete)
  metrics       Json?     // Aggregated metrics across sessions

  status        TrialStatus @default(PENDING)

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  completedAt   DateTime?

  sessions      Session[]

  @@unique([studyId, conditionId, sequence])
  @@index([studyId])
  @@index([conditionId])
  @@index([parameterKey, parameterValue])
  @@map("trials")
}
```

#### API Endpoints

```typescript
// Create a single trial
POST /api/studies/:studyId/trials
{
  conditionId?: string,
  parameters: Record<string, any>,
  name?: string
}

// Create parameter sweep (multiple trials)
POST /api/studies/:studyId/trials/sweep
{
  conditionId?: string,
  parameterKey: string,
  values: any[],              // e.g., [100, 200, 300, 400, 500]
  baseParameters?: Record<string, any>  // Other fixed params
}

// List trials with filtering
GET /api/studies/:studyId/trials?conditionId=X&status=COMPLETED

// Get trial with aggregated results
GET /api/trials/:trialId

// Run sessions for a trial
POST /api/trials/:trialId/run
{
  sessionCount: number,  // How many sessions to run
  agentDefinitionId?: string
}

// Get trial results with statistics
GET /api/trials/:trialId/results
```

#### MCP Tools

```typescript
// Create trial
{
  name: 'create_trial',
  description: 'Create a trial with specific parameter configuration',
  inputSchema: {
    properties: {
      study_id: { type: 'string' },
      condition_id: { type: 'string' },
      parameters: { type: 'object' },
      name: { type: 'string' }
    },
    required: ['study_id', 'parameters']
  }
}

// Create parameter sweep
{
  name: 'create_parameter_sweep',
  description: 'Create multiple trials varying a single parameter',
  inputSchema: {
    properties: {
      study_id: { type: 'string' },
      condition_id: { type: 'string' },
      parameter_key: { type: 'string' },
      values: { type: 'array' },
      base_parameters: { type: 'object' }
    },
    required: ['study_id', 'parameter_key', 'values']
  }
}

// Run trial batch
{
  name: 'run_trial_batch',
  description: 'Execute multiple sessions for a trial',
  inputSchema: {
    properties: {
      trial_id: { type: 'string' },
      session_count: { type: 'integer' },
      agent_definition_id: { type: 'string' }
    },
    required: ['trial_id', 'session_count']
  }
}

// Get trial results
{
  name: 'get_trial_results',
  description: 'Get aggregated results and statistics for a trial',
  inputSchema: {
    properties: {
      trial_id: { type: 'string' },
      include_sessions: { type: 'boolean' }
    },
    required: ['trial_id']
  }
}
```

### Part 2: module-symbiote (Orchestrator Plugin)

#### Package Structure

```
packages/
└── modules/
    └── symbiote/
        ├── package.json
        ├── tsconfig.json
        ├── src/
        │   ├── index.ts
        │   ├── symbiote-plugin.ts
        │   ├── types.ts
        │   ├── orchestration-state.ts
        │   └── adapters/
        │       └── mcp-adapter.ts
        └── tests/
            └── symbiote-plugin.test.ts
```

#### OrchestrationState (replaces StoryState)

```typescript
export interface OrchestrationState {
  pluginType: 'symbiote-orchestrator';
  version: number;

  metadata: {
    studyId: string;       // Consistent with Sherlock data model
    trialId?: string;
    sessionId?: string;
    startedAt: Date;
    completedAt?: Date;
  };

  // Current phase in the SDLC loop
  currentPhase: OrchestrationPhase;

  // Issue/PR being worked on
  workItem: {
    issueNumber?: number;
    prNumber?: number;
    branch?: string;
    repository: string;
  };

  // Agent information
  agent: {
    id: string;
    worktree?: string;
    tmuxPane?: string;
    status: 'provisioning' | 'active' | 'completed' | 'failed';
  };

  // Action history
  history: OrchestrationAction[];

  // Metrics collected
  metrics: {
    timeToFirstPR?: number;      // ms from issue assign to PR creation
    ciAttempts: number;          // Number of CI runs
    reviewIterations: number;    // Number of review rounds
    timeToMerge?: number;        // ms from issue assign to merge
    cleanupSuccess?: boolean;
    errors: string[];
  };

  // Configuration (from trial parameters)
  config: Record<string, unknown>;
}

export enum OrchestrationPhase {
  ISSUE_ASSIGNED = 'issue_assigned',
  AGENT_PROVISIONED = 'agent_provisioned',
  IMPLEMENTATION = 'implementation',
  PR_CREATED = 'pr_created',
  CI_RUNNING = 'ci_running',
  CI_FAILED = 'ci_failed',
  REVIEW_PENDING = 'review_pending',
  REVIEW_CHANGES_REQUESTED = 'review_changes_requested',
  APPROVED = 'approved',
  MERGING = 'merging',
  MERGED = 'merged',
  CLEANUP = 'cleanup',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export interface OrchestrationAction {
  timestamp: Date;
  phase: OrchestrationPhase;
  action: string;  // e.g., 'create_pr', 'fix_ci', 'respond_to_review'
  result: 'success' | 'failure';
  duration?: number;
  metadata?: Record<string, unknown>;
}
```

#### SymbiotePlugin Implementation

```typescript
import { BaseStoryPlugin, PluginCapability, PluginMetadata } from '@sherlock/plugins';
import { OrchestrationState, OrchestrationPhase, OrchestrationAction } from './types';
import { SymbioteMcpAdapter } from './adapters/mcp-adapter';

export class SymbiotePlugin extends BaseStoryPlugin {
  private mcpAdapter: SymbioteMcpAdapter;
  private orchestrationState: OrchestrationState;

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
      PluginCapability.METRICS_COLLECTION
    ]
  };

  // Headless mode for automated experiments
  // Note: PluginContext will be extended to include trial: { parameters: Record<string, unknown> }
  async initHeadless(context: PluginContext): Promise<void> {
    // Use trial parameters for experiment configuration (not condition config)
    this.mcpAdapter = new SymbioteMcpAdapter(context.trial?.parameters ?? {});
    this.orchestrationState = this.createEmptyOrchestrationState(context);
  }

  async executeHeadless(action: PluginAction): Promise<PluginActionResult> {
    const startTime = Date.now();

    try {
      const result = await this.mcpAdapter.executeAction(action);

      // Record action in history
      this.orchestrationState.history.push({
        timestamp: new Date(),
        phase: this.orchestrationState.currentPhase,
        action: action.type,
        result: result.success ? 'success' : 'failure',
        duration: Date.now() - startTime,
        metadata: result.metadata
      });

      // Update phase based on action result
      if (result.success) {
        this.advancePhase(action.type);
      }

      return {
        success: result.success,
        newState: this.orchestrationState as any,
        error: result.error,
        metadata: result.metadata
      };
    } catch (error) {
      // Track error in metrics for analysis
      this.orchestrationState.metrics.errors.push(error.message);

      return {
        success: false,
        newState: this.orchestrationState,
        error: error.message
      };
    }
  }

  async getAvailableActions(): Promise<PluginAction[]> {
    return this.mcpAdapter.getAvailableActions(this.orchestrationState);
  }

  isComplete(): boolean {
    return this.orchestrationState.currentPhase === OrchestrationPhase.COMPLETED ||
           this.orchestrationState.currentPhase === OrchestrationPhase.FAILED;
  }

  // ... render methods for UI visualization (optional)
}
```

#### New Plugin Capabilities

Add to `@sherlock/plugins` types:

```typescript
export enum PluginCapability {
  // ... existing capabilities ...

  // Orchestration capabilities (new)
  ORCHESTRATION = 'orchestration',
  CI_INTEGRATION = 'ci_integration',
  CODE_REVIEW = 'code_review',
  AGENT_LIFECYCLE = 'agent_lifecycle',
  METRICS_COLLECTION = 'metrics_collection'
}
```

## Implementation Status

### Phase 1: Core Trials - ✅ Complete (2025-12-23)

#### S-1: Trial Schema and Database Migration - ✅
- Added `TrialStatus` enum (`PENDING`, `RUNNING`, `COMPLETED`, `FAILED`)
- Added `Trial` model with all specified fields
- Added reverse relations to `Study`, `Condition`, and `Session` models
- Added `trialId` foreign key to `Session` model
- Database migration applied successfully

#### S-2: Trial CRUD API Endpoints - ✅
Implemented in `packages/api/src/routes/trials.ts`:
- `GET /api/v1/studies/:studyId/trials` - List trials with pagination and filtering
- `POST /api/v1/studies/:studyId/trials` - Create single trial
- `POST /api/v1/studies/:studyId/trials/sweep` - Create parameter sweep
- `GET /api/v1/trials/:id` - Get trial with details
- `PATCH /api/v1/trials/:id` - Update trial
- `DELETE /api/v1/trials/:id` - Delete trial
- `POST /api/v1/trials/:id/run` - Run sessions for trial
- `GET /api/v1/trials/:id/results` - Get trial results with statistics

All endpoints have comprehensive test coverage (46 tests).

#### S-3: Trial MCP Tools - Pending
Not yet implemented. Planned for next phase.

### Phase 2-4: Pending
See Implementation Order section for remaining work.

## Issue Breakdown

### Core Sherlock Issues

#### Issue S-1: Trial Schema and Database Migration (P0)
- Add Trial model to Prisma schema (with TrialStatus enum)
- Create migration
- Add indexes for efficient querying
- Update Session model to reference Trial

#### Issue S-2: Trial CRUD API Endpoints (P0)
- POST /api/studies/:studyId/trials (create single)
- POST /api/studies/:studyId/trials/sweep (create sweep)
- GET /api/studies/:studyId/trials (list)
- GET /api/trials/:trialId (get with results)
- PATCH /api/trials/:trialId (update status)
- DELETE /api/trials/:trialId

#### Issue S-3: Trial MCP Tools (P1)
- create_trial
- create_parameter_sweep
- run_trial_batch
- get_trial_results
- Update mcp-server.ts with new tools

#### Issue S-4: Trial Results Aggregation (P1)
- Compute success/failure rates per trial
- Calculate statistics across sessions
- Generate comparison metrics across trials
- Support export for analysis

#### Issue S-5: Update Batch Execution for Trials (P2)
- Modify BatchExecution to optionally run against trials
- Support running N sessions per trial automatically
- Progress tracking per trial

### Module-Symbiote Issues

#### Issue M-1: Create @sherlock/module-symbiote Package (P0)
- Package scaffolding
- TypeScript configuration
- Dependencies setup
- Export structure

#### Issue M-2: OrchestrationState Type Definitions (P0)
- OrchestrationState interface (with studyId, not experimentId)
- OrchestrationPhase enum
- OrchestrationAction interface
- Metrics types

#### Issue M-3: SymbiotePlugin Base Implementation (P1)
- Implement StoryPlugin interface
- Headless mode support (using trial.parameters)
- State management
- Event emission

#### Issue M-4: Symbiote MCP Adapter (P1)
- Connect to Symbiote MCP server
- Map plugin actions to MCP tool calls
- Handle responses and errors
- Manage authentication

#### Issue M-5: Available Actions Logic (P2)
- Determine valid actions based on current phase
- Support phase transitions
- Handle edge cases (failures, retries)

#### Issue M-6: Add Orchestration Capabilities to Core (P2)
- Add new PluginCapability enum values to @sherlock/plugins
- Update PluginContext to include trial field
- Update plugin validation
- Document capabilities

### Integration Issues

#### Issue I-1: End-to-End Integration Test (P1)
- Create test study with conditions and trials
- Run sessions through SymbiotePlugin
- Verify metrics collection
- Validate results aggregation

#### Issue I-2: Documentation (P2)
- Update MCP_SERVER.md with trial tools
- Add module-symbiote README
- Usage examples

## Implementation Order

```
Phase 1: Core Trials
├── S-1: Trial Schema
├── S-2: Trial API
└── S-3: Trial MCP Tools

Phase 2: Module Foundation
├── M-1: Package Setup
├── M-2: Type Definitions
└── M-6: Core Capabilities

Phase 3: Plugin Implementation
├── M-3: SymbiotePlugin
├── M-4: MCP Adapter
└── M-5: Actions Logic

Phase 4: Integration
├── S-4: Results Aggregation
├── S-5: Batch Execution Update
├── I-1: E2E Test
└── I-2: Documentation
```

**Dependencies:**
- Phase 2 depends on Phase 1 (trials must exist before module can use them)
- Phase 3 depends on Phase 2 (plugin needs type definitions)
- Phase 4 depends on Phases 1-3

## Success Metrics

1. **Trial Functionality**
   - Can create parameter sweeps with N values
   - Sessions correctly associated with trials
   - Results aggregated per trial
   - Statistics computed across trials

2. **Module-Symbiote**
   - Can run Symbiote E2E test via headless mode
   - Metrics collected at each phase
   - Actions map to Symbiote MCP tools
   - State transitions tracked

3. **Integration**
   - Full experiment: condition × trial × session
   - Results exportable for analysis
   - MCP tools work from Claude

## Design Decisions

This section documents key design decisions made during the RFC review process.

### D-1: Trial-Condition Relationship

**Decision**: `conditionId` is optional, allowing both condition-scoped and study-wide trials.

**Rationale**: This enables two use cases:
- **Condition-scoped trials**: Parameter sweeps within a specific condition (e.g., vary timeout within "GPT-4" condition)
- **Study-wide trials**: Parameter sweeps that apply across all conditions (e.g., compare timeouts independent of model)

The `@@unique([studyId, conditionId, sequence])` constraint ensures proper sequencing within each scope.

### D-2: TrialStatus as Enum

**Decision**: Use `TrialStatus` enum instead of String for the status field.

**Rationale**: Aligns with existing Prisma enums (`ParticipantType`, `ResearcherRole`, `CollaborativePhase`) and provides type safety at the database level.

### D-3: Metrics Aggregation Strategy

**Decision**: Metrics are denormalized on the Trial model with incremental updates.

**Rationale**:
- `sessionCount`, `successCount`, `failureCount` are updated atomically when sessions complete
- `metrics` JSON field holds computed aggregates, updated via background job after session completion
- Avoids expensive queries for dashboards while maintaining accuracy through eventual consistency

**Concurrency**: Use Prisma `$transaction` with optimistic locking for counter updates.

### D-4: MCP Tool Naming Convention

**Decision**: Use `snake_case` for MCP tool names (e.g., `create_trial`, `run_trial_batch`).

**Rationale**: Consistent with RFC-001 and MCP ecosystem conventions.

### D-5: PluginContext Extension

**Decision**: Extend `PluginContext` to include `trial?: { id: string; parameters: Record<string, unknown> }`.

**Rationale**: Plugins need access to trial parameters to configure their behavior. This is added to the core `@sherlock/plugins` package as it's a cross-cutting concern.

### D-6: OrchestrationState vs StoryState

**Decision**: `OrchestrationState` is a separate interface, not extending `StoryState`.

**Rationale**: Orchestration experiments track fundamentally different data (CI status, agent lifecycle, code review iterations) than interactive fiction (passages, choices, narrative state). A common base interface would be overly abstract.

## Open Questions

1. **Trial vs Condition Priority**: Should trials be optional (conditions can have direct sessions) or required?
   - **Decision**: Optional - backwards compatible with existing studies

2. **Parameter Types**: Should we support typed parameters or keep as JSON?
   - **Decision**: JSON with optional schema validation via condition config

3. **Real-time vs Batch**: Should module-symbiote support real-time observation or only batch experiments?
   - **Decision**: Start with batch, add real-time observation in future iteration

## References

- RFC-001: Symbiote-Sherlock Integration Architecture
- Sherlock Plugin Architecture: `packages/plugins/src/types.ts`
- Symbiote MCP Tools: See Symbiote documentation
