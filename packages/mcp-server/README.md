# @ariadne/mcp-server

MCP integration for the Ariadne Platform, providing clients for both external story servers and internal Trials API.

## Overview

This package provides two main clients:
1. **Story MCP Client**: Connect to external MCP story servers for agent playthrough capabilities
2. **Trials API Client**: Interact with Ariadne's Trials API for parameter sweep experiments and trial execution

## Installation

```bash
pnpm install
```

## Configuration

### Story MCP Client

The MCP server connection is configured in `.mcp_config.json`:

```json
{
  "mcpServers": {
    "story-game": {
      "command": "/home/john/story/main/venv/bin/python",
      "args": ["/home/john/story/main/src/servers/story_mcp_server.py"],
      "env": {
        "PYTHONPATH": "/home/john/story/main"
      }
    }
  }
}
```

### Trials API Client

Configure via constructor or environment variables:

```bash
# Environment variables
export API_BASE_URL=http://localhost:3002
export API_AUTH_TOKEN=your-jwt-token
```

## Usage

### Trials API Client

```typescript
import { TrialsAPIClient } from '@ariadne/mcp-server';

// Create client with authentication
const client = new TrialsAPIClient({
  apiBaseUrl: 'http://localhost:3002',
  authToken: 'your-jwt-token'
});

// Create a single trial
const trial = await client.createTrial({
  studyId: 'study-123',
  name: 'High Temperature Test',
  parameters: {
    temperature: 0.9,
    maxTokens: 1000
  }
});

// Create a parameter sweep
const sweep = await client.createParameterSweep({
  studyId: 'study-123',
  parameterKey: 'temperature',
  values: [0.3, 0.5, 0.7, 0.9],
  baseParameters: {
    maxTokens: 500,
    strategy: 'goal_driven'
  }
});

// Run trial batch
const batchResult = await client.runTrialBatch({
  trialId: trial.id,
  sessionCount: 10
});

// Get trial results
const results = await client.getTrialResults(trial.id);
console.log(`Success rate: ${results.sessionStats.successRate * 100}%`);
```

#### Helper Functions

```typescript
import {
  createTrial,
  createParameterSweep,
  runTrialBatch,
  getTrialResults
} from '@ariadne/mcp-server';

// Create trial (helper)
const trial = await createTrial({
  studyId: 'study-123',
  name: 'Test Trial',
  parameters: { temperature: 0.7 },
  authToken: 'your-jwt-token'
});

// Create parameter sweep (helper)
const sweep = await createParameterSweep({
  studyId: 'study-123',
  parameterKey: 'temperature',
  values: [0.3, 0.5, 0.7],
  authToken: 'your-jwt-token'
});
```

### Story MCP Client

```typescript
import { StoryMCPClient } from '@ariadne/mcp-server';

const client = new StoryMCPClient();

// Connect to MCP server
await client.connect();

try {
  // Run an agent playthrough
  const summary = await client.playStorySession({
    story_template: 'jade_dragon_mystery',
    strategy: 'exploratory',
    max_actions: 50,
    quick_start: true
  });

  console.log(summary);

  // Extract session ID and get detailed results
  const sessionId = extractSessionId(summary);
  const record = await client.getPlaythroughRecord(sessionId);

  console.log('Playthrough completed:');
  console.log(`  Actions: ${record.total_actions}`);
  console.log(`  Duration: ${record.duration_seconds}s`);
  console.log(`  Ending: ${record.ending_type}`);
  console.log(`  Branches: ${record.unique_branches}`);

} finally {
  await client.disconnect();
}
```

### Multi-Agent Exploration

