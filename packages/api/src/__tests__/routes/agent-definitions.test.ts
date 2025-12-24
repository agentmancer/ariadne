/**
 * Integration tests for Agent Definitions API endpoints
 *
 * Tests the full CRUD operations for agent definitions:
 * - GET /agent-definitions - List agent definitions
 * - POST /agent-definitions - Create agent definition
 * - GET /agent-definitions/:id - Get single agent definition
 * - PUT /agent-definitions/:id - Update agent definition
 * - DELETE /agent-definitions/:id - Delete agent definition
 *
 * All endpoints require researcher authentication.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../../app';
import { prisma } from '../../lib/prisma';
import { generateResearcherToken } from '../../middleware/auth';
import { ResearcherRole, AccountStatus } from '@ariadne/shared';

// ============================================================================
// Test Fixtures & Helpers
// ============================================================================

interface TestFixture {
  researcherId: string;
  otherResearcherId: string;
  agentDefinitionId: string;
  publicAgentDefinitionId: string;
}

let app: Express;
let fixture: TestFixture;
let researcherToken: string;
let otherResearcherToken: string;

const validAgentDefinition = {
  name: 'Test Agent',
  description: 'A test agent for unit testing',
  role: 'narrator',
  systemPrompt: 'You are a test narrator agent.',
  llmConfig: { model: 'claude-3-sonnet-20240229' },
  enabledTools: ['describe_scene', 'create_npc'],
  toolUseMode: 'AGENTIC',
  agenticConfig: { maxIterations: 10 },
  isPublic: false,
  tags: ['test', 'narrator'],
};

/**
 * Create test fixtures for all tests
 */
async function createTestFixtures(): Promise<TestFixture> {
  // Clean up any leftover data from previous runs
  // IMPORTANT: Delete agent definitions BEFORE researchers (foreign key constraint)
  await prisma.agentDefinition.deleteMany({
    where: { name: { startsWith: 'Test' } }
  });

  // Also clean by researcher email
  const oldResearchers = await prisma.researcher.findMany({
    where: {
      email: {
        in: ['agent-def-test@test.com', 'agent-def-other@test.com']
      }
    },
    select: { id: true }
  });

  if (oldResearchers.length > 0) {
    await prisma.agentDefinition.deleteMany({
      where: { researcherId: { in: oldResearchers.map(r => r.id) } }
    });
  }

  await prisma.researcher.deleteMany({
    where: {
      email: {
        in: ['agent-def-test@test.com', 'agent-def-other@test.com']
      }
    },
  });

  // Create fixtures
  return await prisma.$transaction(async (tx) => {
    // Create primary researcher
    const researcher = await tx.researcher.create({
      data: {
        email: 'agent-def-test@test.com',
        passwordHash: 'hash',
        name: 'Test Researcher',
        role: 'RESEARCHER',
        status: 'ACTIVE',
        settings: {},
      },
    });

    // Create second researcher for ownership tests
    const otherResearcher = await tx.researcher.create({
      data: {
        email: 'agent-def-other@test.com',
        passwordHash: 'hash',
        name: 'Other Researcher',
        role: 'RESEARCHER',
        status: 'ACTIVE',
        settings: {},
      },
    });

    // Create an agent definition owned by primary researcher
    const agentDef = await tx.agentDefinition.create({
      data: {
        researcherId: researcher.id,
        name: 'Test Existing Agent',
        description: 'An existing test agent',
        role: 'narrator',
        systemPrompt: 'You are a narrator.',
        llmConfig: '{}',
        enabledTools: '[]',
        toolUseMode: 'AGENTIC',
        agenticConfig: '{}',
        isPublic: false,
        tags: '[]',
      },
    });

    // Create a public agent definition owned by other researcher
    const publicAgentDef = await tx.agentDefinition.create({
      data: {
        researcherId: otherResearcher.id,
        name: 'Test Public Agent',
        description: 'A public test agent',
        role: 'helper',
        systemPrompt: 'You are a helper.',
        llmConfig: '{}',
        enabledTools: '[]',
        toolUseMode: 'SCRIPTED',
        agenticConfig: '{}',
        isPublic: true,
        tags: '["public"]',
      },
    });

    return {
      researcherId: researcher.id,
      otherResearcherId: otherResearcher.id,
      agentDefinitionId: agentDef.id,
      publicAgentDefinitionId: publicAgentDef.id,
    };
  });
}

/**
 * Clean up test fixtures
 */
