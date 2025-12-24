/**
 * MCP Connection Test Script
 *
 * This script tests the connection to the Story MCP Server and validates
 * that the agent playthrough capabilities work correctly.
 *
 * Prerequisites:
 * - Story MCP Server must be configured in .mcp_config.json
 * - Dynamic Story Server must be running on localhost:5000
 *
 * Usage:
 *   npm run test:connection                    # Basic connection test
 *   npm run test:connection -- --playthrough   # Full playthrough test
 */

import { StoryMCPClient, AgentPlaythroughParams } from './index';

// Valid agent strategies
const VALID_STRATEGIES = ['exploratory', 'goal_driven', 'curious', 'random', 'optimal'] as const;

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
 * Test 1: Basic Connection
 * Verifies that we can connect to the MCP server
 */
async function testConnection(): Promise<boolean> {
  header('Test 1: Basic Connection');

  try {
    info('Creating MCP client...');
    const client = new StoryMCPClient();

    info('Connecting to MCP server...');
    await client.connect();
    success('Connected to MCP server');

    info('Disconnecting...');
    await client.disconnect();
    success('Disconnected successfully');

    return true;
  } catch (err) {
    error(`Connection failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/**
 * Test 2: List Available Tools
 * Retrieves and displays all available MCP tools
 */
async function testListTools(): Promise<boolean> {
  header('Test 2: List Available Tools');

  try {
    const client = new StoryMCPClient();
    await client.connect();

    info('Fetching available tools...');
    const tools = await client.listTools();

    success(`Found ${tools.length} available tools:`);
    console.log();

    tools.forEach((tool, idx) => {
      log(`${idx + 1}. ${tool.name}`, colors.bright);
      if (tool.description) {
        log(`   ${tool.description}`, colors.reset);
      }
      if (tool.inputSchema) {
        const required = tool.inputSchema.required || [];
        const properties = Object.keys(tool.inputSchema.properties || {});
        if (properties.length > 0) {
          log(`   Parameters: ${properties.join(', ')}`, colors.reset);
          if (required.length > 0) {
            log(`   Required: ${required.join(', ')}`, colors.yellow);
          }
        }
      }
      console.log();
    });

    await client.disconnect();
    return true;
  } catch (err) {
    error(`List tools failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/**
 * Test 3: Agent Playthrough
 * Runs a single agent playthrough with the specified strategy
 */
async function testPlaythrough(
  strategy: AgentPlaythroughParams['strategy'] = 'exploratory',
  storyTemplate: string = 'jade_dragon_mystery',
  maxActions: number = 20
): Promise<boolean> {
  header(`Test 3: Agent Playthrough (${strategy} strategy)`);

  try {
    const client = new StoryMCPClient();
    await client.connect();

    const params: AgentPlaythroughParams = {
      story_template: storyTemplate,
      strategy,
      max_actions: maxActions,
      quick_start: true,
    };

    info(`Starting playthrough with parameters:`);
    log(`  Story: ${params.story_template}`, colors.reset);
    log(`  Strategy: ${params.strategy}`, colors.reset);
    log(`  Max actions: ${params.max_actions}`, colors.reset);
    console.log();

    info('Running playthrough...');
    const startTime = Date.now();
    const summary = await client.playStorySession(params);
    const duration = Date.now() - startTime;

    success(`Playthrough completed in ${(duration / 1000).toFixed(1)}s`);
    console.log();
    log('Summary:', colors.bright);
    console.log(summary);
    console.log();

    // Extract session ID from summary
    const sessionIdMatch = summary.match(/Session ID: ([\w-]+)/);

    if (sessionIdMatch) {
      const sessionId = sessionIdMatch[1];
      info(`Fetching detailed record for session ${sessionId}...`);

      const record = await client.getPlaythroughRecord(sessionId);

      console.log();
      log('Detailed Results:', colors.bright);
      log(`  Session ID: ${record.session_id}`, colors.reset);
      log(`  Strategy: ${record.strategy}`, colors.reset);
      log(`  Total Actions: ${record.total_actions}`, colors.reset);
      log(`  Duration: ${record.duration_seconds.toFixed(2)}s`, colors.reset);
      log(`  Ending Reached: ${record.ending_reached ? 'Yes' : 'No'}`, colors.reset);
      if (record.ending_type) {
        log(`  Ending Type: ${record.ending_type}`, colors.reset);
      }
      log(`  Unique Branches: ${record.unique_branches}`, colors.reset);
      log(`  Total Branches Explored: ${record.branches_explored.length}`, colors.reset);
      console.log();

      // Show first few actions
      if (record.actions.length > 0) {
        log('First 3 Actions:', colors.bright);
        record.actions.slice(0, 3).forEach((action) => {
          log(`  ${action.action_num}. ${action.choice_text}`, colors.reset);
          if (action.new_scene) {
            log(`     → New scene: ${action.new_scene}`, colors.cyan);
          }
        });
        console.log();
      }

      // Branch coverage analysis
      const branchSet = new Set(record.branches_explored);
      const coverage = record.branches_explored.length > 0
        ? (branchSet.size / record.branches_explored.length * 100)
        : 0;
      log(`Branch Coverage: ${coverage.toFixed(1)}% (${branchSet.size} unique / ${record.branches_explored.length} total)`, colors.reset);
    } else {
      warn('Could not extract session ID from summary');
    }

    await client.disconnect();
    return true;
  } catch (err) {
    error(`Playthrough failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/**
 * Main test runner
 */
async function main() {
  const args = process.argv.slice(2);
  const runPlaythrough = args.includes('--playthrough') || args.includes('-p');
  const runFull = args.includes('--full') || args.includes('-f');
  const strategy = (args.find(arg => VALID_STRATEGIES.includes(arg as any)) || 'exploratory') as AgentPlaythroughParams['strategy'];

  log('\n╔════════════════════════════════════════════════════════════════════╗', colors.bright + colors.cyan);
  log('║          Story MCP Client - Connection Test Suite                 ║', colors.bright + colors.cyan);
  log('╚════════════════════════════════════════════════════════════════════╝', colors.bright + colors.cyan);

  info('\nThis script tests the MCP client connection and capabilities.');
  info('Make sure the Dynamic Story Server is running on localhost:5000\n');

  const results = {
    connection: false,
    listTools: false,
    playthrough: false,
  };

  // Always run basic tests
  results.connection = await testConnection();

  if (!results.connection) {
    error('\n❌ Basic connection failed. Check that:');
    error('   1. .mcp_config.json is properly configured');
    error('   2. Story MCP Server path is correct');
    error('   3. Python virtual environment is set up');
    process.exit(1);
  }

  results.listTools = await testListTools();

  // Run playthrough tests if requested
  if (runPlaythrough || runFull) {
    warn('\nRunning playthrough test - this requires the Dynamic Story Server to be running!');
    info('If the server is not running, this test will fail.\n');

    results.playthrough = await testPlaythrough(strategy);
  } else {
    info('\nSkipping playthrough test (use --playthrough or -p to enable)');
    info('Example: npm run test:connection -- --playthrough');
    info('Example with strategy: npm run test:connection -- --playthrough curious');
  }

  // Summary
  header('Test Summary');

  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.values(results).filter(r => r !== false).length;

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
    log('\nThe MCP client is working correctly.', colors.green);

    if (!runPlaythrough && !runFull) {
      info('\nTo test agent playthroughs, run with --playthrough flag');
    }
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