```typescript
import { runMultiAgentExploration } from '@ariadne/mcp-server';

// Run 40 playthroughs (10 per strategy)
const results = await runMultiAgentExploration({
  story_template: 'jade_dragon_mystery',
  strategies: ['exploratory', 'goal_driven', 'curious', 'random'],
  playthroughs_per_strategy: 10,
  max_actions: 50
});

// Analyze results
console.log(`Total playthroughs: ${results.length}`);

// Choice distribution analysis
const choiceFrequencies = {};
results.forEach(record => {
  record.actions.forEach(action => {
    choiceFrequencies[action.choice_id] =
      (choiceFrequencies[action.choice_id] || 0) + 1;
  });
});

console.log('Choice frequencies:', choiceFrequencies);

// Strategy comparison
const byStrategy = results.reduce((acc, record) => {
  if (!acc[record.strategy]) {
    acc[record.strategy] = [];
  }
  acc[record.strategy].push(record);
  return acc;
}, {});

Object.entries(byStrategy).forEach(([strategy, records]) => {
  const avgActions = records.reduce((sum, r) => sum + r.total_actions, 0) / records.length;
  const avgBranches = records.reduce((sum, r) => sum + r.unique_branches, 0) / records.length;

  console.log(`${strategy}:`);
  console.log(`  Avg actions: ${avgActions.toFixed(1)}`);
  console.log(`  Avg branches: ${avgBranches.toFixed(1)}`);
});
```

### Integration with Sherlock API

```typescript
// In packages/api/src/services/agent-exploration.ts

import { StoryMCPClient, PlaythroughRecord } from '@ariadne/mcp-server';
import { prisma } from '../lib/prisma';

export async function runBatchExploration(batchExecutionId: string) {
  const batchExecution = await prisma.batchExecution.findUnique({
    where: { id: batchExecutionId },
    include: { agentDefinition: true }
  });

  if (!batchExecution) {
    throw new Error('Batch execution not found');
  }

  const client = new StoryMCPClient();
  await client.connect();

  try {
    const results: PlaythroughRecord[] = [];

    for (let i = 0; i < batchExecution.count; i++) {
      // Run playthrough
      const summary = await client.playStorySession({
        story_template: batchExecution.storyTemplate,
        strategy: batchExecution.agentDefinition.strategy,
        max_actions: batchExecution.agentDefinition.maxActions
      });

      // Get detailed record
      const sessionIdMatch = summary.match(/Session ID: ([\\w-]+)/);
      if (sessionIdMatch) {
        const record = await client.getPlaythroughRecord(sessionIdMatch[1]);
        results.push(record);

        // Store in database
        await prisma.storyData.create({
          data: {
            sessionId: record.session_id,
            batchExecutionId: batchExecution.id,
            data: JSON.stringify(record),
            createdAt: new Date()
          }
        });
      }

      // Update progress
      await prisma.batchExecution.update({
        where: { id: batchExecutionId },
        data: {
          progress: i + 1,
          status: i + 1 === batchExecution.count ? 'COMPLETED' : 'RUNNING'
        }
      });
    }

    return results;
  } finally {
    await client.disconnect();
  }
}
```

## Available Agent Strategies

### `exploratory`
- **Goal**: Maximize branch coverage
- **Behavior**: Favors novel, less-explored choices
- **Use Case**: Mapping full story structure

### `goal_driven`
- **Goal**: Achieve protagonist's objectives
- **Behavior**: Aligns choices with character goals
- **Use Case**: Finding optimal success paths

### `curious`
- **Goal**: Follow mysteries and interesting content
- **Behavior**: Prioritizes questions, character interactions, investigations
- **Use Case**: Simulating natural player behavior

### `random`
- **Goal**: Baseline comparison
- **Behavior**: Random choice selection
- **Use Case**: Control group for analysis

### `optimal` (placeholder)
- **Goal**: Predict best outcomes
- **Behavior**: Currently falls back to goal_driven
- **Use Case**: Finding "perfect" playthroughs

## API Reference

### `StoryMCPClient`

#### `constructor(configPath?: string)`
Creates a new MCP client. If `configPath` is not provided, looks for `.mcp_config.json` in the project root.

#### `connect(): Promise<void>`
Connects to the MCP server.

#### `disconnect(): Promise<void>`
Disconnects from the MCP server.

#### `playStorySession(params: AgentPlaythroughParams): Promise<string>`
Runs an autonomous agent playthrough. Returns a summary string.

**Parameters:**
```typescript
{
  story_template?: string;  // Default: 'jade_dragon_mystery'
  strategy: 'exploratory' | 'goal_driven' | 'curious' | 'random' | 'optimal';
  quick_start?: boolean;    // Default: true
  max_actions?: number;     // Default: 50
}
```

#### `getPlaythroughRecord(sessionId: string): Promise<PlaythroughRecord>`
Retrieves detailed playthrough data.