async function cleanupTestFixtures(fixtureToClean: TestFixture | undefined) {
  if (!fixtureToClean) {
    await prisma.agentDefinition.deleteMany({
      where: { name: { startsWith: 'Test' } }
    });
    await prisma.researcher.deleteMany({
      where: {
        email: {
          in: ['agent-def-test@test.com', 'agent-def-other@test.com']
        }
      },
    });
    return;
  }

  await prisma.$transaction([
    prisma.agentDefinition.deleteMany({
      where: {
        researcherId: {
          in: [fixtureToClean.researcherId, fixtureToClean.otherResearcherId]
        }
      }
    }),
    prisma.researcher.deleteMany({
      where: {
        id: {
          in: [fixtureToClean.researcherId, fixtureToClean.otherResearcherId]
        }
      }
    }),
  ]);
}

// ============================================================================
// Test Setup
// ============================================================================

beforeAll(async () => {
  app = createApp({
    enableRateLimiting: false,
    enableRequestLogging: false,
    enableSwagger: false,
  });
  fixture = await createTestFixtures();
  researcherToken = generateResearcherToken(
    fixture.researcherId,
    'agent-def-test@test.com',
    ResearcherRole.RESEARCHER,
    AccountStatus.ACTIVE
  );
  otherResearcherToken = generateResearcherToken(
    fixture.otherResearcherId,
    'agent-def-other@test.com',
    ResearcherRole.RESEARCHER,
    AccountStatus.ACTIVE
  );
});

afterAll(async () => {
  await cleanupTestFixtures(fixture);
  await prisma.$disconnect();
});

// ============================================================================
// Authentication Tests
// ============================================================================

