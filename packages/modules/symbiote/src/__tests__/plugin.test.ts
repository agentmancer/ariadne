import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SymbiotePlugin } from '../plugin';
import {
  OrchestrationPhase,
  OrchestrationActionType,
} from '../types';
import type { PluginContext, PluginAction } from '@ariadne/plugins';

// Mock the plugin context
const createMockContext = (overrides: Partial<PluginContext> = {}): PluginContext => ({
  study: {
    id: 'study-123',
    name: 'Test Study',
    type: 'orchestration',
  },
  actor: {
    id: 'actor-1',
    uniqueId: 'unique-1',
    type: 'SYNTHETIC',
  },
  actorType: 'SYNTHETIC',
  headless: true,
  session: {
    id: 'session-123',
    startTime: new Date(),
  },
  trial: {
    id: 'trial-456',
    parameters: {
      repository: 'test-org/test-repo',
      timeout: 60000,
    },
  },
  api: {
    logEvent: vi.fn().mockResolvedValue(undefined),
    saveStory: vi.fn().mockResolvedValue({ version: 1 }),
    loadStory: vi.fn().mockResolvedValue(null),
    loadPartnerStory: vi.fn().mockResolvedValue(null),
  },
  ...overrides,
});

describe('SymbiotePlugin', () => {
  let plugin: SymbiotePlugin;

  beforeEach(() => {
    plugin = new SymbiotePlugin();
  });

  describe('metadata', () => {
    it('should have correct plugin metadata', () => {
      expect(plugin.metadata.id).toBe('symbiote-orchestrator');
      expect(plugin.metadata.name).toBe('Symbiote Orchestrator');
      expect(plugin.metadata.version).toBe('1.0.0');
      expect(plugin.metadata.capabilities).toContain('orchestration');
      expect(plugin.metadata.capabilities).toContain('ci_integration');
      expect(plugin.metadata.capabilities).toContain('agent_lifecycle');
    });
  });

  describe('initHeadless', () => {
    it('should initialize orchestration state', async () => {
      const context = createMockContext();
      await plugin.initHeadless(context);

      const state = plugin.getOrchestrationState();
      expect(state).not.toBeNull();
      expect(state?.pluginType).toBe('symbiote-orchestrator');
      expect(state?.currentPhase).toBe(OrchestrationPhase.ISSUE_ASSIGNED);
      expect(state?.workItem.repository).toBe('test-org/test-repo');
      expect(state?.metadata.studyId).toBe('study-123');
      expect(state?.metadata.trialId).toBe('trial-456');
      expect(state?.metadata.sessionId).toBe('session-123');
    });

    it('should store trial parameters in config', async () => {
      const context = createMockContext({
        trial: {
          id: 'trial-789',
          parameters: {
            repository: 'my-org/my-repo',
            timeout: 300000,
            maxRetries: 5,
          },
        },
      });

      await plugin.initHeadless(context);

      const state = plugin.getOrchestrationState();
      expect(state?.config.timeout).toBe(300000);
      expect(state?.config.maxRetries).toBe(5);
    });

    it('should log session start event', async () => {
      const context = createMockContext();
      await plugin.initHeadless(context);

      expect(context.api.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'orchestration.session_start',
        })
      );
    });
  });

  describe('isComplete', () => {
    it('should return false when not initialized', () => {
      expect(plugin.isComplete()).toBe(false);
    });

    it('should return false for non-terminal phases', async () => {
      const context = createMockContext();
      await plugin.initHeadless(context);

      expect(plugin.isComplete()).toBe(false);
    });

    it('should return true for COMPLETED phase', async () => {
      const context = createMockContext();
      await plugin.initHeadless(context);

      const state = plugin.getOrchestrationState();
      if (state) {
        state.currentPhase = OrchestrationPhase.COMPLETED;
      }

      expect(plugin.isComplete()).toBe(true);
    });

    it('should return true for FAILED phase', async () => {
      const context = createMockContext();
      await plugin.initHeadless(context);

      const state = plugin.getOrchestrationState();
      if (state) {
        state.currentPhase = OrchestrationPhase.FAILED;
      }

      expect(plugin.isComplete()).toBe(true);
    });
  });

  describe('getAvailableActions', () => {
    it('should return empty array when not initialized', async () => {
      const actions = await plugin.getAvailableActions();
      expect(actions).toEqual([]);
    });

    it('should return actions for ISSUE_ASSIGNED phase', async () => {
      const context = createMockContext();
      await plugin.initHeadless(context);

      const actions = await plugin.getAvailableActions();
      expect(actions.length).toBeGreaterThan(0);

      const actionTypes = actions.map((a) => a.type);
      expect(actionTypes).toContain(OrchestrationActionType.CLAIM_ISSUE);
      expect(actionTypes).toContain(OrchestrationActionType.PROVISION_AGENT);
    });

    it('should return different actions for different phases', async () => {
      const context = createMockContext();
      await plugin.initHeadless(context);

      // Change to IMPLEMENTATION phase
      const state = plugin.getOrchestrationState();
      if (state) {
        state.currentPhase = OrchestrationPhase.IMPLEMENTATION;
      }

      const actions = await plugin.getAvailableActions();
      const actionTypes = actions.map((a) => a.type);
      expect(actionTypes).toContain(OrchestrationActionType.CREATE_PR);
    });
  });

  describe('executeHeadless', () => {
    it('should fail when not initialized', async () => {
      const action: PluginAction = {
        type: OrchestrationActionType.CLAIM_ISSUE,
        params: { issueNumber: 42 },
      };

      const result = await plugin.executeHeadless(action);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Plugin not initialized');
    });

    it('should execute CLAIM_ISSUE action', async () => {
      const context = createMockContext();
      await plugin.initHeadless(context);

      const action: PluginAction = {
        type: OrchestrationActionType.CLAIM_ISSUE,
        params: { issueNumber: 42 },
      };

      const result = await plugin.executeHeadless(action);
      expect(result.success).toBe(true);

      const state = plugin.getOrchestrationState();
      expect(state?.workItem.issueNumber).toBe(42);
      expect(state?.history.length).toBe(1);
    });

    it('should record action in history', async () => {
      const context = createMockContext();
      await plugin.initHeadless(context);

      const action: PluginAction = {
        type: OrchestrationActionType.PROVISION_AGENT,
        params: { worktreePath: '/tmp/test' },
      };

      await plugin.executeHeadless(action);

      const state = plugin.getOrchestrationState();
      expect(state?.history.length).toBe(1);
      expect(state?.history[0].action).toBe(OrchestrationActionType.PROVISION_AGENT);
      expect(state?.history[0].result).toBe('success');
    });

    it('should update phase after successful action', async () => {
      const context = createMockContext();
      await plugin.initHeadless(context);

      const action: PluginAction = {
        type: OrchestrationActionType.PROVISION_AGENT,
        params: { worktreePath: '/tmp/test' },
      };

      await plugin.executeHeadless(action);

      const state = plugin.getOrchestrationState();
      expect(state?.currentPhase).toBe(OrchestrationPhase.AGENT_PROVISIONED);
    });

    it('should update metrics on PR creation', async () => {
      const context = createMockContext();
      await plugin.initHeadless(context);

      // Set up state for PR creation
      const state = plugin.getOrchestrationState();
      if (state) {
        state.currentPhase = OrchestrationPhase.IMPLEMENTATION;
        state.workItem.issueNumber = 42;
        state.agent.status = 'active';
      }

      const action: PluginAction = {
        type: OrchestrationActionType.CREATE_PR,
        params: { title: 'Fix #42' },
      };

      await plugin.executeHeadless(action);

      // Verify metric was set (can be 0 in fast test execution)
      expect(state?.metrics.timeToFirstPR).toBeDefined();
      expect(typeof state?.metrics.timeToFirstPR).toBe('number');
    });

    it('should track implementation time when leaving implementation phase', async () => {
      const context = createMockContext();
      await plugin.initHeadless(context);

      // Set up state in implementation phase
      const state = plugin.getOrchestrationState();
      if (state) {
        state.currentPhase = OrchestrationPhase.IMPLEMENTATION;
        state.metadata.phaseEnteredAt = new Date(Date.now() - 1000); // 1 second ago
        state.workItem.issueNumber = 42;
        state.agent.status = 'active';
      }

      // Create PR to transition out of implementation
      const action: PluginAction = {
        type: OrchestrationActionType.CREATE_PR,
        params: { title: 'Fix #42' },
      };

      await plugin.executeHeadless(action);

      // Verify implementation time was tracked
      expect(state?.metrics.implementationTime).toBeDefined();
      expect(typeof state?.metrics.implementationTime).toBe('number');
    });

    it('should update phaseEnteredAt on phase transition', async () => {
      const context = createMockContext();
      await plugin.initHeadless(context);

      const state = plugin.getOrchestrationState();
      const initialPhaseEnteredAt = state?.metadata.phaseEnteredAt;

      // Wait a small amount to ensure time difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      const action: PluginAction = {
        type: OrchestrationActionType.PROVISION_AGENT,
        params: { worktreePath: '/tmp/test' },
      };

      await plugin.executeHeadless(action);

      // Verify phaseEnteredAt was updated
      expect(state?.metadata.phaseEnteredAt).toBeDefined();
      expect(new Date(state!.metadata.phaseEnteredAt!).getTime()).toBeGreaterThanOrEqual(
        new Date(initialPhaseEnteredAt!).getTime()
      );
    });
  });

  describe('execute commands', () => {
    it('should get current phase', async () => {
      const context = createMockContext();
      await plugin.initHeadless(context);

      const phase = await plugin.execute('getPhase');
      expect(phase).toBe(OrchestrationPhase.ISSUE_ASSIGNED);
    });

    it('should get metrics', async () => {
      const context = createMockContext();
      await plugin.initHeadless(context);

      const metrics = await plugin.execute('getMetrics');
      expect(metrics).toHaveProperty('ciAttempts', 0);
      expect(metrics).toHaveProperty('reviewIterations', 0);
    });

    it('should set issue', async () => {
      const context = createMockContext();
      await plugin.initHeadless(context);

      const result = await plugin.execute('setIssue', {
        issueNumber: 123,
        title: 'Test Issue',
      });

      expect(result).toBe(true);

      const state = plugin.getOrchestrationState();
      expect(state?.workItem.issueNumber).toBe(123);
      expect(state?.workItem.title).toBe('Test Issue');
    });

    it('should set PR', async () => {
      const context = createMockContext();
      await plugin.initHeadless(context);

      const result = await plugin.execute('setPR', {
        prNumber: 456,
        branch: 'feature/test',
      });

      expect(result).toBe(true);

      const state = plugin.getOrchestrationState();
      expect(state?.workItem.prNumber).toBe(456);
      expect(state?.workItem.branch).toBe('feature/test');
    });
  });
});