**Returns:**
```typescript
{
  session_id: string;
  strategy: string;
  total_actions: number;
  duration_seconds: number;
  ending_reached: boolean;
  ending_type?: string;
  branches_explored: string[];
  unique_branches: number;
  actions: Array<{
    action_num: number;
    choice_id: string;
    choice_text: string;
    result_narrative: string;
    new_scene?: string;
    timestamp: number;
  }>;
  final_state?: any;
}
```

#### `listTools(): Promise<any[]>`
Lists all available MCP tools.

#### `getSessionState(sessionId: string): Promise<any>`
Gets the current state of a story session.

### Helper Functions

#### `runMultiAgentExploration(params): Promise<PlaythroughRecord[]>`
Runs multiple agent playthroughs with different strategies.

**Parameters:**
```typescript
{
  story_template: string;
  strategies: Array<'exploratory' | 'goal_driven' | 'curious' | 'random' | 'optimal'>;
  playthroughs_per_strategy: number;
  max_actions?: number;  // Default: 50
}
```

## Trials API Reference

### TrialsAPIClient Methods

#### `createTrial(params): Promise<Trial>`
Create a single trial with specific parameters.

**Parameters:**
- `studyId` (string, required): Study ID
- `conditionId` (string, optional): Condition ID
- `name` (string, optional): Trial name
- `parameters` (object, optional): Parameter configuration

#### `createParameterSweep(params): Promise<ParameterSweepResult>`
Create multiple trials varying a single parameter.

**Parameters:**
- `studyId` (string, required): Study ID
- `parameterKey` (string, required): Parameter to vary
- `values` (array, required): Values to test (1-100 items)
- `conditionId` (string, optional): Condition ID
- `baseParameters` (object, optional): Base parameters for all trials

#### `runTrialBatch(params): Promise<RunTrialBatchResult>`
Execute multiple sessions for a trial.

**Parameters:**
- `trialId` (string, required): Trial ID
- `sessionCount` (number, required): Number of sessions (1-100)
- `agentDefinitionId` (string, optional): Agent definition ID

#### `getTrial(trialId): Promise<Trial>`
Get a specific trial by ID.

**Parameters:**
- `trialId` (string, required): Trial ID

#### `getTrialResults(trialId): Promise<TrialResults>`
Get aggregated results and statistics for a trial.

**Parameters:**
- `trialId` (string, required): Trial ID

**Returns:**
```typescript
{
  trialId: string;
  trialName: string | null;
  status: string;
  parameters: TrialParameters;
  sessionStats: {
    total: number;
    completed: number;
    successCount: number;
    failureCount: number;
    successRate: number | null;
  };
  durationStats: {
    mean: number;
    min: number;
    max: number;
    count: number;
  } | null;
  metrics: Record<string, unknown> | null;
}
```

## Testing

### Test Story MCP Connection

```bash
# Basic connection test
pnpm test:connection

# Full playthrough test
pnpm test:connection -- --playthrough

# Test with specific strategy
pnpm test:connection -- --playthrough exploratory
```

### Test Trials API Client

```bash
# Set authentication token
export API_AUTH_TOKEN=your-jwt-token

# Run trials client tests
pnpm test:trials study-id-123

# Or provide study ID via environment
export TEST_STUDY_ID=study-123
pnpm test:trials
```

## Development

```bash
# Watch mode
pnpm dev

# Build
pnpm build

# Type check
pnpm type-check
```

## Dependencies

**Prerequisites:**
1. Story MCP Server must be set up at `~/story/main`
2. Dynamic Story Server must be running on `localhost:5000`
3. Python virtual environment activated with MCP SDK installed

**To start servers:**

```bash
# Terminal 1: Start Dynamic Story Server
cd ~/story/main
source venv/bin/activate
python src/servers/dynamic_story_server.py

# Terminal 2: MCP client will spawn MCP server automatically
```

## Architecture

```
Ariadne API
    ↓ uses
@ariadne/mcp-server (this package)
    ↓ MCP Protocol (stdio)
Story MCP Server (Python)
    ↓ REST API
Dynamic Story Server (Flask)
```

## Related Documentation

- **Story MCP Server**: `~/story/main/docs/MCP_AGENT_EXTENSION.md`
- **Agent Strategies**: `~/story/main/docs/AGENT_QUICKSTART.md`
- **Integration Summary**: `~/story/main/AGENT_INTEGRATION_SUMMARY.md`

## License

MIT
