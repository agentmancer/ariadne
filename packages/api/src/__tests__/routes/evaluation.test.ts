/**
 * Integration tests for Evaluation API endpoints
 *
 * Tests the evaluation/rating system for the FDG 2026 study:
 * - Instrument CRUD (GET /instruments, GET /instruments/:id, POST /instruments)
 * - Passage management (GET /passages, GET /passages/next, POST /passages, POST /passages/import-session)
 * - Rating submission (POST /ratings, GET /ratings)
 * - Stats endpoint (GET /stats)
 * - CSV export (GET /export)
 * - Rater management (POST /raters, GET /raters/:id/progress)
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
  projectId: string;
  studyId: string;
  instrumentId: string;
}

let app: Express;
let fixture: TestFixture;
let researcherToken: string;

/**
 * Create test fixtures for all tests
 */
async function createTestFixtures(): Promise<TestFixture> {
  // Clean up any leftover data from previous runs
  await prisma.researcher.deleteMany({
    where: { email: 'evaluation-test@test.com' },
  });

  // Clean up evaluation data - scoped to test data only
  await prisma.evaluationRating.deleteMany({
    where: { passage: { instrument: { name: { startsWith: 'Test' } } } }
  });
  await prisma.evaluationPassage.deleteMany({
    where: { instrument: { name: { startsWith: 'Test' } } }
  });
  await prisma.evaluationInstrument.deleteMany({
    where: { name: { startsWith: 'Test' } }
  });
  await prisma.evaluationRater.deleteMany({
    where: {
      OR: [
        { externalId: { startsWith: 'test-' } },
        { email: { endsWith: '@test.com' } }
      ]
    }
  });

  // Create all fixtures in a transaction
  return await prisma.$transaction(async (tx) => {
    // Create researcher
    const researcher = await tx.researcher.create({
      data: {
        email: 'evaluation-test@test.com',
        passwordHash: 'hash',
        name: 'Test Researcher',
        role: 'RESEARCHER',
        status: 'ACTIVE',
        settings: {},
      },
    });

    // Create project
    const project = await tx.project.create({
      data: {
        name: 'Evaluation Test Project',
        researcherId: researcher.id,
      },
    });

    // Create study
    const study = await tx.study.create({
      data: {
        name: 'Evaluation Test Study',
        projectId: project.id,
        type: 'SINGLE_PARTICIPANT',
        status: 'ACTIVE',
        config: JSON.stringify({}),
      },
    });

    // Create an evaluation instrument
    const instrument = await tx.evaluationInstrument.create({
      data: {
        name: 'Test Instrument',
        description: 'A test evaluation instrument',
        version: '1.0',
        definition: JSON.stringify({
          scales: [
            {
              id: 'test_scale',
              name: 'Test Scale',
              description: 'A test scale',
              minValue: 1,
              maxValue: 5,
              items: [
                { id: 'ts1', text: 'Test item 1', dimension: 'test' },
                { id: 'ts2', text: 'Test item 2', dimension: 'test' },
              ]
            }
          ]
        }),
        openQuestions: JSON.stringify([
          { id: 'oq1', prompt: 'What did you think?' }
        ]),
        isActive: true,
      },
    });

    return {
      researcherId: researcher.id,
      projectId: project.id,
      studyId: study.id,
      instrumentId: instrument.id,
    };
  });
}

/**
 * Clean up test fixtures
 */
