/**
 * Tests for Model Configs API
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
    { researcherId, email: 'model-config-test@example.com' },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
}

describe('Model Configs API', () => {
  beforeEach(async () => {
    // Simple cleanup - just delete researchers with cascade (Prisma handles order)
    const researchers = await prisma.researcher.findMany({
      where: { email: { contains: 'model-config-test' } },
      select: { id: true }
    });

    for (const r of researchers) {
      await prisma.project.deleteMany({ where: { researcherId: r.id } });
      await prisma.researcher.delete({ where: { id: r.id } });
    }

    // Create test researcher
    const researcher = await prisma.researcher.create({
      data: {
        email: 'model-config-test@example.com',
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
      where: { email: { contains: 'model-config-test' } },
      select: { id: true }
    });

    for (const r of researchers) {
      await prisma.project.deleteMany({ where: { researcherId: r.id } });
      await prisma.researcher.delete({ where: { id: r.id } }).catch(() => {});
    }
  });

  // ============================================
  // CRUD TESTS
  // ============================================

  describe('POST /api/v1/model-configs', () => {
    it('should create a model config with core parameters', async () => {
      const response = await request(app)
        .post('/api/v1/model-configs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studyId: testStudyId,
          name: 'GPT-4 Creative',
          provider: 'openai',
          model: 'gpt-4-turbo',
          temperature: 0.9,
          maxTokens: 2048,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('GPT-4 Creative');
      expect(response.body.data.provider).toBe('openai');
      expect(response.body.data.model).toBe('gpt-4-turbo');
      expect(response.body.data.temperature).toBe(0.9);
      expect(response.body.data.maxTokens).toBe(2048);
    });

    it('should create a model config with extended parameters', async () => {
      const response = await request(app)
        .post('/api/v1/model-configs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studyId: testStudyId,
          name: 'Claude Precise',
          provider: 'anthropic',
          model: 'claude-3-opus-20240229',
          temperature: 0.3,
          maxTokens: 4096,
          topP: 0.9,
          topK: 40,
          presencePenalty: 0.5,
          frequencyPenalty: 0.5,
          stopSequences: ['END', 'STOP'],
          seed: 42,
          responseFormat: { type: 'json_object' },
          costPerInputToken: 0.015,
          costPerOutputToken: 0.075,
        });

      expect(response.status).toBe(201);
      expect(response.body.data.topP).toBe(0.9);
      expect(response.body.data.topK).toBe(40);
      expect(response.body.data.stopSequences).toEqual(['END', 'STOP']);
      expect(response.body.data.seed).toBe(42);
      expect(response.body.data.responseFormat).toEqual({ type: 'json_object' });
      expect(response.body.data.costPerInputToken).toBe(0.015);
    });

    it('should reject unauthenticated request', async () => {
      const response = await request(app)
        .post('/api/v1/model-configs')
        .send({
          studyId: testStudyId,
          name: 'Test',
          provider: 'openai',
          model: 'gpt-4',
        });

      expect(response.status).toBe(401);
    });

    it('should reject invalid study ID', async () => {
      const response = await request(app)
        .post('/api/v1/model-configs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studyId: 'non-existent-id',
          name: 'Test',
          provider: 'openai',
          model: 'gpt-4',
        });

      expect(response.status).toBe(404);
    });

    it('should reject duplicate name in same study', async () => {
      // Create first config
      await request(app)
        .post('/api/v1/model-configs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studyId: testStudyId,
          name: 'Duplicate Name',
          provider: 'openai',
          model: 'gpt-4',
        });

      // Try to create with same name
      const response = await request(app)
        .post('/api/v1/model-configs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studyId: testStudyId,
          name: 'Duplicate Name',
          provider: 'anthropic',
          model: 'claude-3',
        });

      expect(response.status).toBe(409);
    });

    it('should validate temperature range', async () => {
      const response = await request(app)
        .post('/api/v1/model-configs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studyId: testStudyId,
          name: 'Invalid Temp',
          provider: 'openai',
          model: 'gpt-4',
          temperature: 3.0, // Invalid: max is 2
        });

      expect(response.status).toBe(422);
    });

    it('should validate provider enum', async () => {
      const response = await request(app)
        .post('/api/v1/model-configs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studyId: testStudyId,
          name: 'Invalid Provider',
          provider: 'invalid-provider',
          model: 'some-model',
        });

      expect(response.status).toBe(422);
    });
  });

  describe('GET /api/v1/model-configs', () => {
    beforeEach(async () => {
      // Create some test configs
      await request(app)
        .post('/api/v1/model-configs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studyId: testStudyId,
          name: 'Config 1',
          provider: 'openai',
          model: 'gpt-4',
        });

      await request(app)
        .post('/api/v1/model-configs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studyId: testStudyId,
          name: 'Config 2',
          provider: 'anthropic',
          model: 'claude-3',
        });
    });

    it('should list all configs', async () => {
      const response = await request(app)
        .get('/api/v1/model-configs')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination).toBeDefined();
    });

    it('should filter by studyId', async () => {
      const response = await request(app)
        .get(`/api/v1/model-configs?studyId=${testStudyId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
    });

    it('should filter by provider', async () => {
      const response = await request(app)
        .get('/api/v1/model-configs?provider=openai')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].provider).toBe('openai');
    });

    it('should paginate results', async () => {
      const response = await request(app)
        .get('/api/v1/model-configs?page=1&pageSize=1')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.pagination.total).toBe(2);
      expect(response.body.pagination.totalPages).toBe(2);
    });
  });

  describe('GET /api/v1/model-configs/:id', () => {
    it('should get a specific config', async () => {
      const createResponse = await request(app)
        .post('/api/v1/model-configs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studyId: testStudyId,
          name: 'Get Test',
          provider: 'openai',
          model: 'gpt-4',
          temperature: 0.8,
        });

      const configId = createResponse.body.data.id;

      const response = await request(app)
        .get(`/api/v1/model-configs/${configId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.name).toBe('Get Test');
      expect(response.body.data.temperature).toBe(0.8);
    });

    it('should return 404 for non-existent config', async () => {
      const response = await request(app)
        .get('/api/v1/model-configs/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /api/v1/model-configs/:id', () => {
    it('should update config parameters', async () => {
      const createResponse = await request(app)
        .post('/api/v1/model-configs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studyId: testStudyId,
          name: 'Update Test',
          provider: 'openai',
          model: 'gpt-4',
          temperature: 0.7,
        });

      const configId = createResponse.body.data.id;

      const response = await request(app)
        .patch(`/api/v1/model-configs/${configId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          temperature: 0.9,
          maxTokens: 8192,
          topP: 0.95,
        });

      expect(response.status).toBe(200);
      expect(response.body.data.temperature).toBe(0.9);
      expect(response.body.data.maxTokens).toBe(8192);
      expect(response.body.data.topP).toBe(0.95);
    });

    it('should update config name', async () => {
      const createResponse = await request(app)
        .post('/api/v1/model-configs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studyId: testStudyId,
          name: 'Original Name',
          provider: 'openai',
          model: 'gpt-4',
        });

      const configId = createResponse.body.data.id;

      const response = await request(app)
        .patch(`/api/v1/model-configs/${configId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Updated Name',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.name).toBe('Updated Name');
    });

    it('should reject duplicate name on update', async () => {
      // Create two configs
      await request(app)
        .post('/api/v1/model-configs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studyId: testStudyId,
          name: 'Existing Name',
          provider: 'openai',
          model: 'gpt-4',
        });

      const createResponse = await request(app)
        .post('/api/v1/model-configs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studyId: testStudyId,
          name: 'To Update',
          provider: 'anthropic',
          model: 'claude-3',
        });

      // Try to update to existing name
      const response = await request(app)
        .patch(`/api/v1/model-configs/${createResponse.body.data.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Existing Name',
        });

      expect(response.status).toBe(409);
    });
  });

  describe('DELETE /api/v1/model-configs/:id', () => {
    it('should delete a config', async () => {
      const createResponse = await request(app)
        .post('/api/v1/model-configs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studyId: testStudyId,
          name: 'To Delete',
          provider: 'openai',
          model: 'gpt-4',
        });

      const configId = createResponse.body.data.id;

      const deleteResponse = await request(app)
        .delete(`/api/v1/model-configs/${configId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(deleteResponse.status).toBe(204);

      // Verify deleted
      const getResponse = await request(app)
        .get(`/api/v1/model-configs/${configId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(getResponse.status).toBe(404);
    });

    it('should not delete config used by variants', async () => {
      // Create config
      const configResponse = await request(app)
        .post('/api/v1/model-configs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studyId: testStudyId,
          name: 'Used Config',
          provider: 'openai',
          model: 'gpt-4',
        });

      // Create template and variant using this config
      const templateResponse = await request(app)
        .post('/api/v1/prompts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studyId: testStudyId,
          name: 'Template',
          systemPrompt: 'System',
          userPromptTemplate: 'User',
        });

      await request(app)
        .post(`/api/v1/prompts/${templateResponse.body.data.id}/variants`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          versionId: templateResponse.body.data.currentVersion.id,
          modelConfigId: configResponse.body.data.id,
        });

      // Try to delete config
      const deleteResponse = await request(app)
        .delete(`/api/v1/model-configs/${configResponse.body.data.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(deleteResponse.status).toBe(400);
      expect(deleteResponse.body.error.message).toContain('variant');
    });
  });

  // ============================================
  // PRESETS TESTS
  // ============================================

  describe('GET /api/v1/model-configs/presets', () => {
    it('should return common model presets', async () => {
      const response = await request(app)
        .get('/api/v1/model-configs/presets')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThan(0);

      // Check preset structure
      const preset = response.body.data[0];
      expect(preset).toHaveProperty('name');
      expect(preset).toHaveProperty('provider');
      expect(preset).toHaveProperty('model');
      expect(preset).toHaveProperty('temperature');
    });
  });

  // ============================================
  // AUTHORIZATION TESTS
  // ============================================

  describe('Authorization', () => {
    it('should deny access to other researcher configs', async () => {
      // Create another researcher
      const otherResearcher = await prisma.researcher.create({
        data: {
          email: 'other-model-config-test@example.com',
          passwordHash: 'hashed',
          name: 'Other Researcher',
        },
      });

      const otherToken = createAuthToken(otherResearcher.id);

      // Create config with first researcher
      const createResponse = await request(app)
        .post('/api/v1/model-configs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studyId: testStudyId,
          name: 'Private Config',
          provider: 'openai',
          model: 'gpt-4',
        });

      const configId = createResponse.body.data.id;

      // Try to access with other researcher
      const response = await request(app)
        .get(`/api/v1/model-configs/${configId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(response.status).toBe(403);

      // Clean up
      await prisma.researcher.delete({ where: { id: otherResearcher.id } });
    });
  });
});
