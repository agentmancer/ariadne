/**
 * Integration tests for Trials API endpoints (RFC 002)
 *
 * Tests the parameter sweep experiment endpoints:
 * - GET /studies/:studyId/trials - List trials for a study
 * - POST /studies/:studyId/trials - Create a single trial
 * - POST /studies/:studyId/trials/sweep - Create parameter sweep trials
 * - GET /trials/:id - Get a specific trial
 * - PATCH /trials/:id - Update a trial
 * - DELETE /trials/:id - Delete a trial
 * - POST /trials/:id/run - Run sessions for a trial
 * - GET /trials/:id/results - Get trial results/statistics
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
  projectId: string;
  studyId: string;
  conditionId: string;
  trialId: string;
}

let app: Express;
let fixture: TestFixture;
let researcherToken: string;
let otherResearcherToken: string;

/**
 * Create test fixtures for all tests
 */
async function createTestFixtures(): Promise<TestFixture> {
  // Clean up any leftover data from previous runs
  await prisma.researcher.deleteMany({
    where: {
      email: {
        in: ['trials-test@test.com', 'trials-other@test.com']
      }
    }
  }).catch(() => {});

  // Create fixtures
  return await prisma.$transaction(async (tx) => {
    // Create primary researcher
    const researcher = await tx.researcher.create({
      data: {
        email: 'trials-test@test.com',
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
        email: 'trials-other@test.com',
        passwordHash: 'hash',
        name: 'Other Researcher',
        role: 'RESEARCHER',
        status: 'ACTIVE',
        settings: {},
      },
    });

    // Create project
    const project = await tx.project.create({
      data: {
        name: 'Trials Test Project',
        researcherId: researcher.id,
      },
    });

    // Create study
    const study = await tx.study.create({
      data: {
        name: 'Trials Test Study',
        projectId: project.id,
        type: 'SINGLE_PARTICIPANT',
        status: 'ACTIVE',
        config: JSON.stringify({}),
      },
    });

    // Create condition
    const condition = await tx.condition.create({
      data: {
        name: 'Test Condition',
        studyId: study.id,
        config: JSON.stringify({}),
      },
    });

    // Create an existing trial
    const trial = await tx.trial.create({
      data: {
        studyId: study.id,
        conditionId: condition.id,
        sequence: 1,
        name: 'Existing Trial',
        parameters: JSON.stringify({ temperature: 0.7 }),
      },
    });

    return {
      researcherId: researcher.id,
      otherResearcherId: otherResearcher.id,
      projectId: project.id,
      studyId: study.id,
      conditionId: condition.id,
      trialId: trial.id,
    };
  });
}

/**
 * Clean up test fixtures
 */
async function cleanupTestFixtures(): Promise<void> {
  await prisma.researcher.deleteMany({
    where: {
      email: {
        in: ['trials-test@test.com', 'trials-other@test.com']
      }
    }
  }).catch(() => {});
}

// ============================================================================
// Test Suite Setup
// ============================================================================

beforeAll(async () => {
  app = createApp();
  fixture = await createTestFixtures();
  researcherToken = generateResearcherToken(
    fixture.researcherId,
    'trials-test@test.com',
    ResearcherRole.RESEARCHER,
    AccountStatus.ACTIVE
  );
  otherResearcherToken = generateResearcherToken(
    fixture.otherResearcherId,
    'trials-other@test.com',
    ResearcherRole.RESEARCHER,
    AccountStatus.ACTIVE
  );
});

afterAll(async () => {
  await cleanupTestFixtures();
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Reset trials to known state before each test
  await prisma.trial.deleteMany({
    where: {
      studyId: fixture.studyId,
      id: { not: fixture.trialId }
    }
  });
});

// ============================================================================
// LIST TRIALS - GET /api/v1/studies/:studyId/trials
// ============================================================================

