/**
 * Tests for Prompt Version Control API
 * RFC 003 Phase 2: Prompt Version Control
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app';
import { prisma } from '../../lib/prisma';
import jwt from 'jsonwebtoken';

const app = createApp();

// Test data
let testResearcherId: string;
let testProjectId: string;
let testStudyId: string;
let authToken: string;

// Helper to create auth token
function createAuthToken(researcherId: string): string {
  return jwt.sign(
    { researcherId, email: 'prompt-test@example.com' },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
}

describe('Prompt Version Control API', () => {
  beforeEach(async () => {
    // Simple cleanup - just delete researchers with cascade (Prisma handles order)
    const researchers = await prisma.researcher.findMany({
      where: { email: { contains: 'prompt-test' } },
      select: { id: true }
    });

    for (const r of researchers) {
      // Delete projects first (cascades to studies, templates, etc.)
      await prisma.project.deleteMany({ where: { researcherId: r.id } });
      await prisma.researcher.delete({ where: { id: r.id } });
    }

    // Create test researcher
    const researcher = await prisma.researcher.create({
      data: {
        email: 'prompt-test@example.com',
        passwordHash: 'hashed',
        name: 'Test Researcher',
      },
    });
    testResearcherId = researcher.id;
    authToken = createAuthToken(testResearcherId);

    // Create test project
    const project = await prisma.project.create({
      data: {
        name: 'Test Project',
        researcherId: testResearcherId,
      },
    });
    testProjectId = project.id;

    // Create test study
    const study = await prisma.study.create({
      data: {
        name: 'Test Study',
        projectId: testProjectId,
      },
    });
    testStudyId = study.id;
  });

  afterEach(async () => {
    // Simple cleanup - just delete researchers with cascade (Prisma handles order)
    const researchers = await prisma.researcher.findMany({
      where: { email: { contains: 'prompt-test' } },
      select: { id: true }
    });

    for (const r of researchers) {
      await prisma.project.deleteMany({ where: { researcherId: r.id } });
      await prisma.researcher.delete({ where: { id: r.id } }).catch(() => {});
    }
  });

  // ============================================
  // TEMPLATE CRUD TESTS
  // ============================================

  describe('POST /api/v1/prompts', () => {
    it('should create a prompt template with initial version', async () => {
      const response = await request(app)
        .post('/api/v1/prompts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studyId: testStudyId,
          name: 'Story Generator',
          description: 'Generates interactive stories',
          systemPrompt: 'You are a creative story writer.',
          userPromptTemplate: 'Write a story about {{topic}}.',
          templateVariables: [
            { name: 'topic', type: 'string', required: true },
          ],
          message: 'Initial version',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Story Generator');
      expect(response.body.data.currentVersion).toBeDefined();
      expect(response.body.data.currentVersion.version).toBe(1);
      expect(response.body.data.currentVersion.systemPrompt).toBe('You are a creative story writer.');
    });

    it('should reject unauthenticated request', async () => {
      const response = await request(app)
        .post('/api/v1/prompts')
        .send({
          studyId: testStudyId,
          name: 'Test',
          systemPrompt: 'Test',
          userPromptTemplate: 'Test',
        });

      expect(response.status).toBe(401);
    });

    it('should reject invalid study ID', async () => {
      const response = await request(app)
        .post('/api/v1/prompts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studyId: 'non-existent-id',
          name: 'Test',
          systemPrompt: 'Test',
          userPromptTemplate: 'Test',
        });

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/v1/prompts', () => {
    it('should list prompt templates', async () => {
      // Create a template first
      await request(app)
        .post('/api/v1/prompts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studyId: testStudyId,
          name: 'Test Template',
          systemPrompt: 'System',
          userPromptTemplate: 'User',
        });

      const response = await request(app)
        .get('/api/v1/prompts')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.pagination).toBeDefined();
    });

    it('should filter by studyId', async () => {
      await request(app)
        .post('/api/v1/prompts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studyId: testStudyId,
          name: 'Test Template',
          systemPrompt: 'System',
          userPromptTemplate: 'User',
        });

      const response = await request(app)
        .get(`/api/v1/prompts?studyId=${testStudyId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
    });
  });

  describe('GET /api/v1/prompts/:id', () => {
    it('should get template with current version', async () => {
      const createResponse = await request(app)
        .post('/api/v1/prompts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studyId: testStudyId,
          name: 'Test Template',
          systemPrompt: 'System prompt here',
          userPromptTemplate: 'User {{input}}',
        });

      const templateId = createResponse.body.data.id;

      const response = await request(app)
        .get(`/api/v1/prompts/${templateId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.name).toBe('Test Template');
      expect(response.body.data.currentVersion).toBeDefined();
      expect(response.body.data.branches).toBeDefined();
    });

    it('should return 404 for non-existent template', async () => {
      const response = await request(app)
        .get('/api/v1/prompts/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/prompts/:id', () => {
    it('should delete template and all versions', async () => {
      const createResponse = await request(app)
        .post('/api/v1/prompts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studyId: testStudyId,
          name: 'To Delete',
          systemPrompt: 'System',
          userPromptTemplate: 'User',
        });

      const templateId = createResponse.body.data.id;

      const deleteResponse = await request(app)
        .delete(`/api/v1/prompts/${templateId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(deleteResponse.status).toBe(204);

      // Verify deleted
      const getResponse = await request(app)
        .get(`/api/v1/prompts/${templateId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(getResponse.status).toBe(404);
    });
  });

  // ============================================
  // VERSION TESTS
  // ============================================

  describe('POST /api/v1/prompts/:id/versions', () => {
    it('should create a new version', async () => {
      const createResponse = await request(app)
        .post('/api/v1/prompts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studyId: testStudyId,
          name: 'Versioned Template',
          systemPrompt: 'Version 1',
          userPromptTemplate: 'User v1',
        });

      const templateId = createResponse.body.data.id;

      const versionResponse = await request(app)
        .post(`/api/v1/prompts/${templateId}/versions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          systemPrompt: 'Version 2',
          userPromptTemplate: 'User v2',
          message: 'Updated system prompt',
        });

      expect(versionResponse.status).toBe(201);
      expect(versionResponse.body.data.version).toBe(2);
      expect(versionResponse.body.data.systemPrompt).toBe('Version 2');
    });

    it('should reject duplicate content', async () => {
      const createResponse = await request(app)
        .post('/api/v1/prompts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studyId: testStudyId,
          name: 'Duplicate Test',
          systemPrompt: 'Same content',
          userPromptTemplate: 'Same user',
        });

      const templateId = createResponse.body.data.id;

      const duplicateResponse = await request(app)
        .post(`/api/v1/prompts/${templateId}/versions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          systemPrompt: 'Same content',
          userPromptTemplate: 'Same user',
        });

      expect(duplicateResponse.status).toBe(409);
    });
  });

  describe('GET /api/v1/prompts/:id/versions', () => {
    it('should list all versions', async () => {
      const createResponse = await request(app)
        .post('/api/v1/prompts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studyId: testStudyId,
          name: 'Multi Version',
          systemPrompt: 'V1',
          userPromptTemplate: 'User',
        });

      const templateId = createResponse.body.data.id;

      // Create second version
      await request(app)
        .post(`/api/v1/prompts/${templateId}/versions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          systemPrompt: 'V2',
          userPromptTemplate: 'User v2',
        });

      const response = await request(app)
        .get(`/api/v1/prompts/${templateId}/versions`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
    });
  });

  describe('GET /api/v1/prompts/:id/diff', () => {
    it('should compare two versions', async () => {
      const createResponse = await request(app)
        .post('/api/v1/prompts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studyId: testStudyId,
          name: 'Diff Test',
          systemPrompt: 'Original system prompt',
          userPromptTemplate: 'Original user template',
        });

      const templateId = createResponse.body.data.id;

      // Create second version with changes
      await request(app)
        .post(`/api/v1/prompts/${templateId}/versions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          systemPrompt: 'Modified system prompt',
          userPromptTemplate: 'Original user template',
        });

      const response = await request(app)
        .get(`/api/v1/prompts/${templateId}/diff?from=1&to=2`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.hasChanges).toBe(true);
      expect(response.body.data.changes.systemPrompt).toBeDefined();
      expect(response.body.data.changes.systemPrompt.type).toBe('modified');
    });

    it('should require both version numbers', async () => {
      const createResponse = await request(app)
        .post('/api/v1/prompts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studyId: testStudyId,
          name: 'Diff Test 2',
          systemPrompt: 'System',
          userPromptTemplate: 'User',
        });

      const response = await request(app)
        .get(`/api/v1/prompts/${createResponse.body.data.id}/diff?from=1`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
    });
  });

  // ============================================
  // BRANCH TESTS
  // ============================================

  describe('POST /api/v1/prompts/:id/branches', () => {
    it('should create a new branch', async () => {
      const createResponse = await request(app)
        .post('/api/v1/prompts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studyId: testStudyId,
          name: 'Branch Test',
          systemPrompt: 'System',
          userPromptTemplate: 'User',
        });

      const templateId = createResponse.body.data.id;

      const branchResponse = await request(app)
        .post(`/api/v1/prompts/${templateId}/branches`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'experiment',
        });

      expect(branchResponse.status).toBe(201);
      expect(branchResponse.body.data.name).toBe('experiment');
    });

    it('should reject duplicate branch name', async () => {
      const createResponse = await request(app)
        .post('/api/v1/prompts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studyId: testStudyId,
          name: 'Branch Dup Test',
          systemPrompt: 'System',
          userPromptTemplate: 'User',
        });

      const templateId = createResponse.body.data.id;

      // Try to create main branch (already exists)
      const branchResponse = await request(app)
        .post(`/api/v1/prompts/${templateId}/branches`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'main',
        });

      expect(branchResponse.status).toBe(409);
    });
  });

  describe('DELETE /api/v1/prompts/:id/branches/:name', () => {
    it('should delete a branch', async () => {
      const createResponse = await request(app)
        .post('/api/v1/prompts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studyId: testStudyId,
          name: 'Delete Branch Test',
          systemPrompt: 'System',
          userPromptTemplate: 'User',
        });

      const templateId = createResponse.body.data.id;

      // Create branch
      await request(app)
        .post(`/api/v1/prompts/${templateId}/branches`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'to-delete',
        });

      // Delete branch
      const deleteResponse = await request(app)
        .delete(`/api/v1/prompts/${templateId}/branches/to-delete`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(deleteResponse.status).toBe(204);
    });

    it('should not allow deleting default branch', async () => {
      const createResponse = await request(app)
        .post('/api/v1/prompts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studyId: testStudyId,
          name: 'Default Branch Test',
          systemPrompt: 'System',
          userPromptTemplate: 'User',
        });

      const templateId = createResponse.body.data.id;

      const deleteResponse = await request(app)
        .delete(`/api/v1/prompts/${templateId}/branches/main`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(deleteResponse.status).toBe(400);
    });
  });

  // ============================================
  // VARIANT TESTS
  // ============================================

  describe('Prompt Variants', () => {
    let templateId: string;
    let versionId: string;
    let modelConfigId: string;

    beforeEach(async () => {
      // Create template
      const templateResponse = await request(app)
        .post('/api/v1/prompts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studyId: testStudyId,
          name: 'Variant Test Template',
          systemPrompt: 'Base system prompt',
          userPromptTemplate: 'Base user template',
        });

      templateId = templateResponse.body.data.id;
      versionId = templateResponse.body.data.currentVersion.id;

      // Create model config
      const configResponse = await request(app)
        .post('/api/v1/model-configs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studyId: testStudyId,
          name: 'GPT-4 Test',
          provider: 'openai',
          model: 'gpt-4',
        });

      modelConfigId = configResponse.body.data.id;
    });

    it('should create a variant', async () => {
      const response = await request(app)
        .post(`/api/v1/prompts/${templateId}/variants`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          versionId,
          modelConfigId,
          systemPromptOverride: 'GPT-4 specific system prompt',
          notes: 'Optimized for GPT-4',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.systemPromptOverride).toBe('GPT-4 specific system prompt');
    });

    it('should list variants', async () => {
      // Create a variant first
      await request(app)
        .post(`/api/v1/prompts/${templateId}/variants`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          versionId,
          modelConfigId,
        });

      const response = await request(app)
        .get(`/api/v1/prompts/${templateId}/variants`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
    });

    it('should reject duplicate variant', async () => {
      // Create first variant
      await request(app)
        .post(`/api/v1/prompts/${templateId}/variants`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          versionId,
          modelConfigId,
        });

      // Try to create duplicate
      const response = await request(app)
        .post(`/api/v1/prompts/${templateId}/variants`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          versionId,
          modelConfigId,
        });

      expect(response.status).toBe(409);
    });
  });

  // ============================================
  // FEW-SHOT EXAMPLES TESTS
  // ============================================

  describe('Few-Shot Examples', () => {
    it('should create template with few-shot examples', async () => {
      const response = await request(app)
        .post('/api/v1/prompts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studyId: testStudyId,
          name: 'Few-Shot Template',
          systemPrompt: 'You are a helpful assistant.',
          userPromptTemplate: 'Translate: {{text}}',
          fewShotExamples: [
            { input: 'Hello', output: 'Hola' },
            { input: 'Goodbye', output: 'Adiós' },
          ],
        });

      expect(response.status).toBe(201);

      // Get the version to verify
      const versionResponse = await request(app)
        .get(`/api/v1/prompts/${response.body.data.id}/versions/${response.body.data.currentVersion.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(versionResponse.body.data.fewShotExamples).toHaveLength(2);
    });
  });

  // ============================================
  // OUTPUT SCHEMA TESTS
  // ============================================

  describe('Output Schema', () => {
    it('should create template with output schema', async () => {
      const response = await request(app)
        .post('/api/v1/prompts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studyId: testStudyId,
          name: 'Structured Output',
          systemPrompt: 'You extract entities.',
          userPromptTemplate: 'Extract from: {{text}}',
          outputSchema: {
            type: 'object',
            properties: {
              entities: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            required: ['entities'],
          },
        });

      expect(response.status).toBe(201);

      // Get the version to verify
      const versionResponse = await request(app)
        .get(`/api/v1/prompts/${response.body.data.id}/versions/${response.body.data.currentVersion.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(versionResponse.body.data.outputSchema).toBeDefined();
      expect(versionResponse.body.data.outputSchema.type).toBe('object');
    });
  });

  // ============================================
  // AUTHORIZATION TESTS
  // ============================================

  describe('Authorization', () => {
    it('should deny access to other researcher templates', async () => {
      // Create another researcher
      const otherResearcher = await prisma.researcher.create({
        data: {
          email: 'other-prompt-test@example.com',
          passwordHash: 'hashed',
          name: 'Other Researcher',
        },
      });

      const otherToken = createAuthToken(otherResearcher.id);

      // Create template with first researcher
      const createResponse = await request(app)
        .post('/api/v1/prompts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studyId: testStudyId,
          name: 'Private Template',
          systemPrompt: 'System',
          userPromptTemplate: 'User',
        });

      const templateId = createResponse.body.data.id;

      // Try to access with other researcher
      const response = await request(app)
        .get(`/api/v1/prompts/${templateId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(response.status).toBe(403);

      // Clean up
      await prisma.researcher.delete({ where: { id: otherResearcher.id } });
    });
  });
});