describe('Authentication', () => {
  it('should reject unauthenticated requests to list', async () => {
    const res = await request(app)
      .get('/api/v1/agent-definitions');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('should reject unauthenticated requests to create', async () => {
    const res = await request(app)
      .post('/api/v1/agent-definitions')
      .send(validAgentDefinition);

    expect(res.status).toBe(401);
  });

  it('should reject unauthenticated requests to get by id', async () => {
    const res = await request(app)
      .get(`/api/v1/agent-definitions/${fixture.agentDefinitionId}`);

    expect(res.status).toBe(401);
  });

  it('should reject unauthenticated requests to update', async () => {
    const res = await request(app)
      .put(`/api/v1/agent-definitions/${fixture.agentDefinitionId}`)
      .send({ name: 'Updated' });

    expect(res.status).toBe(401);
  });

  it('should reject unauthenticated requests to delete', async () => {
    const res = await request(app)
      .delete(`/api/v1/agent-definitions/${fixture.agentDefinitionId}`);

    expect(res.status).toBe(401);
  });

  it('should reject invalid token', async () => {
    const res = await request(app)
      .get('/api/v1/agent-definitions')
      .set('Authorization', 'Bearer invalid-token');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });
});

// ============================================================================
// GET /agent-definitions - List Agent Definitions
// ============================================================================

describe('GET /api/v1/agent-definitions', () => {
  it('should list agent definitions owned by researcher', async () => {
    const res = await request(app)
      .get('/api/v1/agent-definitions')
      .set('Authorization', `Bearer ${researcherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);

    // Should include the researcher's own agent definition
    const ownAgent = res.body.data.find(
      (a: { id: string }) => a.id === fixture.agentDefinitionId
    );
    expect(ownAgent).toBeDefined();
  });

  it('should NOT include other researchers agent definitions by default', async () => {
    const res = await request(app)
      .get('/api/v1/agent-definitions')
      .set('Authorization', `Bearer ${researcherToken}`);

    expect(res.status).toBe(200);

    // Should NOT include the public agent from other researcher (without includePublic flag)
    const publicAgent = res.body.data.find(
      (a: { id: string }) => a.id === fixture.publicAgentDefinitionId
    );
    expect(publicAgent).toBeUndefined();
  });

  it('should include public agent definitions when includePublic=true', async () => {
    const res = await request(app)
      .get('/api/v1/agent-definitions')
      .query({ includePublic: 'true' })
      .set('Authorization', `Bearer ${researcherToken}`);

    expect(res.status).toBe(200);

    // Should include both own and public agent definitions
    const publicAgent = res.body.data.find(
      (a: { id: string }) => a.id === fixture.publicAgentDefinitionId
    );
    expect(publicAgent).toBeDefined();
    expect(publicAgent.isPublic).toBe(true);
  });

  it('should order by createdAt descending', async () => {
    const res = await request(app)
      .get('/api/v1/agent-definitions')
      .set('Authorization', `Bearer ${researcherToken}`);

    expect(res.status).toBe(200);

    // If multiple results, verify ordering
    if (res.body.data.length > 1) {
      for (let i = 0; i < res.body.data.length - 1; i++) {
        const current = new Date(res.body.data[i].createdAt);
        const next = new Date(res.body.data[i + 1].createdAt);
        expect(current.getTime()).toBeGreaterThanOrEqual(next.getTime());
      }
    }
  });
});

// ============================================================================
// POST /agent-definitions - Create Agent Definition
// ============================================================================

describe('POST /api/v1/agent-definitions', () => {
  let createdIds: string[] = [];

  afterEach(async () => {
    // Clean up created agent definitions
    if (createdIds.length > 0) {
      await prisma.agentDefinition.deleteMany({
        where: { id: { in: createdIds } }
      });
      createdIds = [];
    }
  });

  it('should create a new agent definition', async () => {
    const res = await request(app)
      .post('/api/v1/agent-definitions')
      .set('Authorization', `Bearer ${researcherToken}`)
      .send(validAgentDefinition);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe(validAgentDefinition.name);
    expect(res.body.data.role).toBe(validAgentDefinition.role);
    expect(res.body.data.systemPrompt).toBe(validAgentDefinition.systemPrompt);
    expect(res.body.data.researcherId).toBe(fixture.researcherId);

    createdIds.push(res.body.data.id);
  });

  it('should store JSON fields correctly', async () => {
    const res = await request(app)
      .post('/api/v1/agent-definitions')
      .set('Authorization', `Bearer ${researcherToken}`)
      .send(validAgentDefinition);

    expect(res.status).toBe(201);

    // Verify JSON fields are stored as strings
    const created = await prisma.agentDefinition.findUnique({
      where: { id: res.body.data.id }
    });

    expect(created).not.toBeNull();
    expect(JSON.parse(created!.llmConfig)).toEqual(validAgentDefinition.llmConfig);
    expect(JSON.parse(created!.enabledTools)).toEqual(validAgentDefinition.enabledTools);
    expect(JSON.parse(created!.tags)).toEqual(validAgentDefinition.tags);

    createdIds.push(res.body.data.id);
  });

  it('should require name field', async () => {
    const { name: _name, ...withoutName } = validAgentDefinition;

    const res = await request(app)
      .post('/api/v1/agent-definitions')
      .set('Authorization', `Bearer ${researcherToken}`)
      .send(withoutName);

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('should require role field', async () => {
    const { role: _role, ...withoutRole } = validAgentDefinition;

    const res = await request(app)
      .post('/api/v1/agent-definitions')
      .set('Authorization', `Bearer ${researcherToken}`)
      .send(withoutRole);

    expect(res.status).toBe(422);
  });

  it('should require systemPrompt field', async () => {
    const { systemPrompt: _systemPrompt, ...withoutPrompt } = validAgentDefinition;

    const res = await request(app)
      .post('/api/v1/agent-definitions')
      .set('Authorization', `Bearer ${researcherToken}`)
      .send(withoutPrompt);

    expect(res.status).toBe(422);
  });

  it('should validate toolUseMode enum', async () => {
    const res = await request(app)
      .post('/api/v1/agent-definitions')
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({
        ...validAgentDefinition,
        toolUseMode: 'INVALID_MODE'
      });

    expect(res.status).toBe(422);
  });

  it('should use default values for optional fields', async () => {
    const minimalAgent = {
      name: 'Test Minimal Agent',
      role: 'helper',
      systemPrompt: 'You are a helper.',
    };

    const res = await request(app)
      .post('/api/v1/agent-definitions')
      .set('Authorization', `Bearer ${researcherToken}`)
      .send(minimalAgent);

    expect(res.status).toBe(201);
    expect(res.body.data.toolUseMode).toBe('AGENTIC'); // default
    expect(res.body.data.isPublic).toBe(false); // default

    createdIds.push(res.body.data.id);
  });

  it('should validate name max length', async () => {
    const res = await request(app)
      .post('/api/v1/agent-definitions')
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({
        ...validAgentDefinition,
        name: 'a'.repeat(256) // exceeds 255 char limit
      });

    expect(res.status).toBe(422);
  });
});

// ============================================================================
// GET /agent-definitions/:id - Get Single Agent Definition
// ============================================================================

describe('GET /api/v1/agent-definitions/:id', () => {
  it('should return agent definition owned by researcher', async () => {
    const res = await request(app)
      .get(`/api/v1/agent-definitions/${fixture.agentDefinitionId}`)
      .set('Authorization', `Bearer ${researcherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(fixture.agentDefinitionId);
    expect(res.body.data.name).toBe('Test Existing Agent');
  });

  it('should return public agent definition from other researcher', async () => {
    const res = await request(app)
      .get(`/api/v1/agent-definitions/${fixture.publicAgentDefinitionId}`)
      .set('Authorization', `Bearer ${researcherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(fixture.publicAgentDefinitionId);
    expect(res.body.data.isPublic).toBe(true);
  });

  it('should return 404 for non-public agent from other researcher', async () => {
    // Other researcher trying to access primary researcher's private agent
    const res = await request(app)
      .get(`/api/v1/agent-definitions/${fixture.agentDefinitionId}`)
      .set('Authorization', `Bearer ${otherResearcherToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('should return 404 for non-existent agent definition', async () => {
    const res = await request(app)
      .get('/api/v1/agent-definitions/clnonexistent12345678901')
      .set('Authorization', `Bearer ${researcherToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

// ============================================================================
// PUT /agent-definitions/:id - Update Agent Definition
// ============================================================================

describe('PUT /api/v1/agent-definitions/:id', () => {
  let updateableAgentId: string;

  beforeEach(async () => {
    // Create an agent definition for update tests
    const agent = await prisma.agentDefinition.create({
      data: {
        researcherId: fixture.researcherId,
        name: 'Test Update Agent',
        description: 'Agent to update',
        role: 'narrator',
        systemPrompt: 'Original prompt',
        llmConfig: '{}',
        enabledTools: '[]',
        toolUseMode: 'AGENTIC',
        agenticConfig: '{}',
        isPublic: false,
        tags: '[]',
      },
    });
    updateableAgentId = agent.id;
  });

  afterEach(async () => {
    await prisma.agentDefinition.deleteMany({
      where: { id: updateableAgentId }
    });
  });

  it('should update agent definition', async () => {
    const res = await request(app)
      .put(`/api/v1/agent-definitions/${updateableAgentId}`)
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({
        name: 'Updated Agent Name',
        description: 'Updated description',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Updated Agent Name');
    expect(res.body.data.description).toBe('Updated description');
    // Other fields should remain unchanged
    expect(res.body.data.systemPrompt).toBe('Original prompt');
  });

  it('should update only provided fields (partial update)', async () => {
    const res = await request(app)
      .put(`/api/v1/agent-definitions/${updateableAgentId}`)
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({ isPublic: true });

    expect(res.status).toBe(200);
    expect(res.body.data.isPublic).toBe(true);
    expect(res.body.data.name).toBe('Test Update Agent'); // unchanged
  });

  it('should update JSON fields correctly', async () => {
    const newConfig = { model: 'claude-3-opus-20240229', temperature: 0.7 };

    const res = await request(app)
      .put(`/api/v1/agent-definitions/${updateableAgentId}`)
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({ llmConfig: newConfig });

    expect(res.status).toBe(200);

    const updated = await prisma.agentDefinition.findUnique({
      where: { id: updateableAgentId }
    });
    expect(JSON.parse(updated!.llmConfig)).toEqual(newConfig);
  });

  it('should return 404 for non-existent agent', async () => {
    const res = await request(app)
      .put('/api/v1/agent-definitions/clnonexistent12345678901')
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({ name: 'Updated' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('should return 403 when updating agent owned by another researcher', async () => {
    const res = await request(app)
      .put(`/api/v1/agent-definitions/${updateableAgentId}`)
      .set('Authorization', `Bearer ${otherResearcherToken}`)
      .send({ name: 'Hijacked Name' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('should NOT allow updating public agent from another researcher', async () => {
    const res = await request(app)
      .put(`/api/v1/agent-definitions/${fixture.publicAgentDefinitionId}`)
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({ name: 'Hijacked Public Agent' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('should validate toolUseMode on update', async () => {
    const res = await request(app)
      .put(`/api/v1/agent-definitions/${updateableAgentId}`)
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({ toolUseMode: 'INVALID' });

    expect(res.status).toBe(422);
  });
});

// ============================================================================
// DELETE /agent-definitions/:id - Delete Agent Definition
// ============================================================================

describe('DELETE /api/v1/agent-definitions/:id', () => {
  let deletableAgentId: string;

  beforeEach(async () => {
    // Create an agent definition for delete tests
    const agent = await prisma.agentDefinition.create({
      data: {
        researcherId: fixture.researcherId,
        name: 'Test Delete Agent',
        description: 'Agent to delete',
        role: 'narrator',
        systemPrompt: 'To be deleted',
        llmConfig: '{}',
        enabledTools: '[]',
        toolUseMode: 'AGENTIC',
        agenticConfig: '{}',
        isPublic: false,
        tags: '[]',
      },
    });
    deletableAgentId = agent.id;
  });

  afterEach(async () => {
    // Clean up in case deletion test failed
    await prisma.agentDefinition.deleteMany({
      where: { id: deletableAgentId }
    });
  });

  it('should delete agent definition', async () => {
    const res = await request(app)
      .delete(`/api/v1/agent-definitions/${deletableAgentId}`)
      .set('Authorization', `Bearer ${researcherToken}`);

    expect(res.status).toBe(204);

    // Verify deletion
    const deleted = await prisma.agentDefinition.findUnique({
      where: { id: deletableAgentId }
    });
    expect(deleted).toBeNull();
  });

  it('should return 404 for non-existent agent', async () => {
    const res = await request(app)
      .delete('/api/v1/agent-definitions/clnonexistent12345678901')
      .set('Authorization', `Bearer ${researcherToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('should return 403 when deleting agent owned by another researcher', async () => {
    const res = await request(app)
      .delete(`/api/v1/agent-definitions/${deletableAgentId}`)
      .set('Authorization', `Bearer ${otherResearcherToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');

    // Verify agent was not deleted
    const stillExists = await prisma.agentDefinition.findUnique({
      where: { id: deletableAgentId }
    });
    expect(stillExists).not.toBeNull();
  });

  it('should NOT allow deleting public agent from another researcher', async () => {
    const res = await request(app)
      .delete(`/api/v1/agent-definitions/${fixture.publicAgentDefinitionId}`)
      .set('Authorization', `Bearer ${researcherToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  let createdIds: string[] = [];

  afterEach(async () => {
    // Clean up any created agent definitions
    if (createdIds.length > 0) {
      await prisma.agentDefinition.deleteMany({
        where: { id: { in: createdIds } }
      });
      createdIds = [];
    }
  });

  it('should handle empty enabledTools array', async () => {
    const res = await request(app)
      .post('/api/v1/agent-definitions')
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({
        name: 'Test No Tools Agent',
        role: 'helper',
        systemPrompt: 'No tools available.',
        enabledTools: [],
      });

    expect(res.status).toBe(201);
    expect(JSON.parse(res.body.data.enabledTools)).toEqual([]);
    createdIds.push(res.body.data.id);
  });

  it('should handle complex agenticConfig', async () => {
    const complexConfig = {
      maxIterations: 100,
      thinkingBudget: 5000,
      allowedDomains: ['example.com'],
      safetySettings: { level: 'high', filters: ['violence', 'profanity'] }
    };

    const res = await request(app)
      .post('/api/v1/agent-definitions')
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({
        name: 'Test Complex Agent',
        role: 'specialist',
        systemPrompt: 'Complex configuration.',
        agenticConfig: complexConfig,
      });

    expect(res.status).toBe(201);
    createdIds.push(res.body.data.id);

    const created = await prisma.agentDefinition.findUnique({
      where: { id: res.body.data.id }
    });
    expect(JSON.parse(created!.agenticConfig)).toEqual(complexConfig);
  });

  it('should handle scriptedWorkflow configuration', async () => {
    const workflow = {
      steps: [
        { action: 'greet', params: { message: 'Hello!' } },
        { action: 'analyze', params: { depth: 3 } },
        { action: 'respond', params: {} }
      ]
    };

    const res = await request(app)
      .post('/api/v1/agent-definitions')
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({
        name: 'Test Scripted Agent',
        role: 'bot',
        systemPrompt: 'Follow the workflow.',
        toolUseMode: 'SCRIPTED',
        scriptedWorkflow: workflow,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.toolUseMode).toBe('SCRIPTED');
    createdIds.push(res.body.data.id);

    const created = await prisma.agentDefinition.findUnique({
      where: { id: res.body.data.id }
    });
    expect(JSON.parse(created!.scriptedWorkflow!)).toEqual(workflow);
  });

  it('should support HYBRID toolUseMode', async () => {
    const res = await request(app)
      .post('/api/v1/agent-definitions')
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({
        name: 'Test Hybrid Agent',
        role: 'assistant',
        systemPrompt: 'Hybrid mode.',
        toolUseMode: 'HYBRID',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.toolUseMode).toBe('HYBRID');
    createdIds.push(res.body.data.id);
  });

  it('should handle toolUseInstructions field', async () => {
    const instructions = 'Use tools sparingly and only when necessary.';

    const res = await request(app)
      .post('/api/v1/agent-definitions')
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({
        name: 'Test Instructions Agent',
        role: 'helper',
        systemPrompt: 'Has tool instructions.',
        toolUseInstructions: instructions,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.toolUseInstructions).toBe(instructions);
    createdIds.push(res.body.data.id);
  });
});
