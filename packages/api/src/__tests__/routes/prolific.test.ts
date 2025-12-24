/**
 * Integration tests for Prolific API endpoints
 *
 * Tests the public Prolific integration endpoints:
 * - GET /prolific/:studyId/entry - Participant entry from Prolific
 * - POST /prolific/:studyId/complete - Generate completion code
 * - GET /prolific/:studyId/status/:prolificId - Get participant status
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../../app';
import { prisma } from '../../lib/prisma';

// Set required environment variables for Prolific tests
process.env.WEB_APP_URL = 'http://localhost:5173';

// ============================================================================
// Test Fixtures & Helpers
// ============================================================================

interface TestFixture {
  researcherId: string;
  projectId: string;
  studyId: string;
  nonProlificStudyId: string;
}

let app: Express;
let fixture: TestFixture;

// Valid 24-character hex Prolific ID
const VALID_PROLIFIC_ID = '5f7c8a9b0c1d2e3f4a5b6c7d';
const VALID_PROLIFIC_ID_2 = 'aabbccdd11223344eeffaabb';
const INVALID_PROLIFIC_ID = 'not-a-valid-prolific-id';

/**
 * Create test fixtures for all tests
 */
async function createTestFixtures(): Promise<TestFixture> {
  // Clean up any leftover data from previous runs
  await prisma.researcher.deleteMany({
    where: { email: 'prolific-test@test.com' },
  }).catch(() => {});

  // Create all fixtures in a transaction
  return await prisma.$transaction(async (tx) => {
    // Create researcher
    const researcher = await tx.researcher.create({
      data: {
        email: 'prolific-test@test.com',
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
        name: 'Prolific Test Project',
        researcherId: researcher.id,
      },
    });

    // Create Prolific-enabled study
    const study = await tx.study.create({
      data: {
        name: 'Prolific Test Study',
        projectId: project.id,
        type: 'SINGLE_PARTICIPANT',
        status: 'ACTIVE',
        prolificEnabled: true,
        prolificStudyId: 'prolific-study-123',
        config: JSON.stringify({}),
      },
    });

    // Create non-Prolific study
    const nonProlificStudy = await tx.study.create({
      data: {
        name: 'Regular Study',
        projectId: project.id,
        type: 'SINGLE_PARTICIPANT',
        status: 'ACTIVE',
        prolificEnabled: false,
        config: JSON.stringify({}),
      },
    });

    return {
      researcherId: researcher.id,
      projectId: project.id,
      studyId: study.id,
      nonProlificStudyId: nonProlificStudy.id,
    };
  });
}

/**
 * Clean up test fixtures
 */
async function cleanupTestFixtures(fixtureToClean: TestFixture) {
  await prisma.$transaction([
    prisma.event.deleteMany({
      where: {
        participant: {
          study: {
            project: { researcherId: fixtureToClean.researcherId },
          },
        },
      },
    }),
    prisma.participant.deleteMany({
      where: {
        study: {
          project: { researcherId: fixtureToClean.researcherId },
        },
      },
    }),
    prisma.study.deleteMany({
      where: {
        project: { researcherId: fixtureToClean.researcherId },
      },
    }),
    prisma.project.deleteMany({
      where: { researcherId: fixtureToClean.researcherId },
    }),
    prisma.researcher.deleteMany({
      where: { id: fixtureToClean.researcherId },
    }),
  ]);
}

// ============================================================================
// Test Setup
// ============================================================================

beforeAll(async () => {
  app = createApp();
  fixture = await createTestFixtures();
});

afterAll(async () => {
  await cleanupTestFixtures(fixture);
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Clean up participants between tests to ensure isolation
  await prisma.event.deleteMany({
    where: {
      participant: {
        studyId: { in: [fixture.studyId, fixture.nonProlificStudyId] },
      },
    },
  });
  await prisma.participant.deleteMany({
    where: {
      studyId: { in: [fixture.studyId, fixture.nonProlificStudyId] },
    },
  });
});

// ============================================================================
// GET /prolific/:studyId/entry - Participant Entry
// ============================================================================