describe('GET /api/v1/studies/:studyId/trials', () => {
  it('should return trials for a study', async () => {
    const response = await request(app)
      .get(`/api/v1/studies/${fixture.studyId}/trials`)
      .set('Authorization', `Bearer ${researcherToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeInstanceOf(Array);
    expect(response.body.data.length).toBeGreaterThanOrEqual(1);
    expect(response.body.pagination).toBeDefined();
    expect(response.body.pagination.page).toBe(1);
  });

  it('should filter trials by status', async () => {
    const response = await request(app)
      .get(`/api/v1/studies/${fixture.studyId}/trials?status=PENDING`)
      .set('Authorization', `Bearer ${researcherToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    response.body.data.forEach((trial: { status: string }) => {
      expect(trial.status).toBe('PENDING');
    });
  });

  it('should filter trials by conditionId', async () => {
    const response = await request(app)
      .get(`/api/v1/studies/${fixture.studyId}/trials?conditionId=${fixture.conditionId}`)
      .set('Authorization', `Bearer ${researcherToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    response.body.data.forEach((trial: { conditionId: string }) => {
      expect(trial.conditionId).toBe(fixture.conditionId);
    });
  });

  it('should support pagination', async () => {
    // Create additional trials for pagination test
    await prisma.$transaction([
      prisma.trial.create({
        data: {
          studyId: fixture.studyId,
          sequence: 2,
          name: 'Trial 2',
          parameters: '{}',
        },
      }),
      prisma.trial.create({
        data: {
          studyId: fixture.studyId,
          sequence: 3,
          name: 'Trial 3',
          parameters: '{}',
        },
      }),
    ]);

    const response = await request(app)
      .get(`/api/v1/studies/${fixture.studyId}/trials?page=1&pageSize=2`)
      .set('Authorization', `Bearer ${researcherToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.length).toBeLessThanOrEqual(2);
    expect(response.body.pagination.pageSize).toBe(2);
  });

  it('should return 401 without authentication', async () => {
    await request(app)
      .get(`/api/v1/studies/${fixture.studyId}/trials`)
      .expect(401);
  });

  it('should return 403 for unauthorized researcher', async () => {
    const response = await request(app)
      .get(`/api/v1/studies/${fixture.studyId}/trials`)
      .set('Authorization', `Bearer ${otherResearcherToken}`)
      .expect(403);

    expect(response.body.success).toBe(false);
  });

  it('should return 404 for non-existent study', async () => {
    const response = await request(app)
      .get('/api/v1/studies/nonexistent-study/trials')
      .set('Authorization', `Bearer ${researcherToken}`)
      .expect(404);

    expect(response.body.success).toBe(false);
  });
});

// ============================================================================
// CREATE TRIAL - POST /api/v1/studies/:studyId/trials
// ============================================================================

describe('POST /api/v1/studies/:studyId/trials', () => {
  it('should create a trial with minimal data', async () => {
    const response = await request(app)
      .post(`/api/v1/studies/${fixture.studyId}/trials`)
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({})
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBeDefined();
    expect(response.body.data.studyId).toBe(fixture.studyId);
    expect(response.body.data.parameters).toEqual({});
    expect(response.body.data.status).toBe('PENDING');
  });

  it('should create a trial with parameters', async () => {
    const params = { temperature: 0.5, maxTokens: 1000 };
    const response = await request(app)
      .post(`/api/v1/studies/${fixture.studyId}/trials`)
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({
        name: 'Custom Trial',
        parameters: params,
        conditionId: fixture.conditionId,
      })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.name).toBe('Custom Trial');
    expect(response.body.data.parameters).toEqual(params);
    expect(response.body.data.conditionId).toBe(fixture.conditionId);
  });

  it('should auto-increment sequence', async () => {
    const response1 = await request(app)
      .post(`/api/v1/studies/${fixture.studyId}/trials`)
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({})
      .expect(201);

    const response2 = await request(app)
      .post(`/api/v1/studies/${fixture.studyId}/trials`)
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({})
      .expect(201);

    expect(response2.body.data.sequence).toBeGreaterThan(response1.body.data.sequence);
  });

  it('should reject invalid conditionId', async () => {
    const response = await request(app)
      .post(`/api/v1/studies/${fixture.studyId}/trials`)
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({
        conditionId: 'invalid-condition-id',
      })
      .expect(400);

    expect(response.body.success).toBe(false);
  });

  it('should return 401 without authentication', async () => {
    await request(app)
      .post(`/api/v1/studies/${fixture.studyId}/trials`)
      .send({})
      .expect(401);
  });

  it('should return 403 for unauthorized researcher', async () => {
    const response = await request(app)
      .post(`/api/v1/studies/${fixture.studyId}/trials`)
      .set('Authorization', `Bearer ${otherResearcherToken}`)
      .send({})
      .expect(403);

    expect(response.body.success).toBe(false);
  });
});

// ============================================================================
// PARAMETER SWEEP - POST /api/v1/studies/:studyId/trials/sweep
// ============================================================================

describe('POST /api/v1/studies/:studyId/trials/sweep', () => {
  it('should create multiple trials for parameter sweep', async () => {
    const response = await request(app)
      .post(`/api/v1/studies/${fixture.studyId}/trials/sweep`)
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({
        parameterKey: 'temperature',
        values: [0.3, 0.5, 0.7, 0.9],
        baseParameters: { model: 'gpt-4' },
      })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.count).toBe(4);
    expect(response.body.data.parameterKey).toBe('temperature');
    expect(response.body.data.trials.length).toBe(4);

    // Verify each trial has correct parameters
    response.body.data.trials.forEach((trial: { parameters: Record<string, unknown>; parameterKey: string }, index: number) => {
      expect(trial.parameters.temperature).toBe([0.3, 0.5, 0.7, 0.9][index]);
      expect(trial.parameters.model).toBe('gpt-4');
      expect(trial.parameterKey).toBe('temperature');
    });
  });

  it('should create sweep with condition', async () => {
    const response = await request(app)
      .post(`/api/v1/studies/${fixture.studyId}/trials/sweep`)
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({
        conditionId: fixture.conditionId,
        parameterKey: 'maxTokens',
        values: [100, 500, 1000],
      })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.count).toBe(3);
    response.body.data.trials.forEach((trial: { conditionId: string }) => {
      expect(trial.conditionId).toBe(fixture.conditionId);
    });
  });

  it('should reject empty values array', async () => {
    const response = await request(app)
      .post(`/api/v1/studies/${fixture.studyId}/trials/sweep`)
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({
        parameterKey: 'temperature',
        values: [],
      })
      .expect(422);  // Zod validation returns 422

    expect(response.body.success).toBe(false);
  });

  it('should reject missing parameterKey', async () => {
    const response = await request(app)
      .post(`/api/v1/studies/${fixture.studyId}/trials/sweep`)
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({
        values: [0.5, 0.7],
      })
      .expect(422);  // Zod validation returns 422

    expect(response.body.success).toBe(false);
  });

  it('should return 403 for unauthorized researcher', async () => {
    const response = await request(app)
      .post(`/api/v1/studies/${fixture.studyId}/trials/sweep`)
      .set('Authorization', `Bearer ${otherResearcherToken}`)
      .send({
        parameterKey: 'temperature',
        values: [0.5],
      })
      .expect(403);

    expect(response.body.success).toBe(false);
  });
});