async function cleanupTestFixtures(fixtureToClean: TestFixture | undefined) {
  if (!fixtureToClean) {
    // If fixture creation failed, clean by known patterns - scoped to test data only
    await prisma.evaluationRating.deleteMany({
      where: { passage: { instrument: { name: { startsWith: 'Test' } } } }
    });
    await prisma.evaluationPassage.deleteMany({
      where: { instrument: { name: { startsWith: 'Test' } } }
    });
    await prisma.evaluationInstrument.deleteMany({
      where: { name: { startsWith: 'Test' } }
    });
    await prisma.evaluationRater.deleteMany({
      where: {
        OR: [
          { externalId: { startsWith: 'test-' } },
          { email: { endsWith: '@test.com' } }
        ]
      }
    });
    await prisma.researcher.deleteMany({
      where: { email: 'evaluation-test@test.com' },
    });
    return;
  }

  await prisma.$transaction([
    prisma.evaluationRating.deleteMany({
      where: { passage: { instrumentId: fixtureToClean.instrumentId } }
    }),
    prisma.evaluationPassage.deleteMany({
      where: { instrumentId: fixtureToClean.instrumentId }
    }),
    prisma.evaluationInstrument.deleteMany({
      where: { id: fixtureToClean.instrumentId }
    }),
    prisma.evaluationRater.deleteMany({
      where: {
        OR: [
          { externalId: { startsWith: 'test-' } },
          { email: { contains: 'test' } }
        ]
      }
    }),
    prisma.study.deleteMany({
      where: { id: fixtureToClean.studyId }
    }),
    prisma.project.deleteMany({
      where: { id: fixtureToClean.projectId }
    }),
    prisma.researcher.deleteMany({
      where: { id: fixtureToClean.researcherId }
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
    'evaluation-test@test.com',
    ResearcherRole.RESEARCHER,
    AccountStatus.ACTIVE
  );
});

afterAll(async () => {
  await cleanupTestFixtures(fixture);
  await prisma.$disconnect();
});

// ============================================================================
// GET /evaluation/instruments - List Instruments
// ============================================================================

describe('GET /api/v1/evaluation/instruments', () => {
  it('should list all active instruments', async () => {
    const res = await request(app)
      .get('/api/v1/evaluation/instruments');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    // Should include our test instrument
    const testInstrument = res.body.data.find((i: { id: string }) => i.id === fixture.instrumentId);
    expect(testInstrument).toBeDefined();
    expect(testInstrument.name).toBe('Test Instrument');
  });

  it('should include passage count for each instrument', async () => {
    const res = await request(app)
      .get('/api/v1/evaluation/instruments');

    expect(res.status).toBe(200);
    const testInstrument = res.body.data.find((i: { id: string }) => i.id === fixture.instrumentId);
    expect(testInstrument._count).toBeDefined();
    expect(typeof testInstrument._count.passages).toBe('number');
  });
});

// ============================================================================
// GET /evaluation/instruments/:id - Get Instrument
// ============================================================================

describe('GET /api/v1/evaluation/instruments/:id', () => {
  it('should return FDG 2026 built-in instrument', async () => {
    const res = await request(app)
      .get('/api/v1/evaluation/instruments/fdg2026');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('fdg2026');
    expect(res.body.data.name).toBe('FDG 2026 Combined Instrument');
    expect(res.body.data.scales).toBeDefined();
    expect(Array.isArray(res.body.data.scales)).toBe(true);
    expect(res.body.data.openQuestions).toBeDefined();
  });

  it('should return a custom instrument by ID', async () => {
    const res = await request(app)
      .get(`/api/v1/evaluation/instruments/${fixture.instrumentId}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(fixture.instrumentId);
    expect(res.body.data.name).toBe('Test Instrument');
    expect(res.body.data.definition).toBeDefined();
    expect(res.body.data.definition.scales).toBeDefined();
  });

  it('should return 404 for non-existent instrument', async () => {
    const res = await request(app)
      .get('/api/v1/evaluation/instruments/nonexistent-id');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

// ============================================================================
// POST /evaluation/instruments - Create Instrument (requires auth)
// ============================================================================

describe('POST /api/v1/evaluation/instruments', () => {
  it('should create a new instrument when authenticated', async () => {
    const newInstrument = {
      name: 'Test Custom Instrument',
      description: 'A custom test instrument',
      version: '1.0',
      definition: {
        scales: [
          {
            id: 'custom_scale',
            name: 'Custom Scale',
            minValue: 1,
            maxValue: 7,
            items: [
              { id: 'cs1', text: 'Custom item 1' }
            ]
          }
        ]
      },
      openQuestions: [
        { id: 'oq1', prompt: 'Custom question?' }
      ]
    };

    const res = await request(app)
      .post('/api/v1/evaluation/instruments')
      .set('Authorization', `Bearer ${researcherToken}`)
      .send(newInstrument);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Test Custom Instrument');

    // Cleanup
    await prisma.evaluationInstrument.delete({ where: { id: res.body.data.id } });
  });

  it('should reject unauthenticated request', async () => {
    const res = await request(app)
      .post('/api/v1/evaluation/instruments')
      .send({ name: 'Test' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('should validate required fields', async () => {
    const res = await request(app)
      .post('/api/v1/evaluation/instruments')
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({ description: 'Missing name' });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });
});

// ============================================================================
// Passage Endpoints
// ============================================================================

describe('Passage Endpoints', () => {
  let passageId: string;

  beforeEach(async () => {
    // Clean up passages before each test - scoped to test instrument only
    await prisma.evaluationRating.deleteMany({
      where: { passage: { instrumentId: fixture.instrumentId } }
    });
    await prisma.evaluationPassage.deleteMany({
      where: { instrumentId: fixture.instrumentId }
    });
  });

  describe('POST /api/v1/evaluation/passages', () => {
    it('should create passages when authenticated', async () => {
      const res = await request(app)
        .post('/api/v1/evaluation/passages')
        .set('Authorization', `Bearer ${researcherToken}`)
        .send({
          instrumentId: fixture.instrumentId,
          studyId: fixture.studyId,
          passages: [
            {
              consequenceScene: 'The player enters the dark forest.',
              previousScene: 'You stand at the edge of the forest.',
              playerAction: 'Enter the forest',
              sequenceNum: 1,
            },
            {
              consequenceScene: 'You find a hidden path.',
              playerAction: 'Search for paths',
              sequenceNum: 2,
            }
          ]
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.created).toBe(2);
    });

    it('should reject unauthenticated request', async () => {
      const res = await request(app)
        .post('/api/v1/evaluation/passages')
        .send({ instrumentId: fixture.instrumentId, passages: [] });

      expect(res.status).toBe(401);
    });

    it('should handle fdg2026 instrument ID specially', async () => {
      const res = await request(app)
        .post('/api/v1/evaluation/passages')
        .set('Authorization', `Bearer ${researcherToken}`)
        .send({
          instrumentId: 'fdg2026',
          passages: [
            {
              consequenceScene: 'A test scene for FDG 2026.',
              sequenceNum: 0,
            }
          ]
        });

      expect(res.status).toBe(201);
      expect(res.body.data.created).toBe(1);

      // Cleanup - delete the created FDG instrument
      const fdgInstrument = await prisma.evaluationInstrument.findFirst({
        where: { name: 'FDG 2026 Combined Instrument' }
      });
      if (fdgInstrument) {
        await prisma.evaluationPassage.deleteMany({ where: { instrumentId: fdgInstrument.id } });
        await prisma.evaluationInstrument.delete({ where: { id: fdgInstrument.id } });
      }
    });
  });

  describe('GET /api/v1/evaluation/passages', () => {
    beforeEach(async () => {
      // Create test passages
      await prisma.evaluationPassage.createMany({
        data: [
          {
            instrumentId: fixture.instrumentId,
            studyId: fixture.studyId,
            conditionId: 'condition-a',
            consequenceScene: 'Passage 1 content',
            choicesOffered: '[]',
            automatedMetrics: '{}',
            sequenceNum: 1,
          },
          {
            instrumentId: fixture.instrumentId,
            studyId: fixture.studyId,
            conditionId: 'condition-b',
            consequenceScene: 'Passage 2 content',
            choicesOffered: '[]',
            automatedMetrics: '{}',
            sequenceNum: 2,
          }
        ]
      });
    });

    it('should list passages with filters', async () => {
      const res = await request(app)
        .get('/api/v1/evaluation/passages')
        .query({ instrumentId: fixture.instrumentId });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(2);
    });

    it('should filter by conditionId', async () => {
      const res = await request(app)
        .get('/api/v1/evaluation/passages')
        .query({ conditionId: 'condition-a' });

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].conditionId).toBe('condition-a');
    });

    it('should support pagination', async () => {
      const res = await request(app)
        .get('/api/v1/evaluation/passages')
        .query({ instrumentId: fixture.instrumentId, limit: 1, offset: 0 });

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });

    it('should include ratings count', async () => {
      const res = await request(app)
        .get('/api/v1/evaluation/passages')
        .query({ instrumentId: fixture.instrumentId });

      expect(res.status).toBe(200);
      expect(res.body.data[0].ratingsCount).toBeDefined();
      expect(typeof res.body.data[0].ratingsCount).toBe('number');
    });
  });

  describe('GET /api/v1/evaluation/passages/next', () => {
    beforeEach(async () => {
      // Create passages with non-empty consequenceScene
      await prisma.evaluationPassage.createMany({
        data: [
          {
            instrumentId: fixture.instrumentId,
            consequenceScene: 'Passage A content',
            choicesOffered: '[]',
            automatedMetrics: '{}',
            sequenceNum: 1,
          },
          {
            instrumentId: fixture.instrumentId,
            consequenceScene: 'Passage B content',
            choicesOffered: '[]',
            automatedMetrics: '{}',
            sequenceNum: 2,
          }
        ]
      });
    });

    it('should return next passage for rater', async () => {
      const res = await request(app)
        .get('/api/v1/evaluation/passages/next')
        .query({ raterId: 'test-rater-001' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.passage).toBeDefined();
      expect(res.body.data.progress).toBeDefined();
      expect(res.body.data.progress.completed).toBe(0);
    });

    it('should require raterId', async () => {
      const res = await request(app)
        .get('/api/v1/evaluation/passages/next');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_INPUT');
    });

    it('should exclude already rated passages', async () => {
      // Get a passage
      const passages = await prisma.evaluationPassage.findMany({
        where: { instrumentId: fixture.instrumentId },
        take: 1,
      });
      passageId = passages[0].id;

      // Rate it
      await prisma.evaluationRating.create({
        data: {
          passageId,
          raterId: 'test-rater-002',
          scaleRatings: '{}',
          overallRatings: '{}',
          openResponses: '{}',
        }
      });

      const res = await request(app)
        .get('/api/v1/evaluation/passages/next')
        .query({ raterId: 'test-rater-002' });

      expect(res.status).toBe(200);
      // Should not return the already rated passage
      if (res.body.data.passage) {
        expect(res.body.data.passage.id).not.toBe(passageId);
      }
    });

    it('should return null when all passages rated', async () => {
      // Rate all passages
      const passages = await prisma.evaluationPassage.findMany({
        where: { instrumentId: fixture.instrumentId }
      });

      for (const p of passages) {
        await prisma.evaluationRating.create({
          data: {
            passageId: p.id,
            raterId: 'test-rater-003',
            scaleRatings: '{}',
            overallRatings: '{}',
            openResponses: '{}',
          }
        });
      }

      const res = await request(app)
        .get('/api/v1/evaluation/passages/next')
        .query({ raterId: 'test-rater-003' });

      expect(res.status).toBe(200);
      expect(res.body.data).toBeNull();
      expect(res.body.message).toContain('rated');
    });
  });

  describe('POST /api/v1/evaluation/passages/import-session', () => {
    it('should import passages from session history', async () => {
      const res = await request(app)
        .post('/api/v1/evaluation/passages/import-session')
        .set('Authorization', `Bearer ${researcherToken}`)
        .send({
          instrumentId: fixture.instrumentId,
          sessionId: 'test-session-123',
          studyId: fixture.studyId,
          condition: 'test-condition',
          history: [
            {
              scene_before: 'You are in a room.',
              choice_made: 'Open the door',
              consequence: 'The door opens to reveal a garden.'
            },
            {
              scene_before: 'You are in the garden.',
              choice_made: 'Pick a flower',
              new_scene: 'You pick a beautiful rose.'
            }
          ]
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.imported).toBe(2);
      expect(res.body.data.sessionId).toBe('test-session-123');
    });

    it('should reject unauthenticated request', async () => {
      const res = await request(app)
        .post('/api/v1/evaluation/passages/import-session')
        .send({ sessionId: 'test', history: [] });

      expect(res.status).toBe(401);
    });

    it('should filter out empty passages', async () => {
      const res = await request(app)
        .post('/api/v1/evaluation/passages/import-session')
        .set('Authorization', `Bearer ${researcherToken}`)
        .send({
          instrumentId: fixture.instrumentId,
          sessionId: 'test-session-456',
          history: [
            { scene_before: 'Scene 1', choice_made: 'Action 1' }, // No consequence/new_scene
            { scene_before: 'Scene 2', choice_made: 'Action 2', consequence: 'Result 2' }
          ]
        });

      expect(res.status).toBe(201);
      expect(res.body.data.imported).toBe(1); // Only one valid passage
    });
  });
});

// ============================================================================
// Rating Endpoints
// ============================================================================

describe('Rating Endpoints', () => {
  let passageId: string;

  beforeEach(async () => {
    // Clean up and create test passage
    await prisma.evaluationRating.deleteMany({});
    await prisma.evaluationPassage.deleteMany({
      where: { instrumentId: fixture.instrumentId }
    });

    const passage = await prisma.evaluationPassage.create({
      data: {
        instrumentId: fixture.instrumentId,
        studyId: fixture.studyId,
        conditionId: 'test-condition',
        consequenceScene: 'Test passage for rating',
        choicesOffered: '[]',
        automatedMetrics: '{}',
        sequenceNum: 1,
      }
    });
    passageId = passage.id;
  });

  describe('POST /api/v1/evaluation/ratings', () => {
    it('should submit a rating', async () => {
      const res = await request(app)
        .post('/api/v1/evaluation/ratings')
        .send({
          passageId,
          raterId: 'test-rater-100',
          scaleRatings: {
            test_scale: { ts1: 4, ts2: 5 }
          },
          overallRatings: { overall: 4 },
          openResponses: { oq1: 'Good passage!' },
          timeSpentSeconds: 45
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.passageId).toBe(passageId);
      expect(res.body.data.raterId).toBe('test-rater-100');
    });

    it('should reject duplicate rating', async () => {
      // First rating
      await request(app)
        .post('/api/v1/evaluation/ratings')
        .send({
          passageId,
          raterId: 'test-rater-101',
          scaleRatings: { test_scale: { ts1: 3 } },
        });

      // Duplicate rating
      const res = await request(app)
        .post('/api/v1/evaluation/ratings')
        .send({
          passageId,
          raterId: 'test-rater-101',
          scaleRatings: { test_scale: { ts1: 4 } },
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ALREADY_EXISTS');
    });

    it('should return 404 for non-existent passage', async () => {
      const res = await request(app)
        .post('/api/v1/evaluation/ratings')
        .send({
          passageId: 'nonexistent-passage-id',
          raterId: 'test-rater-102',
          scaleRatings: {},
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should determine isComplete based on scale ratings', async () => {
      // Rating with 3+ scales should be complete
      const res = await request(app)
        .post('/api/v1/evaluation/ratings')
        .send({
          passageId,
          raterId: 'test-rater-103',
          scaleRatings: {
            scale1: { s1: 4 },
            scale2: { s2: 4 },
            scale3: { s3: 4 },
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.data.isComplete).toBe(true);
    });
  });

  describe('GET /api/v1/evaluation/ratings', () => {
    beforeEach(async () => {
      // Create test ratings
      await prisma.evaluationRating.createMany({
        data: [
          {
            passageId,
            raterId: 'rater-a',
            scaleRatings: JSON.stringify({ test_scale: { ts1: 4 } }),
            overallRatings: JSON.stringify({}),
            openResponses: JSON.stringify({}),
          },
          {
            passageId,
            raterId: 'rater-b',
            scaleRatings: JSON.stringify({ test_scale: { ts1: 5 } }),
            overallRatings: JSON.stringify({}),
            openResponses: JSON.stringify({}),
          }
        ]
      });
    });

    it('should list ratings', async () => {
      const res = await request(app)
        .get('/api/v1/evaluation/ratings');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by passageId', async () => {
      const res = await request(app)
        .get('/api/v1/evaluation/ratings')
        .query({ passageId });

      expect(res.status).toBe(200);
      expect(res.body.data.every((r: { passageId: string }) => r.passageId === passageId)).toBe(true);
    });

    it('should filter by raterId', async () => {
      const res = await request(app)
        .get('/api/v1/evaluation/ratings')
        .query({ raterId: 'rater-a' });

      expect(res.status).toBe(200);
      expect(res.body.data.every((r: { raterId: string }) => r.raterId === 'rater-a')).toBe(true);
    });

    it('should support pagination', async () => {
      const res = await request(app)
        .get('/api/v1/evaluation/ratings')
        .query({ limit: 1 });

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });
  });
});

// ============================================================================
// Stats Endpoint
// ============================================================================

describe('GET /api/v1/evaluation/stats', () => {
  beforeEach(async () => {
    // Clean and create test data
    await prisma.evaluationRating.deleteMany({});
    await prisma.evaluationPassage.deleteMany({
      where: { instrumentId: fixture.instrumentId }
    });

    // Create passages with different conditions
    const passageA = await prisma.evaluationPassage.create({
      data: {
        instrumentId: fixture.instrumentId,
        studyId: fixture.studyId,
        conditionId: 'cond-a',
        consequenceScene: 'Passage A',
        choicesOffered: '[]',
        automatedMetrics: '{}',
      }
    });

    const passageB = await prisma.evaluationPassage.create({
      data: {
        instrumentId: fixture.instrumentId,
        studyId: fixture.studyId,
        conditionId: 'cond-b',
        consequenceScene: 'Passage B',
        choicesOffered: '[]',
        automatedMetrics: '{}',
      }
    });

    // Create ratings
    await prisma.evaluationRating.createMany({
      data: [
        { passageId: passageA.id, raterId: 'stats-rater-1', scaleRatings: '{}', overallRatings: '{}', openResponses: '{}' },
        { passageId: passageA.id, raterId: 'stats-rater-2', scaleRatings: '{}', overallRatings: '{}', openResponses: '{}' },
        { passageId: passageB.id, raterId: 'stats-rater-1', scaleRatings: '{}', overallRatings: '{}', openResponses: '{}' },
      ]
    });
  });

  it('should return evaluation statistics', async () => {
    const res = await request(app)
      .get('/api/v1/evaluation/stats')
      .query({ instrumentId: fixture.instrumentId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totalPassages).toBe(2);
    expect(res.body.data.totalRatings).toBe(3);
    expect(res.body.data.uniqueRaters).toBe(2);
    expect(res.body.data.avgRatingsPerPassage).toBe(1.5);
  });

  it('should return condition breakdown', async () => {
    const res = await request(app)
      .get('/api/v1/evaluation/stats')
      .query({ instrumentId: fixture.instrumentId });

    expect(res.status).toBe(200);
    expect(res.body.data.byCondition).toBeDefined();
    expect(Array.isArray(res.body.data.byCondition)).toBe(true);
    expect(res.body.data.byCondition.length).toBe(2);
  });

  it('should filter by studyId', async () => {
    const res = await request(app)
      .get('/api/v1/evaluation/stats')
      .query({ studyId: fixture.studyId });

    expect(res.status).toBe(200);
    expect(res.body.data.totalPassages).toBe(2);
  });
});

// ============================================================================
// Export Endpoint
// ============================================================================

describe('GET /api/v1/evaluation/export', () => {
  beforeEach(async () => {
    // Clean and create test data
    await prisma.evaluationRating.deleteMany({});
    await prisma.evaluationPassage.deleteMany({
      where: { instrumentId: fixture.instrumentId }
    });

    const passage = await prisma.evaluationPassage.create({
      data: {
        instrumentId: fixture.instrumentId,
        studyId: fixture.studyId,
        conditionId: 'export-test',
        consequenceScene: 'Export test passage',
        playerAction: 'test action',
        choicesOffered: '[]',
        automatedMetrics: '{"wordCount": 10}',
      }
    });

    await prisma.evaluationRating.create({
      data: {
        passageId: passage.id,
        raterId: 'export-rater',
        scaleRatings: JSON.stringify({ test_scale: { ts1: 5, ts2: 4 } }),
        overallRatings: JSON.stringify({ overall: 4 }),
        openResponses: JSON.stringify({ oq1: 'Nice!' }),
        timeSpentSeconds: 30,
        isComplete: true,
      }
    });
  });

  it('should export ratings as JSON (requires auth)', async () => {
    const res = await request(app)
      .get('/api/v1/evaluation/export')
      .set('Authorization', `Bearer ${researcherToken}`)
      .query({ instrumentId: fixture.instrumentId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.meta).toBeDefined();
    expect(res.body.meta.totalRatings).toBeGreaterThan(0);
  });

  it('should include flattened rating data', async () => {
    const res = await request(app)
      .get('/api/v1/evaluation/export')
      .set('Authorization', `Bearer ${researcherToken}`)
      .query({ instrumentId: fixture.instrumentId });

    expect(res.status).toBe(200);
    const rating = res.body.data[0];
    expect(rating.ratingId).toBeDefined();
    expect(rating.passageId).toBeDefined();
    expect(rating.raterId).toBeDefined();
    expect(rating.condition).toBe('export-test');
    expect(rating.scaleRatings).toBeDefined();
    expect(rating.overallRatings).toBeDefined();
  });

  it('should export as CSV when format=csv', async () => {
    const res = await request(app)
      .get('/api/v1/evaluation/export')
      .set('Authorization', `Bearer ${researcherToken}`)
      .query({ instrumentId: fixture.instrumentId, format: 'csv' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(typeof res.text).toBe('string');
    expect(res.text).toContain('ratingId');
  });

  it('should reject unauthenticated request', async () => {
    const res = await request(app)
      .get('/api/v1/evaluation/export');

    expect(res.status).toBe(401);
  });
});

// ============================================================================
// Rater Endpoints
// ============================================================================

describe('Rater Endpoints', () => {
  let raterId: string;

  beforeEach(async () => {
    // Clean up raters
    await prisma.evaluationRater.deleteMany({
      where: { externalId: { startsWith: 'test-external-' } }
    });
  });

  describe('POST /api/v1/evaluation/raters', () => {
    it('should register a new rater', async () => {
      const res = await request(app)
        .post('/api/v1/evaluation/raters')
        .send({
          externalId: 'test-external-001',
          email: 'rater@test.com',
          name: 'Test Rater',
          experienceLevel: 'expert'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.externalId).toBe('test-external-001');
      expect(res.body.data.experienceLevel).toBe('expert');
      raterId = res.body.data.id;
    });

    it('should return existing rater by externalId', async () => {
      // Create first
      await request(app)
        .post('/api/v1/evaluation/raters')
        .send({ externalId: 'test-external-002', name: 'First' });

      // Try to create again
      const res = await request(app)
        .post('/api/v1/evaluation/raters')
        .send({ externalId: 'test-external-002', name: 'Second' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Existing rater found');
      expect(res.body.data.externalId).toBe('test-external-002');
    });

    it('should use default experience level', async () => {
      const res = await request(app)
        .post('/api/v1/evaluation/raters')
        .send({ externalId: 'test-external-003' });

      expect(res.status).toBe(201);
      expect(res.body.data.experienceLevel).toBe('intermediate');
    });

    it('should validate experience level enum', async () => {
      const res = await request(app)
        .post('/api/v1/evaluation/raters')
        .send({
          externalId: 'test-external-004',
          experienceLevel: 'invalid'
        });

      expect(res.status).toBe(422);
    });
  });

  describe('GET /api/v1/evaluation/raters/:id/progress', () => {
    beforeEach(async () => {
      // Clean and create test data
      await prisma.evaluationRating.deleteMany({
        where: { raterId: 'progress-test-rater' }
      });
      await prisma.evaluationPassage.deleteMany({
        where: { instrumentId: fixture.instrumentId }
      });

      // Create passages
      const passages = await Promise.all([
        prisma.evaluationPassage.create({
          data: {
            instrumentId: fixture.instrumentId,
            consequenceScene: 'Progress test 1',
            choicesOffered: '[]',
            automatedMetrics: '{}',
          }
        }),
        prisma.evaluationPassage.create({
          data: {
            instrumentId: fixture.instrumentId,
            consequenceScene: 'Progress test 2',
            choicesOffered: '[]',
            automatedMetrics: '{}',
          }
        }),
      ]);

      // Create ratings
      await prisma.evaluationRating.create({
        data: {
          passageId: passages[0].id,
          raterId: 'progress-test-rater',
          scaleRatings: '{}',
          overallRatings: '{}',
          openResponses: '{}',
          timeSpentSeconds: 60,
        }
      });
    });

    it('should return rater progress', async () => {
      const res = await request(app)
        .get('/api/v1/evaluation/raters/progress-test-rater/progress');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.raterId).toBe('progress-test-rater');
      expect(res.body.data.completed).toBe(1);
      expect(res.body.data.total).toBe(2);
      expect(res.body.data.remaining).toBe(1);
      expect(res.body.data.percentComplete).toBe(50);
    });

    it('should calculate time statistics', async () => {
      const res = await request(app)
        .get('/api/v1/evaluation/raters/progress-test-rater/progress');

      expect(res.status).toBe(200);
      expect(res.body.data.totalTimeSeconds).toBe(60);
      expect(res.body.data.avgTimePerRating).toBe(60);
    });

    it('should handle rater with no ratings', async () => {
      const res = await request(app)
        .get('/api/v1/evaluation/raters/nonexistent-rater/progress');

      expect(res.status).toBe(200);
      expect(res.body.data.completed).toBe(0);
      expect(res.body.data.percentComplete).toBe(0);
    });
  });
});
