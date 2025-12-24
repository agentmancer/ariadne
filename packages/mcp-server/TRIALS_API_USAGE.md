# Trials API Client - Usage Examples

This document provides practical examples of using the Trials API client for parameter sweep experiments.

## Quick Start

```typescript
import { TrialsAPIClient } from '@ariadne/mcp-server';

// Initialize client with authentication
const client = new TrialsAPIClient({
  apiBaseUrl: 'http://localhost:3002',
  authToken: process.env.API_AUTH_TOKEN
});
```

## Example 1: Single Trial Creation

Create a single trial to test a specific parameter configuration:

```typescript
const trial = await client.createTrial({
  studyId: 'study-abc123',
  name: 'GPT-4 High Temperature',
  parameters: {
    model: 'gpt-4',
    temperature: 0.9,
    maxTokens: 1000,
    systemPrompt: 'You are a helpful assistant'
  }
});

console.log(`Trial created: ${trial.id}`);
console.log(`Sequence: ${trial.sequence}`);
```

## Example 2: Temperature Parameter Sweep

Test different temperature values to find optimal settings:

```typescript
const sweep = await client.createParameterSweep({
  studyId: 'study-abc123',
  parameterKey: 'temperature',
  values: [0.1, 0.3, 0.5, 0.7, 0.9],
  baseParameters: {
    model: 'gpt-4',
    maxTokens: 500,
    systemPrompt: 'You are a helpful assistant'
  }
});

console.log(`Created ${sweep.count} trials`);
sweep.trials.forEach(trial => {
  console.log(`- ${trial.name}: ${trial.id}`);
});
```

## Example 3: Model Comparison Sweep

Compare different models with the same parameters:

```typescript
const modelSweep = await client.createParameterSweep({
  studyId: 'study-abc123',
  parameterKey: 'model',
  values: ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo'],
  baseParameters: {
    temperature: 0.7,
    maxTokens: 500
  }
});

// Run each trial with 10 sessions
for (const trial of modelSweep.trials) {
  await client.runTrialBatch({
    trialId: trial.id,
    sessionCount: 10
  });
}
```

## Example 4: Running Trial Batches

Execute multiple sessions for a trial to gather statistical data:

```typescript
const batchResult = await client.runTrialBatch({
  trialId: 'trial-xyz789',
  sessionCount: 20,
  agentDefinitionId: 'agent-001' // optional
});

console.log(`Created ${batchResult.sessionsCreated} sessions`);
batchResult.sessions.forEach(session => {
  console.log(`- ${session.name} scheduled at ${session.scheduledStart}`);
});
```

## Example 5: Analyzing Trial Results

Get aggregated statistics and metrics for a completed trial:

```typescript
const results = await client.getTrialResults('trial-xyz789');

console.log(`Trial: ${results.trialName}`);
console.log(`Status: ${results.status}`);
console.log(`\nSession Statistics:`);
console.log(`- Total: ${results.sessionStats.total}`);
console.log(`- Completed: ${results.sessionStats.completed}`);
console.log(`- Success Rate: ${(results.sessionStats.successRate * 100).toFixed(1)}%`);

if (results.durationStats) {
  console.log(`\nDuration Statistics:`);
  console.log(`- Mean: ${(results.durationStats.mean / 1000).toFixed(2)}s`);
  console.log(`- Min: ${(results.durationStats.min / 1000).toFixed(2)}s`);
  console.log(`- Max: ${(results.durationStats.max / 1000).toFixed(2)}s`);
}

if (results.metrics) {
  console.log(`\nCustom Metrics:`, results.metrics);
}
```

## Example 6: Complete Parameter Sweep Workflow

Full workflow from sweep creation to results analysis:

```typescript
async function runParameterSweepExperiment(studyId: string) {
  const client = new TrialsAPIClient({
    authToken: process.env.API_AUTH_TOKEN
  });

  // Step 1: Create parameter sweep
  console.log('Creating parameter sweep...');
  const sweep = await client.createParameterSweep({
    studyId,
    parameterKey: 'temperature',
    values: [0.3, 0.5, 0.7, 0.9],
    baseParameters: {
      model: 'gpt-4',
      maxTokens: 500
    }
  });

  console.log(`Created ${sweep.count} trials`);

  // Step 2: Run batches for each trial
  console.log('\nRunning trial batches...');
  for (const trial of sweep.trials) {
    console.log(`Running trial: ${trial.name}`);
    await client.runTrialBatch({
      trialId: trial.id,
      sessionCount: 10
    });
  }

  // Step 3: Wait for completion (in production, use polling or webhooks)
  console.log('\nWaiting for trials to complete...');
  await new Promise(resolve => setTimeout(resolve, 60000));

  // Step 4: Collect and analyze results
  console.log('\nAnalyzing results...');
  const allResults = [];

  for (const trial of sweep.trials) {
    const results = await client.getTrialResults(trial.id);
    allResults.push(results);

    console.log(`\n${results.trialName}:`);
    console.log(`  Success Rate: ${(results.sessionStats.successRate * 100).toFixed(1)}%`);
    if (results.durationStats) {
      console.log(`  Avg Duration: ${(results.durationStats.mean / 1000).toFixed(2)}s`);
    }
  }

  // Step 5: Find optimal parameter
  const optimal = allResults.reduce((best, current) => {
    const bestRate = best.sessionStats.successRate || 0;
    const currentRate = current.sessionStats.successRate || 0;
    return currentRate > bestRate ? current : best;
  });

  console.log(`\nOptimal configuration:`);
  console.log(`  ${optimal.parameterKey} = ${optimal.parameterValue}`);
  console.log(`  Success Rate: ${(optimal.sessionStats.successRate * 100).toFixed(1)}%`);

  return allResults;
}

// Run the experiment
runParameterSweepExperiment('study-abc123')
  .then(results => console.log('\nExperiment complete!'))
  .catch(err => console.error('Error:', err));
```

