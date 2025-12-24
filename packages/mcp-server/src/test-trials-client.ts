/**
 * Trials API Client Test Script
 *
 * This script demonstrates how to use the Trials API client to:
 * - Create individual trials
 * - Create parameter sweeps
 * - Run trial batches
 * - Get trial results
 *
 * Prerequisites:
 * - Ariadne API server must be running
 * - Valid authentication token must be provided
 * - A valid study ID must exist
 *
 * Usage:
 *   API_AUTH_TOKEN=your-token tsx src/test-trials-client.ts
 */

import { TrialsAPIClient } from './trials-client';

// Terminal colors for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function header(message: string) {
  console.log();
  log(`${'='.repeat(70)}`, colors.bright);
  log(message, colors.bright + colors.cyan);
  log(`${'='.repeat(70)}`, colors.bright);
}

function success(message: string) {
  log(`✓ ${message}`, colors.green);
}

function error(message: string) {
  log(`✗ ${message}`, colors.red);
}

function info(message: string) {
  log(`ℹ ${message}`, colors.blue);
}

function warn(message: string) {
  log(`⚠ ${message}`, colors.yellow);
}

/**
 * Test 1: Create a single trial
 */
async function testCreateTrial(client: TrialsAPIClient, studyId: string): Promise<string | null> {
  header('Test 1: Create Single Trial');

  try {
    info('Creating trial with custom parameters...');

    const trial = await client.createTrial({
      studyId,
      name: 'Test Trial - High Temperature',
      parameters: {
        temperature: 0.9,
        maxTokens: 1000,
        strategy: 'exploratory',
      },
    });

    success(`Trial created successfully!`);
    log(`  Trial ID: ${trial.id}`, colors.reset);
    log(`  Name: ${trial.name}`, colors.reset);
    log(`  Sequence: ${trial.sequence}`, colors.reset);
    log(`  Status: ${trial.status}`, colors.reset);
    log(`  Parameters: ${JSON.stringify(trial.parameters, null, 2)}`, colors.reset);

    return trial.id;
  } catch (err) {
    error(`Failed to create trial: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Test 2: Create a parameter sweep
 */
async function testParameterSweep(
  client: TrialsAPIClient,
  studyId: string
): Promise<string[] | null> {
  header('Test 2: Create Parameter Sweep');

  try {
    info('Creating parameter sweep for temperature values...');

    const sweep = await client.createParameterSweep({
      studyId,
      parameterKey: 'temperature',
      values: [0.3, 0.5, 0.7, 0.9],
      baseParameters: {
        maxTokens: 500,
        strategy: 'goal_driven',
      },
    });

    success(`Parameter sweep created successfully!`);
    log(`  Trials created: ${sweep.count}`, colors.reset);
    log(`  Parameter: ${sweep.parameterKey}`, colors.reset);
    log(`  Values: ${JSON.stringify(sweep.values)}`, colors.reset);
    console.log();

    log('Created trials:', colors.bright);
    sweep.trials.forEach((trial, idx) => {
      log(`  ${idx + 1}. ${trial.name} (ID: ${trial.id})`, colors.reset);
      log(`     Status: ${trial.status}, Sequence: ${trial.sequence}`, colors.reset);
    });

    return sweep.trials.map(t => t.id);
  } catch (err) {
    error(`Failed to create parameter sweep: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Test 3: Run a trial batch
 */
async function testRunTrialBatch(client: TrialsAPIClient, trialId: string): Promise<boolean> {
  header('Test 3: Run Trial Batch');

  try {
    info(`Running trial batch for trial ${trialId}...`);

    const result = await client.runTrialBatch({
      trialId,
      sessionCount: 5,
    });

    success(`Trial batch started successfully!`);
    log(`  Trial ID: ${result.trialId}`, colors.reset);
    log(`  Sessions created: ${result.sessionsCreated}`, colors.reset);
    log(`  Message: ${result.message}`, colors.reset);
    console.log();

    log('Created sessions:', colors.bright);
    result.sessions.forEach((session, idx) => {
      log(`  ${idx + 1}. ${session.name} (ID: ${session.id})`, colors.reset);
      log(`     Scheduled: ${new Date(session.scheduledStart).toLocaleString()}`, colors.reset);
    });

    return true;
  } catch (err) {
    error(`Failed to run trial batch: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/**
 * Test 4: Get trial results
 */
async function testGetTrialResults(client: TrialsAPIClient, trialId: string): Promise<boolean> {
  header('Test 4: Get Trial Results');

  try {
    info(`Fetching results for trial ${trialId}...`);

    const results = await client.getTrialResults(trialId);

    success(`Trial results retrieved successfully!`);
    log(`  Trial ID: ${results.trialId}`, colors.reset);
    log(`  Trial Name: ${results.trialName || 'N/A'}`, colors.reset);
    log(`  Status: ${results.status}`, colors.reset);
    if (results.parameterKey && results.parameterValue) {
      log(`  Parameter: ${results.parameterKey} = ${results.parameterValue}`, colors.reset);
    }
    console.log();

    log('Session Statistics:', colors.bright);
    log(`  Total sessions: ${results.sessionStats.total}`, colors.reset);
    log(`  Completed: ${results.sessionStats.completed}`, colors.reset);
    log(`  Success count: ${results.sessionStats.successCount}`, colors.reset);
    log(`  Failure count: ${results.sessionStats.failureCount}`, colors.reset);
    if (results.sessionStats.successRate !== null) {
      log(`  Success rate: ${(results.sessionStats.successRate * 100).toFixed(1)}%`, colors.reset);
    }
    console.log();

    if (results.durationStats) {
      log('Duration Statistics:', colors.bright);
      log(`  Mean: ${(results.durationStats.mean / 1000).toFixed(2)}s`, colors.reset);
      log(`  Min: ${(results.durationStats.min / 1000).toFixed(2)}s`, colors.reset);
      log(`  Max: ${(results.durationStats.max / 1000).toFixed(2)}s`, colors.reset);
      log(`  Sample count: ${results.durationStats.count}`, colors.reset);
    } else {
      log('Duration Statistics: No completed sessions yet', colors.yellow);
    }
    console.log();

    if (results.metrics) {
      log('Custom Metrics:', colors.bright);
      log(JSON.stringify(results.metrics, null, 2), colors.reset);
    }

    return true;
  } catch (err) {
    error(`Failed to get trial results: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/**
 * Test 5: List trials for a study
 */
async function testListTrials(client: TrialsAPIClient, studyId: string): Promise<boolean> {
  header('Test 5: List Trials for Study');

  try {
    info(`Fetching trials for study ${studyId}...`);

    const response = await client.listTrials(studyId, {
      page: 1,
      pageSize: 10,
    });

    success(`Trials list retrieved successfully!`);
    log(`  Total trials: ${response.pagination.total}`, colors.reset);
    log(`  Page: ${response.pagination.page}/${response.pagination.totalPages}`, colors.reset);
    console.log();

    if (response.data.length > 0) {
      log('Trials:', colors.bright);
      response.data.forEach((trial, idx) => {
        log(`  ${idx + 1}. ${trial.name || `Trial ${trial.sequence}`} (ID: ${trial.id})`, colors.reset);
        log(`     Status: ${trial.status}, Sessions: ${trial.sessionCount}`, colors.reset);
        if (trial.parameterKey && trial.parameterValue) {
          log(`     Parameter: ${trial.parameterKey} = ${trial.parameterValue}`, colors.reset);
        }
      });
    } else {
      warn('No trials found for this study');
    }

    return true;
  } catch (err) {
    error(`Failed to list trials: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/**
 * Main test runner
 */
async function main() {
  const args = process.argv.slice(2);

  log('\n╔════════════════════════════════════════════════════════════════════╗', colors.bright + colors.cyan);
  log('║          Trials API Client - Test Suite                           ║', colors.bright + colors.cyan);
  log('╚════════════════════════════════════════════════════════════════════╝', colors.bright + colors.cyan);

  // Check for required environment variables
  const authToken = process.env.API_AUTH_TOKEN;
  const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3002';

  if (!authToken) {
    error('\n❌ API_AUTH_TOKEN environment variable is required');
    error('   Set it to your researcher JWT token');
    error('   Example: API_AUTH_TOKEN=your-token tsx src/test-trials-client.ts');
    process.exit(1);
  }

  // Get study ID from command line or environment
  const studyId = args[0] || process.env.TEST_STUDY_ID;
  if (!studyId) {
    error('\n❌ Study ID is required');
    error('   Provide it as the first argument or set TEST_STUDY_ID');
    error('   Example: tsx src/test-trials-client.ts study-123');
    process.exit(1);
  }

  info(`\nAPI Base URL: ${apiBaseUrl}`);
  info(`Study ID: ${studyId}`);
  info('Authentication: Token provided ✓\n');

  // Create client
  const client = new TrialsAPIClient({ apiBaseUrl, authToken });

  const results = {
    createTrial: false,
    parameterSweep: false,
    runBatch: false,
    getResults: false,
    listTrials: false,
  };

  let testTrialId: string | null = null;
  let sweepTrialIds: string[] | null = null;

  // Test 1: Create single trial
  testTrialId = await testCreateTrial(client, studyId);
  results.createTrial = testTrialId !== null;

  // Test 2: Create parameter sweep
  sweepTrialIds = await testParameterSweep(client, studyId);
  results.parameterSweep = sweepTrialIds !== null;

  // Test 3: Run trial batch (only if trial was created)
  if (testTrialId) {
    results.runBatch = await testRunTrialBatch(client, testTrialId);
  } else {
    warn('\nSkipping run batch test (no trial created)');
  }

  // Test 4: Get trial results (only if trial was created)
  if (testTrialId) {
    results.getResults = await testGetTrialResults(client, testTrialId);
  } else {
    warn('\nSkipping get results test (no trial created)');
  }

  // Test 5: List trials
  results.listTrials = await testListTrials(client, studyId);

  // Summary
  header('Test Summary');

  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.values(results).length;

  Object.entries(results).forEach(([test, result]) => {
    if (result === true) {
      success(`${test}: PASSED`);
    } else if (result === false) {
      error(`${test}: FAILED`);
    }
  });

  console.log();
  if (passed === total) {
    success(`All ${passed} tests passed! ✓`);
    log('\nThe Trials API client is working correctly.', colors.green);
  } else {
    warn(`${passed}/${total} tests passed`);
  }

  console.log();
}

// Run tests
main().catch((err) => {
  error(`\nUnexpected error: ${err instanceof Error ? err.message : String(err)}`);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