// ============================================================================
// GET TRIAL - GET /api/v1/trials/:id
// ============================================================================

describe('GET /api/v1/trials/:id', () => {
  it('should return trial with full details', async () => {
    const response = await request(app)
      .get(`/api/v1/trials/${fixture.trialId}`)
      .set('Authorization', `Bearer ${researcherToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBe(fixture.trialId);
    expect(response.body.data.name).toBe('Existing Trial');
    expect(response.body.data.parameters).toEqual({ temperature: 0.7 });
    expect(response.body.data.condition).toBeDefined();
    expect(response.body.data.sessions).toBeDefined();
  });

  it('should return 401 without authentication', async () => {
    await request(app)
      .get(`/api/v1/trials/${fixture.trialId}`)
      .expect(401);
  });

  it('should return 403 for unauthorized researcher', async () => {
    const response = await request(app)
      .get(`/api/v1/trials/${fixture.trialId}`)
      .set('Authorization', `Bearer ${otherResearcherToken}`)
      .expect(403);

    expect(response.body.success).toBe(false);
  });

  it('should return 404 for non-existent trial', async () => {
    const response = await request(app)
      .get('/api/v1/trials/nonexistent-trial-id')
      .set('Authorization', `Bearer ${researcherToken}`)
      .expect(404);

    expect(response.body.success).toBe(false);
  });
});

// ============================================================================
// UPDATE TRIAL - PATCH /api/v1/trials/:id
// ============================================================================

describe('PATCH /api/v1/trials/:id', () => {
  it('should update trial name', async () => {
    const response = await request(app)
      .patch(`/api/v1/trials/${fixture.trialId}`)
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({ name: 'Updated Trial Name' })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.name).toBe('Updated Trial Name');
  });

  it('should update trial parameters', async () => {
    const newParams = { temperature: 0.9, topP: 0.95 };
    const response = await request(app)
      .patch(`/api/v1/trials/${fixture.trialId}`)
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({ parameters: newParams })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.parameters).toEqual(newParams);
  });

  it('should update trial status and set completedAt', async () => {
    const response = await request(app)
      .patch(`/api/v1/trials/${fixture.trialId}`)
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({ status: 'COMPLETED' })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('COMPLETED');
    expect(response.body.data.completedAt).toBeDefined();
  });

  it('should reject invalid status', async () => {
    const response = await request(app)
      .patch(`/api/v1/trials/${fixture.trialId}`)
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({ status: 'INVALID_STATUS' })
      .expect(422);  // Zod validation returns 422

    expect(response.body.success).toBe(false);
  });

  it('should return 401 without authentication', async () => {
    await request(app)
      .patch(`/api/v1/trials/${fixture.trialId}`)
      .send({ name: 'Updated' })
      .expect(401);
  });

  it('should return 403 for unauthorized researcher', async () => {
    const response = await request(app)
      .patch(`/api/v1/trials/${fixture.trialId}`)
      .set('Authorization', `Bearer ${otherResearcherToken}`)
      .send({ name: 'Updated' })
      .expect(403);

    expect(response.body.success).toBe(false);
  });

  it('should return 404 for non-existent trial', async () => {
    const response = await request(app)
      .patch('/api/v1/trials/nonexistent-trial-id')
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({ name: 'Updated' })
      .expect(404);

    expect(response.body.success).toBe(false);
  });
});

// ============================================================================
// DELETE TRIAL - DELETE /api/v1/trials/:id
// ============================================================================

describe('DELETE /api/v1/trials/:id', () => {
  let trialToDelete: string;

  beforeEach(async () => {
    // Create a trial to delete
    const trial = await prisma.trial.create({
      data: {
        studyId: fixture.studyId,
        sequence: 100,
        name: 'Trial to Delete',
        parameters: '{}',
      },
    });
    trialToDelete = trial.id;
  });

  it('should delete a trial without sessions', async () => {
    await request(app)
      .delete(`/api/v1/trials/${trialToDelete}`)
      .set('Authorization', `Bearer ${researcherToken}`)
      .expect(204);

    // Verify deletion
    const deleted = await prisma.trial.findUnique({
      where: { id: trialToDelete },
    });
    expect(deleted).toBeNull();
  });

  it('should reject deleting trial with sessions', async () => {
    // Add a session to the trial
    await prisma.trial.update({
      where: { id: trialToDelete },
      data: { sessionCount: 1 },
    });

    const response = await request(app)
      .delete(`/api/v1/trials/${trialToDelete}`)
      .set('Authorization', `Bearer ${researcherToken}`)
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.message).toContain('session');
  });

  it('should return 401 without authentication', async () => {
    await request(app)
      .delete(`/api/v1/trials/${trialToDelete}`)
      .expect(401);
  });

  it('should return 403 for unauthorized researcher', async () => {
    const response = await request(app)
      .delete(`/api/v1/trials/${trialToDelete}`)
      .set('Authorization', `Bearer ${otherResearcherToken}`)
      .expect(403);

    expect(response.body.success).toBe(false);
  });

  it('should return 404 for non-existent trial', async () => {
    const response = await request(app)
      .delete('/api/v1/trials/nonexistent-trial-id')
      .set('Authorization', `Bearer ${researcherToken}`)
      .expect(404);

    expect(response.body.success).toBe(false);
  });
});

// ============================================================================
// RUN TRIAL - POST /api/v1/trials/:id/run
// ============================================================================

describe('POST /api/v1/trials/:id/run', () => {
  it('should create sessions for a trial', async () => {
    const response = await request(app)
      .post(`/api/v1/trials/${fixture.trialId}/run`)
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({ sessionCount: 3 })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.sessionsCreated).toBe(3);
    expect(response.body.data.sessions.length).toBe(3);
    expect(response.body.data.sessions[0].id).toBeDefined();

    // Verify trial status changed to RUNNING
    const trial = await prisma.trial.findUnique({
      where: { id: fixture.trialId },
    });
    expect(trial?.status).toBe('RUNNING');
  });

  it('should update session count on trial', async () => {
    await request(app)
      .post(`/api/v1/trials/${fixture.trialId}/run`)
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({ sessionCount: 5 })
      .expect(200);

    const trial = await prisma.trial.findUnique({
      where: { id: fixture.trialId },
    });
    expect(trial?.sessionCount).toBeGreaterThanOrEqual(5);
  });

  it('should reject invalid sessionCount', async () => {
    const response = await request(app)
      .post(`/api/v1/trials/${fixture.trialId}/run`)
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({ sessionCount: 0 })
      .expect(422);  // Zod validation returns 422

    expect(response.body.success).toBe(false);
  });

  it('should reject sessionCount over limit', async () => {
    const response = await request(app)
      .post(`/api/v1/trials/${fixture.trialId}/run`)
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({ sessionCount: 101 })
      .expect(422);  // Zod validation returns 422

    expect(response.body.success).toBe(false);
  });

  it('should return 401 without authentication', async () => {
    await request(app)
      .post(`/api/v1/trials/${fixture.trialId}/run`)
      .send({ sessionCount: 1 })
      .expect(401);
  });

  it('should return 403 for unauthorized researcher', async () => {
    const response = await request(app)
      .post(`/api/v1/trials/${fixture.trialId}/run`)
      .set('Authorization', `Bearer ${otherResearcherToken}`)
      .send({ sessionCount: 1 })
      .expect(403);

    expect(response.body.success).toBe(false);
  });
});

// ============================================================================
// TRIAL RESULTS - GET /api/v1/trials/:id/results
// ============================================================================

describe('GET /api/v1/trials/:id/results', () => {
  beforeEach(async () => {
    // Set up trial with some sessions for results
    await prisma.trial.update({
      where: { id: fixture.trialId },
      data: {
        sessionCount: 5,
        successCount: 4,
        failureCount: 1,
        status: 'COMPLETED',
        completedAt: new Date(),
        metrics: JSON.stringify({ customMetric: 42 }),
      },
    });
  });

  it('should return trial results with statistics', async () => {
    const response = await request(app)
      .get(`/api/v1/trials/${fixture.trialId}/results`)
      .set('Authorization', `Bearer ${researcherToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.trialId).toBe(fixture.trialId);
    expect(response.body.data.parameters).toBeDefined();
    expect(response.body.data.status).toBe('COMPLETED');

    // Session statistics
    expect(response.body.data.sessionStats).toBeDefined();
    expect(response.body.data.sessionStats.total).toBe(5);
    expect(response.body.data.sessionStats.successCount).toBe(4);
    expect(response.body.data.sessionStats.failureCount).toBe(1);
    expect(response.body.data.sessionStats.successRate).toBe(0.8);

    // Custom metrics
    expect(response.body.data.metrics).toEqual({ customMetric: 42 });
  });

  it('should include duration stats when sessions have times', async () => {
    // Create sessions with actual start/end times
    const now = new Date();
    await prisma.session.createMany({
      data: [
        {
          studyId: fixture.studyId,
          trialId: fixture.trialId,
          name: 'Session 1',
          scheduledStart: new Date(now.getTime() - 5000),
          actualStart: new Date(now.getTime() - 5000),
          actualEnd: now,
        },
        {
          studyId: fixture.studyId,
          trialId: fixture.trialId,
          name: 'Session 2',
          scheduledStart: new Date(now.getTime() - 10000),
          actualStart: new Date(now.getTime() - 10000),
          actualEnd: now,
        },
      ],
    });

    const response = await request(app)
      .get(`/api/v1/trials/${fixture.trialId}/results`)
      .set('Authorization', `Bearer ${researcherToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.durationStats).toBeDefined();
    expect(response.body.data.durationStats.mean).toBeGreaterThan(0);
    expect(response.body.data.durationStats.min).toBeGreaterThan(0);
    expect(response.body.data.durationStats.max).toBeGreaterThan(0);
    expect(response.body.data.durationStats.count).toBe(2);
  });

  it('should return null durationStats when no completed sessions', async () => {
    // Remove sessions
    await prisma.session.deleteMany({
      where: { trialId: fixture.trialId },
    });

    const response = await request(app)
      .get(`/api/v1/trials/${fixture.trialId}/results`)
      .set('Authorization', `Bearer ${researcherToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.durationStats).toBeNull();
  });

  it('should return 401 without authentication', async () => {
    await request(app)
      .get(`/api/v1/trials/${fixture.trialId}/results`)
      .expect(401);
  });

  it('should return 403 for unauthorized researcher', async () => {
    const response = await request(app)
      .get(`/api/v1/trials/${fixture.trialId}/results`)
      .set('Authorization', `Bearer ${otherResearcherToken}`)
      .expect(403);

    expect(response.body.success).toBe(false);
  });

  it('should return 404 for non-existent trial', async () => {
    const response = await request(app)
      .get('/api/v1/trials/nonexistent-trial-id/results')
      .set('Authorization', `Bearer ${researcherToken}`)
      .expect(404);

    expect(response.body.success).toBe(false);
  });
});