## Example 7: Using Helper Functions

Simplified API using helper functions:

```typescript
import {
  createTrial,
  createParameterSweep,
  runTrialBatch,
  getTrialResults
} from '@ariadne/mcp-server';

const authToken = process.env.API_AUTH_TOKEN!;

// Create a trial
const trial = await createTrial({
  studyId: 'study-123',
  name: 'Test Trial',
  parameters: { temperature: 0.7 },
  authToken
});

// Create a sweep
const sweep = await createParameterSweep({
  studyId: 'study-123',
  parameterKey: 'temperature',
  values: [0.3, 0.7],
  authToken
});

// Run a batch
const batch = await runTrialBatch({
  trialId: trial.id,
  sessionCount: 5,
  authToken
});

// Get results
const results = await getTrialResults(trial.id, authToken);
console.log(results);
```

## Example 8: Get a Single Trial

Retrieve details for a specific trial by ID:

```typescript
const trial = await client.getTrial('trial-xyz789');

console.log(`Trial: ${trial.name}`);
console.log(`Status: ${trial.status}`);
console.log(`Parameters:`, trial.parameters);
console.log(`Sessions: ${trial.sessionCount}`);
console.log(`Success Rate: ${trial.successCount}/${trial.sessionCount}`);

if (trial.condition) {
  console.log(`Condition: ${trial.condition.name}`);
}
```

## Example 9: List and Filter Trials

Query trials with filtering and pagination:

```typescript
// List all trials for a study
const allTrials = await client.listTrials('study-abc123');

// Filter by condition
const conditionTrials = await client.listTrials('study-abc123', {
  conditionId: 'condition-xyz',
  page: 1,
  pageSize: 20
});

// Filter by status
const runningTrials = await client.listTrials('study-abc123', {
  status: 'RUNNING'
});

// Filter by parameter key
const tempTrials = await client.listTrials('study-abc123', {
  parameterKey: 'temperature'
});

console.log(`Total trials: ${allTrials.pagination.total}`);
console.log(`Pages: ${allTrials.pagination.totalPages}`);

allTrials.data.forEach(trial => {
  console.log(`${trial.name}: ${trial.status} (${trial.sessionCount} sessions)`);
});
```

## Error Handling

Always include proper error handling:

```typescript
try {
  const trial = await client.createTrial({
    studyId: 'study-123',
    parameters: { temperature: 0.7 }
  });
  console.log('Trial created:', trial.id);
} catch (error) {
  if (error instanceof Error) {
    console.error('Failed to create trial:', error.message);

    // Check for specific error types
    if (error.message.includes('HTTP 401')) {
      console.error('Authentication failed. Check your token.');
    } else if (error.message.includes('HTTP 404')) {
      console.error('Study not found. Check the study ID.');
    } else if (error.message.includes('HTTP 403')) {
      console.error('Access denied. Verify permissions.');
    }
  }
}
```

## Environment Setup

Set up your environment variables:

```bash
# .env file
API_BASE_URL=http://localhost:3002
API_AUTH_TOKEN=your-jwt-token-here

# Or export them
export API_BASE_URL=http://localhost:3002
export API_AUTH_TOKEN=$(node -e "console.log(process.env.JWT_TOKEN)")
```

## Testing

Use the included test script:

```bash
# Set environment variables
export API_AUTH_TOKEN=your-token

# Run tests with a study ID
pnpm test:trials study-abc123

# Or set study ID via environment
export TEST_STUDY_ID=study-abc123
pnpm test:trials
```

## Best Practices

1. **Batch Processing**: When running multiple trials, process them in batches to avoid overwhelming the API
2. **Error Recovery**: Implement retry logic for transient failures
3. **Result Polling**: Use polling or webhooks to check trial completion status
4. **Resource Limits**: Respect API rate limits (sessionCount max: 100, values max: 100)
5. **Authentication**: Store tokens securely and refresh them before expiration
6. **Logging**: Log trial IDs and parameters for debugging and audit trails

## Integration with Research Workflows

```typescript
// Integration example with analysis pipeline
import { TrialsAPIClient } from '@ariadne/mcp-server';
import * as fs from 'fs/promises';

async function runExperimentPipeline(config: ExperimentConfig) {
  const client = new TrialsAPIClient({ authToken: config.authToken });

  // Phase 1: Setup
  const sweep = await client.createParameterSweep({
    studyId: config.studyId,
    parameterKey: config.parameterKey,
    values: config.values,
    baseParameters: config.baseParameters
  });

  // Phase 2: Execution
  const trialIds = sweep.trials.map(t => t.id);
  for (const trialId of trialIds) {
    await client.runTrialBatch({
      trialId,
      sessionCount: config.sessionsPerTrial
    });
  }

  // Phase 3: Collection
  const results = await Promise.all(
    trialIds.map(id => client.getTrialResults(id))
  );

  // Phase 4: Export
  await fs.writeFile(
    `results-${Date.now()}.json`,
    JSON.stringify(results, null, 2)
  );

  return results;
}
```

## Additional Resources

- [API Documentation](../api/README.md)
- [Trials API Routes](../../api/src/routes/trials.ts)
- [MCP Server README](./README.md)
