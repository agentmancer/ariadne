/**
 * Test suite for Participants API endpoints and database transactions
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../../app';
import { prisma } from '../../lib/prisma';
import {
  createStudyWithRelations,
  updateParticipantWithEvent,
} from '../../services/database/transactions';

// Test data
const testParticipant = {
  uniqueId: 'test-participant-001',
  state: 'ENROLLED',
  metadata: {
    source: 'manual',
    enrolled_at: new Date().toISOString(),
  },
};

/**
 * Participants API Integration Tests
 *
 * NOTE: These tests are currently skipped because they require:
 * 1. Full authentication middleware setup
 * 2. JWT token generation for Bearer auth
 * 3. Proper database seeding with foreign key relations (projectId)
 *
 * TODO: Implement proper test fixtures and auth mocking
 */
describe.skip('Participants API', () => {
  let app: Express;
  let testResearcherId: string;
  let testProjectId: string;
  let testStudyId: string;

  beforeAll(async () => {
    // Create app without rate limiting for tests
    app = createApp({
      enableRateLimiting: false,
      enableRequestLogging: false,
      enableSwagger: false,
    });

    // Create test researcher
    const researcher = await prisma.researcher.upsert({
      where: { email: 'participants-test@test.com' },
      update: {},
      create: {
        email: 'participants-test@test.com',
        passwordHash: 'hash',
        name: 'Test Researcher',
        role: 'RESEARCHER',
        status: 'ACTIVE',
        settings: {},
      },
    });
    testResearcherId = researcher.id;

    // Create test project
    const project = await prisma.project.create({
      data: {
        name: 'Participants Test Project',
        researcherId: testResearcherId,
      },
    });
    testProjectId = project.id;

    // Create test study
    const study = await prisma.study.create({
      data: {
        name: 'Test Study',
        description: 'Test study for participant tests',
        type: 'SINGLE_PARTICIPANT',
        status: 'ACTIVE',
        projectId: testProjectId,
      },
    });
    testStudyId = study.id;
  });

  afterAll(async () => {
    // Cleanup in correct order
    await prisma.event.deleteMany({ where: { participant: { studyId: testStudyId } } });
    await prisma.participant.deleteMany({ where: { studyId: testStudyId } });
    await prisma.study.deleteMany({ where: { projectId: testProjectId } });
    await prisma.project.deleteMany({ where: { id: testProjectId } });
    await prisma.researcher.deleteMany({ where: { email: 'participants-test@test.com' } });
  });

  beforeEach(async () => {
    await prisma.event.deleteMany({ where: { participant: { studyId: testStudyId } } });
    await prisma.participant.deleteMany({ where: { studyId: testStudyId } });
  });

  describe('POST /api/v1/participants', () => {
    it('should create a new participant', async () => {
      const response = await request(app)
        .post('/api/v1/participants')
        .set('Authorization', 'Bearer test-token')
        .send({ ...testParticipant, studyId: testStudyId });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        uniqueId: testParticipant.uniqueId,
        studyId: testStudyId,
        state: testParticipant.state,
      });
    });

    it('should reject duplicate participant IDs', async () => {
      // Create first participant
      await prisma.participant.create({
        data: { ...testParticipant, studyId: testStudyId },
      });

      // Try to create duplicate
      const response = await request(app)
        .post('/api/v1/participants')
        .set('Authorization', 'Bearer test-token')
        .send({ ...testParticipant, studyId: testStudyId });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('already exists');
    });

    it('should validate participant ID format', async () => {
      const invalidParticipant = {
        ...testParticipant,
        uniqueId: 'invalid@id#123', // Invalid characters
        studyId: testStudyId,
      };

      const response = await request(app)
        .post('/api/v1/participants')
        .set('Authorization', 'Bearer test-token')
        .send(invalidParticipant);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/participants/:id', () => {
    let participantId: string;

    beforeEach(async () => {
      const participant = await prisma.participant.create({
        data: { ...testParticipant, studyId: testStudyId },
      });
      participantId = participant.id;
    });

    it('should retrieve participant details', async () => {
      const response = await request(app)
        .get(`/api/v1/participants/${participantId}`)
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe(participantId);
      expect(response.body.data.uniqueId).toBe(testParticipant.uniqueId);
    });

    it('should include related data when requested', async () => {
      // Create some events
      await prisma.event.create({
        data: {
          participantId,
          type: 'session_start',
          data: JSON.stringify({ timestamp: new Date() }),
        },
      });

      const response = await request(app)
        .get(`/api/v1/participants/${participantId}?include=events`)
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(200);
      expect(response.body.data.events).toBeDefined();
      expect(response.body.data.events).toHaveLength(1);
    });
  });

  describe('PUT /api/v1/participants/:id/state', () => {
    let participantId: string;

    beforeEach(async () => {
      const participant = await prisma.participant.create({
        data: { ...testParticipant, studyId: testStudyId },
      });
      participantId = participant.id;
    });

    it('should update participant state with transaction', async () => {
      const response = await request(app)
        .put(`/api/v1/participants/${participantId}/state`)
        .set('Authorization', 'Bearer test-token')
        .send({
          state: 'ACTIVE',
          reason: 'Starting session',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.state).toBe('ACTIVE');

      // Verify event was created
      const events = await prisma.event.findMany({
        where: { participantId },
      });
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('state_change');
    });

    it('should validate state transitions', async () => {
      // Update to completed state
      await prisma.participant.update({
        where: { id: participantId },
        data: { state: 'COMPLETE' },
      });

      // Try to move back to active (invalid transition)
      const response = await request(app)
        .put(`/api/v1/participants/${participantId}/state`)
        .set('Authorization', 'Bearer test-token')
        .send({
          state: 'ACTIVE',
          reason: 'Trying to reactivate',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('Invalid state transition');
    });
  });

  describe('POST /api/v1/participants/:id/events', () => {
    let participantId: string;

    beforeEach(async () => {
      const participant = await prisma.participant.create({
        data: { ...testParticipant, studyId: testStudyId },
      });
      participantId = participant.id;
    });

    it('should create participant events', async () => {
      const eventData = {
        type: 'custom',
        category: 'interaction',
        data: {
          action: 'button_click',
          target: 'submit',
        },
      };

      const response = await request(app)
        .post(`/api/v1/participants/${participantId}/events`)
        .set('Authorization', 'Bearer test-token')
        .send(eventData);

      expect(response.status).toBe(201);
      expect(response.body.data.type).toBe(eventData.type);
      expect(response.body.data.participantId).toBe(participantId);
    });

    it('should batch create multiple events', async () => {
      const events = [
        { type: 'navigate', data: { page: 'home' } },
        { type: 'navigate', data: { page: 'about' } },
        { type: 'navigate', data: { page: 'contact' } },
      ];

      const response = await request(app)
        .post(`/api/v1/participants/${participantId}/events/batch`)
        .set('Authorization', 'Bearer test-token')
        .send({ events });

      expect(response.status).toBe(201);
      expect(response.body.data.created).toBe(3);
    });
  });
});

/**
 * Database Transaction Unit Tests
 * These test transaction functions directly without needing API infrastructure
 */
describe('Transaction Tests', () => {
  let testProjectId: string;
  let testResearcherId: string;

  beforeAll(async () => {
    // Clean up any existing test data
    await prisma.event.deleteMany({ where: { participant: { uniqueId: { startsWith: 'transaction-' } } } });
    await prisma.participant.deleteMany({ where: { uniqueId: { startsWith: 'transaction-' } } });
    await prisma.study.deleteMany({ where: { name: { startsWith: 'Complete Study' } } });
    await prisma.study.deleteMany({ where: { name: { startsWith: 'Transaction Test' } } });

    // Create a test researcher
    const researcher = await prisma.researcher.upsert({
      where: { email: 'txn-test@test.com' },
      update: {},
      create: {
        email: 'txn-test@test.com',
        passwordHash: 'hash',
        name: 'Transaction Test Researcher',
        role: 'RESEARCHER',
        status: 'ACTIVE',
        settings: {},
      },
    });
    testResearcherId = researcher.id;

    // Create a test project
    const project = await prisma.project.create({
      data: {
        name: 'Transaction Test Project',
        researcherId: testResearcherId,
      },
    });
    testProjectId = project.id;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.event.deleteMany({ where: { participant: { uniqueId: { startsWith: 'transaction-' } } } });
    await prisma.participant.deleteMany({ where: { uniqueId: { startsWith: 'transaction-' } } });
    await prisma.study.deleteMany({ where: { projectId: testProjectId } });
    await prisma.project.deleteMany({ where: { id: testProjectId } });
    await prisma.researcher.deleteMany({ where: { email: 'txn-test@test.com' } });
  });

  describe('createStudyWithRelations', () => {
    it('should rollback on failure', async () => {
      const invalidData = {
        study: {
          name: 'Transaction Test Study',
          // Missing required projectId to cause failure
        },
        conditions: [
          { name: 'Condition 1' },
          { name: 'Condition 2' },
        ],
      };

      await expect(createStudyWithRelations(invalidData)).rejects.toThrow();

      // Verify nothing was created
      const studies = await prisma.study.findMany({
        where: { name: 'Transaction Test Study' },
      });
      expect(studies).toHaveLength(0);
    });

    it('should create all related entities in transaction', async () => {
      const data = {
        study: {
          name: 'Complete Study',
          description: 'Study with all relations',
          type: 'MULTI_ROUND',
          status: 'DRAFT',
          projectId: testProjectId,
        },
        conditions: [
          { name: 'Control', config: '{}' },
          { name: 'Treatment', config: '{"aiEnabled": true}' },
        ],
        surveys: [
          {
            name: 'Pre-Study Survey',
            timing: 'PRE_STUDY',
            questions: '[]',
          },
        ],
      };

      const study = await createStudyWithRelations(data);
      expect(study.id).toBeDefined();

      // Verify all relations were created
      const conditions = await prisma.condition.findMany({
        where: { studyId: study.id },
      });
      expect(conditions).toHaveLength(2);

      const surveys = await prisma.survey.findMany({
        where: { studyId: study.id },
      });
      expect(surveys).toHaveLength(1);
    });
  });

  describe('updateParticipantWithEvent', () => {
    let participantId: string;
    let testStudyId: string;

    beforeAll(async () => {
      // Create a test study for this describe block
      const study = await prisma.study.create({
        data: {
          name: 'Transaction Update Test Study',
          type: 'SINGLE_PARTICIPANT',
          status: 'ACTIVE',
          projectId: testProjectId,
        },
      });
      testStudyId = study.id;
    });

    beforeEach(async () => {
      // Clean up previous test participants
      await prisma.event.deleteMany({ where: { participant: { uniqueId: 'transaction-test' } } });
      await prisma.participant.deleteMany({ where: { uniqueId: 'transaction-test' } });

      const participant = await prisma.participant.create({
        data: {
          uniqueId: 'transaction-test',
          studyId: testStudyId,
          state: 'ENROLLED',
        },
      });
      participantId = participant.id;
    });

    afterAll(async () => {
      await prisma.event.deleteMany({ where: { participant: { uniqueId: 'transaction-test' } } });
      await prisma.participant.deleteMany({ where: { uniqueId: 'transaction-test' } });
      await prisma.study.deleteMany({ where: { id: testStudyId } });
    });

    it('should update state and create event atomically', async () => {
      const result = await updateParticipantWithEvent(
        participantId,
        'ACTIVE',
        { reason: 'Session started' }
      );

      expect(result.state).toBe('ACTIVE');

      // Verify event was created
      const events = await prisma.event.findMany({
        where: { participantId },
      });
      expect(events).toHaveLength(1);

      // Parse the JSON string data
      const eventData = JSON.parse(events[0].data);
      expect(eventData).toHaveProperty('newState', 'ACTIVE');
    });
  });
});
