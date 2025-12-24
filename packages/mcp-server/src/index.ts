/**
 * Story MCP Client for Ariadne Platform
 *
 * Provides a client interface to connect to the story MCP server
 * and access agent playthrough capabilities.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import fs from 'fs';

export interface MCPConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface AgentPlaythroughParams {
  story_template?: string;
  strategy: 'exploratory' | 'goal_driven' | 'curious' | 'random' | 'optimal';
  quick_start?: boolean;
  max_actions?: number;
}

export interface PlaythroughRecord {
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

/**
 * MCP Client for Story Server
 */
export class StoryMCPClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private config: MCPConfig;

  constructor(configPath?: string) {
    // Load MCP config
    const configFile = configPath || path.join(process.cwd(), '../..', '.mcp_config.json');

    if (!fs.existsSync(configFile)) {
      throw new Error(`MCP config file not found: ${configFile}`);
    }

    const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));

    if (!config.mcpServers || !config.mcpServers['story-game']) {
      throw new Error('story-game server not configured in MCP config');
    }

    this.config = config.mcpServers['story-game'];
  }

  /**
   * Connect to the MCP server
   */
  async connect(): Promise<void> {
    this.transport = new StdioClientTransport({
      command: this.config.command,
      args: this.config.args,
      env: this.config.env
    });

    this.client = new Client({
      name: 'ariadne-story-client',
      version: '2.0.0'
    }, {
      capabilities: {}
    });

    await this.client.connect(this.transport);
  }

  /**
   * Disconnect from the MCP server
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
  }

  /**
   * Run an autonomous agent playthrough
   */
  async playStorySession(params: AgentPlaythroughParams): Promise<string> {
    if (!this.client) {
      throw new Error('Not connected to MCP server. Call connect() first.');
    }

    const result = await this.client.callTool({
      name: 'play_story_session',
      arguments: params as unknown as Record<string, unknown>
    });

    // Extract text from result
    const content = result.content as Array<{ type: string; text?: string }>;
    if (content && content.length > 0 && content[0].type === 'text') {
      return content[0].text!;
    }

    throw new Error('Unexpected response format from MCP server');
  }

  /**
   * Get detailed playthrough record
   */
  async getPlaythroughRecord(sessionId: string): Promise<PlaythroughRecord> {
    if (!this.client) {
      throw new Error('Not connected to MCP server. Call connect() first.');
    }

    const result = await this.client.callTool({
      name: 'get_playthrough_record',
      arguments: { session_id: sessionId } as Record<string, unknown>
    });

    // Extract and parse JSON from result
    const content = result.content as Array<{ type: string; text?: string }>;
    if (content && content.length > 0 && content[0].type === 'text') {
      return JSON.parse(content[0].text!);
    }

    throw new Error('Unexpected response format from MCP server');
  }

  /**
   * List all available MCP tools
   */
  async listTools(): Promise<any[]> {
    if (!this.client) {
      throw new Error('Not connected to MCP server. Call connect() first.');
    }

    const response = await this.client.listTools();
    return response.tools;
  }

  /**
   * Get session state (from story server)
   */
  async getSessionState(sessionId: string): Promise<any> {
    if (!this.client) {
      throw new Error('Not connected to MCP server. Call connect() first.');
    }

    const result = await this.client.callTool({
      name: 'get_session_state',
      arguments: { session_id: sessionId } as Record<string, unknown>
    });

    const content = result.content as Array<{ type: string; text?: string }>;
    if (content && content.length > 0 && content[0].type === 'text') {
      return JSON.parse(content[0].text!);
    }

    throw new Error('Unexpected response format from MCP server');
  }
}

/**
 * Helper function to run a multi-agent exploration
 */
export async function runMultiAgentExploration(params: {
  story_template: string;
  strategies: Array<'exploratory' | 'goal_driven' | 'curious' | 'random' | 'optimal'>;
  playthroughs_per_strategy: number;
  max_actions?: number;
}): Promise<PlaythroughRecord[]> {
  const client = new StoryMCPClient();
  await client.connect();

  try {
    const results: PlaythroughRecord[] = [];

    for (const strategy of params.strategies) {
      console.log(`Running ${params.playthroughs_per_strategy} playthroughs with ${strategy} strategy...`);

      for (let i = 0; i < params.playthroughs_per_strategy; i++) {
        console.log(`  Playthrough ${i + 1}/${params.playthroughs_per_strategy}...`);

        // Run playthrough
        const summary = await client.playStorySession({
          story_template: params.story_template,
          strategy,
          max_actions: params.max_actions || 50,
          quick_start: true
        });

        // Extract session ID from summary
        const sessionIdMatch = summary.match(/Session ID: ([\w-]+)/);
        if (!sessionIdMatch) {
          console.warn('Could not extract session ID from summary');
          continue;
        }

        const sessionId = sessionIdMatch[1];

        // Get detailed record
        const record = await client.getPlaythroughRecord(sessionId);
        results.push(record);
      }
    }

    return results;
  } finally {
    await client.disconnect();
  }
}

export default StoryMCPClient;

// Export Trials API client
export {
  TrialsAPIClient,
  createTrial,
  createParameterSweep,
  runTrialBatch,
  getTrialResults,
  type TrialClientConfig,
  type CreateTrialParams,
  type CreateParameterSweepParams,
  type RunTrialBatchParams,
  type Trial,
  type ParameterSweepResult,
  type RunTrialBatchResult,
  type TrialResults,
  type TrialParameters,
} from './trials-client';
