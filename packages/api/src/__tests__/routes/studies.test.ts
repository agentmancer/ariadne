/**
 * Test suite for Studies API endpoints and input validation
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../../app';
import { prisma } from '../../lib/prisma';
import { s3KeySchema, sanitizeS3Key, participantIdSchema } from '../../services/validation/sanitizers';

// Test data
const testStudy = {
  name: 'Test Study',
  description: 'A test study for unit testing',
  type: 'SINGLE_PARTICIPANT',
  status: 'DRAFT',
  config: {
    workflow: {
      rounds: 1,
      tasksPerRound: 1,
      timePerTask: 30,
    },
  },
};

/**
 * Studies API Integration Tests
 *
 * NOTE: These tests are currently skipped because they require:
 * 1. Full authentication middleware setup
 * 2. JWT token generation for Bearer auth
 * 3. Proper database seeding with foreign key relations (projectId)
 *
 * TODO: Implement proper test fixtures and auth mocking
 */
describe.skip('Studies API', () => {
  let app: Express;
  let testResearcherId: string;
  let testProjectId: string;

  beforeAll(async () => {
    // Create app without rate limiting for tests
    app = createApp({
      enableRateLimiting: false,
      enableRequestLogging: false,
      enableSwagger: false,
    });

    // Create test researcher and project
    const researcher = await prisma.researcher.upsert({
      where: { email: 'studies-test@test.com' },
      update: {},
      create: {
        email: 'studies-test@test.com',
        passwordHash: 'hash',
        name: 'Test Researcher',
        role: 'RESEARCHER',
        status: 'ACTIVE',
        settings: {},
      },
    });
    testResearcherId = researcher.id;

    const project = await prisma.project.create({
      data: {
        name: 'Studies Test Project',
        researcherId: testResearcherId,
      },
    });
    testProjectId = project.id;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.study.deleteMany({ where: { projectId: testProjectId } });
    await prisma.project.deleteMany({ where: { id: testProjectId } });
    await prisma.researcher.deleteMany({ where: { email: 'studies-test@test.com' } });
  });

  beforeEach(async () => {
    // Clean studies before each test
    await prisma.study.deleteMany({ where: { projectId: testProjectId } });
  });

  describe('POST /api/v1/studies', () => {
    it('should create a new study with valid data', async () => {
      const response = await request(app)
        .post('/api/v1/studies')
        .set('Authorization', 'Bearer test-token')
        .send({ ...testStudy, projectId: testProjectId });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        name: testStudy.name,
        description: testStudy.description,
        type: testStudy.type,
        status: testStudy.status,
      });
    });

    it('should reject invalid study data', async () => {
      const invalidStudy = {
        // Missing required fields
        description: 'Invalid study',
      };

      const response = await request(app)
        .post('/api/v1/studies')
        .set('Authorization', 'Bearer test-token')
        .send(invalidStudy);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject unauthorized requests', async () => {
      const response = await request(app)
        .post('/api/v1/studies')
        .send(testStudy);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/studies', () => {
    beforeEach(async () => {
      // Create test studies
      await prisma.study.createMany({
        data: [
          { ...testStudy, projectId: testProjectId, name: 'Study 1' },
          { ...testStudy, projectId: testProjectId, name: 'Study 2' },
          { ...testStudy, projectId: testProjectId, name: 'Study 3' },
        ],
      });
    });

    it('should list studies with pagination', async () => {
      const response = await request(app)
        .get('/api/v1/studies?page=1&limit=2')
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.items).toHaveLength(2);
      expect(response.body.data.total).toBe(3);
      expect(response.body.data.hasNext).toBe(true);
    });

    it('should filter studies by status', async () => {
      await prisma.study.create({
        data: {
          ...testStudy,
          projectId: testProjectId,
          name: 'Active Study',
          status: 'ACTIVE',
        },
      });

      const response = await request(app)
        .get('/api/v1/studies?status=ACTIVE')
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(200);
      expect(response.body.data.items).toHaveLength(1);
      expect(response.body.data.items[0].status).toBe('ACTIVE');
    });
  });

  describe('GET /api/v1/studies/:id', () => {
    let studyId: string;

    beforeEach(async () => {
      const study = await prisma.study.create({
        data: {
          ...testStudy,
          projectId: testProjectId,
        },
      });
      studyId = study.id;
    });

    it('should retrieve a specific study', async () => {
      const response = await request(app)
        .get(`/api/v1/studies/${studyId}`)
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(studyId);
    });

    it('should return 404 for non-existent study', async () => {
      const response = await request(app)
        .get('/api/v1/studies/non-existent-id')
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/v1/studies/:id', () => {
    let studyId: string;

    beforeEach(async () => {
      const study = await prisma.study.create({
        data: {
          ...testStudy,
          projectId: testProjectId,
        },
      });
      studyId = study.id;
    });

    it('should update study details', async () => {
      const updates = {
        name: 'Updated Study Name',
        description: 'Updated description',
      };

      const response = await request(app)
        .put(`/api/v1/studies/${studyId}`)
        .set('Authorization', 'Bearer test-token')
        .send(updates);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(updates.name);
      expect(response.body.data.description).toBe(updates.description);
    });

    it('should prevent updating study in COMPLETED status', async () => {
      await prisma.study.update({
        where: { id: studyId },
        data: { status: 'COMPLETED' },
      });

      const response = await request(app)
        .put(`/api/v1/studies/${studyId}`)
        .set('Authorization', 'Bearer test-token')
        .send({ name: 'New Name' });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('completed');
    });
  });

  describe('DELETE /api/v1/studies/:id', () => {
    let studyId: string;

    beforeEach(async () => {
      const study = await prisma.study.create({
        data: {
          ...testStudy,
          projectId: testProjectId,
        },
      });
      studyId = study.id;
    });

    it('should delete a study without participants', async () => {
      const response = await request(app)
        .delete(`/api/v1/studies/${studyId}`)
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify deletion
      const study = await prisma.study.findUnique({
        where: { id: studyId },
      });
      expect(study).toBeNull();
    });

    it('should prevent deletion with active participants', async () => {
      // Create an active participant
      await prisma.participant.create({
        data: {
          studyId,
          uniqueId: 'test-participant',
          state: 'ACTIVE',
        },
      });

      const response = await request(app)
        .delete(`/api/v1/studies/${studyId}`)
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('active participants');
    });
  });
});

/**
 * Input Validation Unit Tests
 * These test validation schemas directly without needing API infrastructure
 */
describe('Input Validation', () => {
  describe('S3 Key Validation', () => {

    it('should accept valid S3 keys', () => {
      const validKeys = [
        'studies/123/data.json',
        'participants/test-1/results.csv',
        'exports/2024-01-01/batch.zip',
      ];

      validKeys.forEach(key => {
        expect(() => s3KeySchema.parse(key)).not.toThrow();
      });
    });

    it('should reject invalid S3 keys', () => {
      const invalidKeys = [
        '../../../etc/passwd', // Path traversal
        '/absolute/path', // Absolute path
        'key with spaces', // Invalid characters
        '', // Empty
      ];

      invalidKeys.forEach(key => {
        expect(() => s3KeySchema.parse(key)).toThrow();
      });
    });

    it('should sanitize S3 keys properly', () => {
      const key = 'studies/123/test file.txt';
      const sanitized = sanitizeS3Key(key);
      expect(sanitized).toBe('studies/123/test_file.txt');
      expect(sanitized).not.toContain(' ');
    });
  });

  describe('Participant ID Validation', () => {

    it('should accept valid participant IDs', () => {
      const validIds = [
        'participant-001',
        'test_user_123',
        'SYNTHETIC-ACTOR-1',
      ];

      validIds.forEach(id => {
        expect(() => participantIdSchema.parse(id)).not.toThrow();
      });
    });

    it('should reject invalid participant IDs', () => {
      const invalidIds = [
        'participant@123', // Special characters
        'id with spaces',
        '../../etc/passwd', // Path traversal attempt
        '', // Empty
      ];

      invalidIds.forEach(id => {
        expect(() => participantIdSchema.parse(id)).toThrow();
      });
    });
  });
});