describe('GET /api/v1/prolific/:studyId/entry', () => {
  it('should redirect valid Prolific participant to web app', async () => {
    const res = await request(app)
      .get(`/api/v1/prolific/${fixture.studyId}/entry`)
      .query({
        PROLIFIC_PID: VALID_PROLIFIC_ID,
        STUDY_ID: 'prolific-study-123',
        SESSION_ID: 'session-abc',
      });

    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/study\/join\//);

    // Verify participant was created
    const participant = await prisma.participant.findFirst({
      where: {
        studyId: fixture.studyId,
        prolificId: VALID_PROLIFIC_ID,
      },
    });
    expect(participant).not.toBeNull();
    expect(participant?.state).toBe('ENROLLED');
    expect(participant?.actorType).toBe('HUMAN');
  });

  it('should handle returning participant (upsert)', async () => {
    // First entry
    await request(app)
      .get(`/api/v1/prolific/${fixture.studyId}/entry`)
      .query({
        PROLIFIC_PID: VALID_PROLIFIC_ID,
        STUDY_ID: 'prolific-study-123',
      });

    // Second entry (returning)
    const res = await request(app)
      .get(`/api/v1/prolific/${fixture.studyId}/entry`)
      .query({
        PROLIFIC_PID: VALID_PROLIFIC_ID,
        STUDY_ID: 'prolific-study-123',
      });

    expect(res.status).toBe(302);

    // Should still be only one participant
    const participants = await prisma.participant.count({
      where: {
        studyId: fixture.studyId,
        prolificId: VALID_PROLIFIC_ID,
      },
    });
    expect(participants).toBe(1);
  });

  it('should reject invalid Prolific ID format', async () => {
    const res = await request(app)
      .get(`/api/v1/prolific/${fixture.studyId}/entry`)
      .query({
        PROLIFIC_PID: INVALID_PROLIFIC_ID,
      });

    expect(res.status).toBe(422);  // Validation errors return 422
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should reject missing Prolific ID', async () => {
    const res = await request(app)
      .get(`/api/v1/prolific/${fixture.studyId}/entry`);

    expect(res.status).toBe(422);  // Validation errors return 422
    expect(res.body.success).toBe(false);
  });

  it('should reject non-existent study', async () => {
    const fakeStudyId = 'clxxxxxxxxxxxxxxxxxxxxxxxxx';  // Valid cuid format but non-existent
    const res = await request(app)
      .get(`/api/v1/prolific/${fakeStudyId}/entry`)
      .query({
        PROLIFIC_PID: VALID_PROLIFIC_ID,
      });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('should reject non-Prolific study', async () => {
    const res = await request(app)
      .get(`/api/v1/prolific/${fixture.nonProlificStudyId}/entry`)
      .query({
        PROLIFIC_PID: VALID_PROLIFIC_ID,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PROLIFIC_INVALID_CONFIG');
  });

  it('should reject mismatched Prolific study ID', async () => {
    const res = await request(app)
      .get(`/api/v1/prolific/${fixture.studyId}/entry`)
      .query({
        PROLIFIC_PID: VALID_PROLIFIC_ID,
        STUDY_ID: 'wrong-prolific-study-id',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/mismatch/i);
  });

  it('should create enrollment event for new participant', async () => {
    await request(app)
      .get(`/api/v1/prolific/${fixture.studyId}/entry`)
      .query({
        PROLIFIC_PID: VALID_PROLIFIC_ID,
      });

    const events = await prisma.event.findMany({
      where: {
        type: 'prolific_enrollment',
        participant: {
          prolificId: VALID_PROLIFIC_ID,
        },
      },
    });

    expect(events.length).toBe(1);
    const eventData = JSON.parse(events[0].data as string);
    expect(eventData.prolificId).toBe(VALID_PROLIFIC_ID);
  });
});

// ============================================================================
// POST /prolific/:studyId/complete - Generate Completion Code
// ============================================================================

describe('POST /api/v1/prolific/:studyId/complete', () => {
  beforeEach(async () => {
    // Create a participant for completion tests
    await prisma.participant.create({
      data: {
        studyId: fixture.studyId,
        uniqueId: 'complete-test-001',
        prolificId: VALID_PROLIFIC_ID,
        state: 'ACTIVE',
        actorType: 'HUMAN',
        type: 'HUMAN',
      },
    });
  });

  it('should generate completion code for valid participant', async () => {
    const res = await request(app)
      .post(`/api/v1/prolific/${fixture.studyId}/complete`)
      .send({ prolificId: VALID_PROLIFIC_ID });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.completionCode).toBeDefined();
    expect(res.body.data.completionCode).toMatch(/^[A-F0-9]{12}$/);

    // Verify participant was updated
    const participant = await prisma.participant.findFirst({
      where: { prolificId: VALID_PROLIFIC_ID },
    });
    expect(participant?.state).toBe('COMPLETE');
    expect(participant?.completionCode).toBe(res.body.data.completionCode);
    expect(participant?.completedAt).not.toBeNull();
  });

  it('should return same completion code on repeated calls', async () => {
    const res1 = await request(app)
      .post(`/api/v1/prolific/${fixture.studyId}/complete`)
      .send({ prolificId: VALID_PROLIFIC_ID });

    const res2 = await request(app)
      .post(`/api/v1/prolific/${fixture.studyId}/complete`)
      .send({ prolificId: VALID_PROLIFIC_ID });

    expect(res1.body.data.completionCode).toBe(res2.body.data.completionCode);
  });

  it('should reject invalid Prolific ID format', async () => {
    const res = await request(app)
      .post(`/api/v1/prolific/${fixture.studyId}/complete`)
      .send({ prolificId: INVALID_PROLIFIC_ID });

    expect(res.status).toBe(422);  // Validation errors return 422
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should reject non-existent participant', async () => {
    const res = await request(app)
      .post(`/api/v1/prolific/${fixture.studyId}/complete`)
      .send({ prolificId: VALID_PROLIFIC_ID_2 });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('should reject non-Prolific study', async () => {
    const res = await request(app)
      .post(`/api/v1/prolific/${fixture.nonProlificStudyId}/complete`)
      .send({ prolificId: VALID_PROLIFIC_ID });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PROLIFIC_INVALID_CONFIG');
  });

  it('should create completion event', async () => {
    await request(app)
      .post(`/api/v1/prolific/${fixture.studyId}/complete`)
      .send({ prolificId: VALID_PROLIFIC_ID });

    const events = await prisma.event.findMany({
      where: {
        type: 'prolific_completion',
        participant: {
          prolificId: VALID_PROLIFIC_ID,
        },
      },
    });

    expect(events.length).toBe(1);
  });
});

// ============================================================================
// GET /prolific/:studyId/status/:prolificId - Get Participant Status
// ============================================================================

describe('GET /api/v1/prolific/:studyId/status/:prolificId', () => {
  beforeEach(async () => {
    // Create participant with completion code
    await prisma.participant.create({
      data: {
        studyId: fixture.studyId,
        uniqueId: 'status-test-001',
        prolificId: VALID_PROLIFIC_ID,
        state: 'COMPLETE',
        actorType: 'HUMAN',
        type: 'HUMAN',
        completionCode: 'ABC123DEF456',
        completedAt: new Date(),
      },
    });
  });

  it('should return participant status with completion code', async () => {
    const res = await request(app)
      .get(`/api/v1/prolific/${fixture.studyId}/status/${VALID_PROLIFIC_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.state).toBe('COMPLETE');
    expect(res.body.data.completionCode).toBe('ABC123DEF456');
    expect(res.body.data.completedAt).toBeDefined();
  });

  it('should reject invalid Prolific ID format', async () => {
    const res = await request(app)
      .get(`/api/v1/prolific/${fixture.studyId}/status/${INVALID_PROLIFIC_ID}`);

    expect(res.status).toBe(422);  // Validation errors return 422
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should reject non-existent participant', async () => {
    const res = await request(app)
      .get(`/api/v1/prolific/${fixture.studyId}/status/${VALID_PROLIFIC_ID_2}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('should reject non-Prolific study', async () => {
    const res = await request(app)
      .get(`/api/v1/prolific/${fixture.nonProlificStudyId}/status/${VALID_PROLIFIC_ID}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PROLIFIC_INVALID_CONFIG');
  });

  it('should return status for incomplete participant', async () => {
    // Create an in-progress participant
    await prisma.participant.create({
      data: {
        studyId: fixture.studyId,
        uniqueId: 'status-test-002',
        prolificId: VALID_PROLIFIC_ID_2,
        state: 'ACTIVE',
        actorType: 'HUMAN',
        type: 'HUMAN',
      },
    });

    const res = await request(app)
      .get(`/api/v1/prolific/${fixture.studyId}/status/${VALID_PROLIFIC_ID_2}`);

    expect(res.status).toBe(200);
    expect(res.body.data.state).toBe('ACTIVE');
    expect(res.body.data.completionCode).toBeNull();
  });
});
