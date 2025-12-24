/**
 * Integration tests for Experiments API endpoints (RFC 003)
 *
 * Tests the experiment execution management endpoints:
 * - GET /experiments - List experiments
 * - POST /experiments - Create experiment
 * - GET /experiments/:id - Get single experiment
 * - PATCH /experiments/:id - Update experiment
 * - DELETE /experiments/:id - Delete experiment
 * - POST /experiments/:id/start - Start experiment execution
 * - POST /experiments/:id/cancel - Cancel experiment
 * - GET /experiments/:id/runs - Get experiment runs
 * - GET /experiments/:id/results - Get aggregated results
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
  designId: string;
  conditionIds: string[];
  experimentId: string;
}

let app: Express;
let fixture: TestFixture;
let researcherToken: string;
let otherResearcherToken: string;

const validExperiment = {
  name: 'Test Experiment',
  description: 'A test experiment for unit testing',
  hypothesis: 'Testing improves code quality',
  runsPerCondition: 3,
};

/**
 * Create test fixtures for all tests
 */
async function createTestFixtures(): Promise<TestFixture> {
  // Clean up any leftover data from previous runs
  await prisma.researcher.deleteMany({
    where: {
      email: {
        in: ['experiments-test@test.com', 'experiments-other@test.com']
      }
    }
  }).catch(() => {});

  // Create fixtures
  return await prisma.$transaction(async (tx) => {
    // Create primary researcher
    const researcher = await tx.researcher.create({
      data: {
        email: 'experiments-test@test.com',
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
        email: 'experiments-other@test.com',
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
        name: 'Experiments Test Project',
        researcherId: researcher.id,
      },
    });

    // Create study
    const study = await tx.study.create({
      data: {
        name: 'Experiments Test Study',
        projectId: project.id,
        type: 'SINGLE_PARTICIPANT',
        status: 'ACTIVE',
        config: JSON.stringify({}),
      },
    });

    // Create experiment design
    const design = await tx.experimentDesign.create({
      data: {
        studyId: study.id,
        name: 'Test Design',
        description: 'A test experiment design',
        variables: JSON.stringify([]),
        designType: 'FULL_FACTORIAL',
        dependentVariables: JSON.stringify([]),
      },
    });

    // Create experimental conditions
    const condition1 = await tx.experimentalCondition.create({
      data: {
        experimentId: design.id,
        name: 'Control',
        variableLevels: JSON.stringify({}),
        resolvedConfig: JSON.stringify({ type: 'control' }),
      },
    });

    const condition2 = await tx.experimentalCondition.create({
      data: {
        experimentId: design.id,
        name: 'Treatment',
        variableLevels: JSON.stringify({}),
        resolvedConfig: JSON.stringify({ type: 'treatment' }),
      },
    });

    // Create an existing experiment
    const experiment = await tx.experiment.create({
      data: {
        designId: design.id,
        name: 'Existing Test Experiment',
        description: 'An existing experiment for testing',
        status: 'DRAFT',
        runsPerCondition: 1,
        progress: JSON.stringify({}),
      },
    });

    return {
      researcherId: researcher.id,
      otherResearcherId: otherResearcher.id,
      projectId: project.id,
      studyId: study.id,
      designId: design.id,
      conditionIds: [condition1.id, condition2.id],
      experimentId: experiment.id,
    };
  });
}

/**
 * Clean up test fixtures
 */
async function cleanupTestFixtures(fixtureToClean: TestFixture | undefined) {
  if (!fixtureToClean) return;

  // Delete in reverse order of creation due to foreign keys
  await prisma.experimentRun.deleteMany({
    where: { experiment: { designId: fixtureToClean.designId } }
  }).catch(() => {});

  await prisma.experiment.deleteMany({
    where: { designId: fixtureToClean.designId }
  }).catch(() => {});

  await prisma.experimentalCondition.deleteMany({
    where: { experimentId: fixtureToClean.designId }
  }).catch(() => {});

  await prisma.experimentDesign.deleteMany({
    where: { id: fixtureToClean.designId }
  }).catch(() => {});

  await prisma.study.deleteMany({
    where: { id: fixtureToClean.studyId }
  }).catch(() => {});

  await prisma.project.deleteMany({
    where: { id: fixtureToClean.projectId }
  }).catch(() => {});

  await prisma.researcher.deleteMany({
    where: {
      id: { in: [fixtureToClean.researcherId, fixtureToClean.otherResearcherId] }
    }
  }).catch(() => {});
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
    'experiments-test@test.com',
    ResearcherRole.RESEARCHER,
    AccountStatus.ACTIVE
  );
  otherResearcherToken = generateResearcherToken(
    fixture.otherResearcherId,
    'experiments-other@test.com',
    ResearcherRole.RESEARCHER,
    AccountStatus.ACTIVE
  );
});

afterAll(async () => {
  await cleanupTestFixtures(fixture);
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Clean up experiments between tests (except the fixture one)
  await prisma.experimentRun.deleteMany({
    where: {
      experiment: {
        designId: fixture.designId,
        id: { not: fixture.experimentId }
      }
    }
  });
  await prisma.experiment.deleteMany({
    where: {
      designId: fixture.designId,
      id: { not: fixture.experimentId }
    }
  });

  // Reset fixture experiment to DRAFT status
  await prisma.experiment.update({
    where: { id: fixture.experimentId },
    data: {
      status: 'DRAFT',
      queuedAt: null,
      startedAt: null,
      completedAt: null,
      error: null,
      progress: JSON.stringify({}),
    }
  });

  // Clean up any runs from fixture experiment
  await prisma.experimentRun.deleteMany({
    where: { experimentId: fixture.experimentId }
  });
});

// ============================================================================
// Authentication Tests
// ============================================================================

describe('Authentication', () => {
  it('should reject unauthenticated requests to list', async () => {
    const res = await request(app)
      .get('/api/v1/experiments');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('should reject unauthenticated requests to create', async () => {
    const res = await request(app)
      .post('/api/v1/experiments')
      .send({ ...validExperiment, designId: fixture.designId });

    expect(res.status).toBe(401);
  });

  it('should reject invalid token', async () => {
    const res = await request(app)
      .get('/api/v1/experiments')
      .set('Authorization', 'Bearer invalid-token');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });
});

// ============================================================================
// GET /experiments - List Experiments
// ============================================================================

describe('GET /api/v1/experiments', () => {
  it('should list experiments owned by researcher', async () => {
    const res = await request(app)
      .get('/api/v1/experiments')
      .set('Authorization', `Bearer ${researcherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.experiments)).toBe(true);
    expect(res.body.data.pagination).toBeDefined();
    expect(res.body.data.pagination.pageSize).toBe(20);
  });

  it('should include the fixture experiment', async () => {
    const res = await request(app)
      .get('/api/v1/experiments')
      .set('Authorization', `Bearer ${researcherToken}`);

    expect(res.status).toBe(200);
    const found = res.body.data.experiments.find(
      (e: { id: string }) => e.id === fixture.experimentId
    );
    expect(found).toBeDefined();
    expect(found.name).toBe('Existing Test Experiment');
  });

  it('should filter by designId', async () => {
    const res = await request(app)
      .get('/api/v1/experiments')
      .query({ designId: fixture.designId })
      .set('Authorization', `Bearer ${researcherToken}`);

    expect(res.status).toBe(200);
    res.body.data.experiments.forEach((e: { design: { id: string } }) => {
      expect(e.design.id).toBe(fixture.designId);
    });
  });

  it('should filter by status', async () => {
    const res = await request(app)
      .get('/api/v1/experiments')
      .query({ status: 'DRAFT' })
      .set('Authorization', `Bearer ${researcherToken}`);

    expect(res.status).toBe(200);
    res.body.data.experiments.forEach((e: { status: string }) => {
      expect(e.status).toBe('DRAFT');
    });
  });

  it('should paginate results', async () => {
    const res = await request(app)
      .get('/api/v1/experiments')
      .query({ page: 1, pageSize: 1 })
      .set('Authorization', `Bearer ${researcherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.page).toBe(1);
    expect(res.body.data.pagination.pageSize).toBe(1);
    expect(res.body.data.experiments.length).toBeLessThanOrEqual(1);
  });

  it('should not return experiments from other researchers', async () => {
    const res = await request(app)
      .get('/api/v1/experiments')
      .set('Authorization', `Bearer ${otherResearcherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.experiments).toHaveLength(0);
  });
});

// ============================================================================
// POST /experiments - Create Experiment
// ============================================================================

describe('POST /api/v1/experiments', () => {
  it('should create a new experiment', async () => {
    const res = await request(app)
      .post('/api/v1/experiments')
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({ ...validExperiment, designId: fixture.designId });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe(validExperiment.name);
    expect(res.body.data.description).toBe(validExperiment.description);
    expect(res.body.data.hypothesis).toBe(validExperiment.hypothesis);
    expect(res.body.data.runsPerCondition).toBe(validExperiment.runsPerCondition);
    expect(res.body.data.status).toBe('DRAFT');
  });

  it('should require designId', async () => {
    const res = await request(app)
      .post('/api/v1/experiments')
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({ name: 'No Design' });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('should require name', async () => {
    const res = await request(app)
      .post('/api/v1/experiments')
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({ designId: fixture.designId });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('should reject non-existent designId', async () => {
    const res = await request(app)
      .post('/api/v1/experiments')
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({
        ...validExperiment,
        designId: '00000000-0000-0000-0000-000000000000'
      });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('should reject design from another researcher', async () => {
    const res = await request(app)
      .post('/api/v1/experiments')
      .set('Authorization', `Bearer ${otherResearcherToken}`)
      .send({ ...validExperiment, designId: fixture.designId });

    expect(res.status).toBe(403);
  });

  it('should use default runsPerCondition of 1', async () => {
    const res = await request(app)
      .post('/api/v1/experiments')
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({
        designId: fixture.designId,
        name: 'Default Runs Experiment'
      });

    expect(res.status).toBe(201);
    expect(res.body.data.runsPerCondition).toBe(1);
  });

  it('should validate runsPerCondition bounds', async () => {
    const res = await request(app)
      .post('/api/v1/experiments')
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({
        ...validExperiment,
        designId: fixture.designId,
        runsPerCondition: 10000 // exceeds max of 1000
      });

    expect(res.status).toBe(422);
  });
});

// ============================================================================
// GET /experiments/:id - Get Single Experiment
// ============================================================================

describe('GET /api/v1/experiments/:id', () => {
  it('should return experiment details', async () => {
    const res = await request(app)
      .get(`/api/v1/experiments/${fixture.experimentId}`)
      .set('Authorization', `Bearer ${researcherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(fixture.experimentId);
    expect(res.body.data.design).toBeDefined();
    expect(res.body.data.design.conditions).toBeDefined();
  });

  it('should return 404 for non-existent experiment', async () => {
    const res = await request(app)
      .get('/api/v1/experiments/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${researcherToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('should deny access to other researcher', async () => {
    const res = await request(app)
      .get(`/api/v1/experiments/${fixture.experimentId}`)
      .set('Authorization', `Bearer ${otherResearcherToken}`);

    expect(res.status).toBe(403);
  });
});

// ============================================================================
// PATCH /experiments/:id - Update Experiment
// ============================================================================

describe('PATCH /api/v1/experiments/:id', () => {
  it('should update experiment', async () => {
    const res = await request(app)
      .patch(`/api/v1/experiments/${fixture.experimentId}`)
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({
        name: 'Updated Experiment Name',
        description: 'Updated description',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Updated Experiment Name');
    expect(res.body.data.description).toBe('Updated description');
  });

  it('should allow partial updates', async () => {
    const originalName = 'Existing Test Experiment';
    const res = await request(app)
      .patch(`/api/v1/experiments/${fixture.experimentId}`)
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({ hypothesis: 'New hypothesis' });

    expect(res.status).toBe(200);
    expect(res.body.data.hypothesis).toBe('New hypothesis');
  });

  it('should prevent updating running experiment', async () => {
    // Set experiment to RUNNING
    await prisma.experiment.update({
      where: { id: fixture.experimentId },
      data: { status: 'RUNNING' }
    });

    const res = await request(app)
      .patch(`/api/v1/experiments/${fixture.experimentId}`)
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({ name: 'Should Not Update' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('should deny access to other researcher', async () => {
    const res = await request(app)
      .patch(`/api/v1/experiments/${fixture.experimentId}`)
      .set('Authorization', `Bearer ${otherResearcherToken}`)
      .send({ name: 'Hijacked' });

    expect(res.status).toBe(403);
  });
});

// ============================================================================
// DELETE /experiments/:id - Delete Experiment
// ============================================================================

describe('DELETE /api/v1/experiments/:id', () => {
  let deletableExperimentId: string;

  beforeEach(async () => {
    const experiment = await prisma.experiment.create({
      data: {
        designId: fixture.designId,
        name: 'Deletable Experiment',
        status: 'DRAFT',
        runsPerCondition: 1,
        progress: JSON.stringify({}),
      }
    });
    deletableExperimentId = experiment.id;
  });

  it('should delete experiment', async () => {
    const res = await request(app)
      .delete(`/api/v1/experiments/${deletableExperimentId}`)
      .set('Authorization', `Bearer ${researcherToken}`);

    expect(res.status).toBe(204);

    // Verify deletion
    const deleted = await prisma.experiment.findUnique({
      where: { id: deletableExperimentId }
    });
    expect(deleted).toBeNull();
  });

  it('should prevent deleting running experiment', async () => {
    await prisma.experiment.update({
      where: { id: deletableExperimentId },
      data: { status: 'RUNNING' }
    });

    const res = await request(app)
      .delete(`/api/v1/experiments/${deletableExperimentId}`)
      .set('Authorization', `Bearer ${researcherToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('should return 404 for non-existent experiment', async () => {
    const res = await request(app)
      .delete('/api/v1/experiments/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${researcherToken}`);

    expect(res.status).toBe(404);
  });

  it('should deny access to other researcher', async () => {
    const res = await request(app)
      .delete(`/api/v1/experiments/${deletableExperimentId}`)
      .set('Authorization', `Bearer ${otherResearcherToken}`);

    expect(res.status).toBe(403);
  });
});

// ============================================================================
// POST /experiments/:id/start - Start Experiment
// ============================================================================

describe('POST /api/v1/experiments/:id/start', () => {
  it('should queue experiment for execution', async () => {
    const res = await request(app)
      .post(`/api/v1/experiments/${fixture.experimentId}/start`)
      .set('Authorization', `Bearer ${researcherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('QUEUED');
    expect(res.body.message).toContain('runs');

    // Verify runs were created
    const runs = await prisma.experimentRun.count({
      where: { experimentId: fixture.experimentId }
    });
    // 2 conditions x 1 runsPerCondition = 2 runs
    expect(runs).toBe(2);
  });

  it('should create runs for all conditions', async () => {
    await request(app)
      .post(`/api/v1/experiments/${fixture.experimentId}/start`)
      .set('Authorization', `Bearer ${researcherToken}`);

    const runs = await prisma.experimentRun.findMany({
      where: { experimentId: fixture.experimentId }
    });

    const conditionIds = runs.map(r => r.conditionId);
    expect(conditionIds).toContain(fixture.conditionIds[0]);
    expect(conditionIds).toContain(fixture.conditionIds[1]);
  });

  it('should reject starting non-DRAFT experiment', async () => {
    await prisma.experiment.update({
      where: { id: fixture.experimentId },
      data: { status: 'QUEUED' }
    });

    const res = await request(app)
      .post(`/api/v1/experiments/${fixture.experimentId}/start`)
      .set('Authorization', `Bearer ${researcherToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('should allow starting FAILED experiment', async () => {
    await prisma.experiment.update({
      where: { id: fixture.experimentId },
      data: { status: 'FAILED' }
    });

    const res = await request(app)
      .post(`/api/v1/experiments/${fixture.experimentId}/start`)
      .set('Authorization', `Bearer ${researcherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('QUEUED');
  });

  it('should deny access to other researcher', async () => {
    const res = await request(app)
      .post(`/api/v1/experiments/${fixture.experimentId}/start`)
      .set('Authorization', `Bearer ${otherResearcherToken}`);

    expect(res.status).toBe(403);
  });
});

// ============================================================================
// POST /experiments/:id/cancel - Cancel Experiment
// ============================================================================

describe('POST /api/v1/experiments/:id/cancel', () => {
  beforeEach(async () => {
    // Set up experiment in QUEUED state with runs
    await prisma.experiment.update({
      where: { id: fixture.experimentId },
      data: { status: 'QUEUED', queuedAt: new Date() }
    });

    await prisma.experimentRun.createMany({
      data: fixture.conditionIds.map(conditionId => ({
        experimentId: fixture.experimentId,
        conditionId,
        status: 'PENDING',
        outputs: '{}',
        metrics: '{}',
      }))
    });
  });

  it('should cancel queued experiment', async () => {
    const res = await request(app)
      .post(`/api/v1/experiments/${fixture.experimentId}/cancel`)
      .set('Authorization', `Bearer ${researcherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('CANCELLED');
  });

  it('should mark pending runs as failed', async () => {
    await request(app)
      .post(`/api/v1/experiments/${fixture.experimentId}/cancel`)
      .set('Authorization', `Bearer ${researcherToken}`);

    const runs = await prisma.experimentRun.findMany({
      where: { experimentId: fixture.experimentId }
    });

    runs.forEach(run => {
      expect(run.status).toBe('FAILED');
      expect(run.error).toBe('Experiment cancelled');
    });
  });

  it('should cancel running experiment', async () => {
    await prisma.experiment.update({
      where: { id: fixture.experimentId },
      data: { status: 'RUNNING' }
    });

    const res = await request(app)
      .post(`/api/v1/experiments/${fixture.experimentId}/cancel`)
      .set('Authorization', `Bearer ${researcherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');
  });

  it('should reject cancelling non-running/non-queued experiment', async () => {
    await prisma.experiment.update({
      where: { id: fixture.experimentId },
      data: { status: 'COMPLETED' }
    });

    const res = await request(app)
      .post(`/api/v1/experiments/${fixture.experimentId}/cancel`)
      .set('Authorization', `Bearer ${researcherToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('should deny access to other researcher', async () => {
    const res = await request(app)
      .post(`/api/v1/experiments/${fixture.experimentId}/cancel`)
      .set('Authorization', `Bearer ${otherResearcherToken}`);

    expect(res.status).toBe(403);
  });
});

// ============================================================================
// GET /experiments/:id/runs - Get Experiment Runs
// ============================================================================

describe('GET /api/v1/experiments/:id/runs', () => {
  beforeEach(async () => {
    // Create test runs
    await prisma.experimentRun.createMany({
      data: [
        {
          experimentId: fixture.experimentId,
          conditionId: fixture.conditionIds[0],
          status: 'COMPLETED',
          outputs: '{}',
          metrics: JSON.stringify({ accuracy: 0.95 }),
        },
        {
          experimentId: fixture.experimentId,
          conditionId: fixture.conditionIds[1],
          status: 'PENDING',
          outputs: '{}',
          metrics: '{}',
        },
      ]
    });
  });

  it('should return runs for experiment', async () => {
    const res = await request(app)
      .get(`/api/v1/experiments/${fixture.experimentId}/runs`)
      .set('Authorization', `Bearer ${researcherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.runs)).toBe(true);
    expect(res.body.data.runs.length).toBe(2);
    expect(res.body.data.pagination).toBeDefined();
  });

  it('should filter by status', async () => {
    const res = await request(app)
      .get(`/api/v1/experiments/${fixture.experimentId}/runs`)
      .query({ status: 'COMPLETED' })
      .set('Authorization', `Bearer ${researcherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.runs.length).toBe(1);
    expect(res.body.data.runs[0].status).toBe('COMPLETED');
  });

  it('should filter by conditionId', async () => {
    const res = await request(app)
      .get(`/api/v1/experiments/${fixture.experimentId}/runs`)
      .query({ conditionId: fixture.conditionIds[0] })
      .set('Authorization', `Bearer ${researcherToken}`);

    expect(res.status).toBe(200);
    res.body.data.runs.forEach((run: { conditionId: string }) => {
      expect(run.conditionId).toBe(fixture.conditionIds[0]);
    });
  });

  it('should paginate results', async () => {
    const res = await request(app)
      .get(`/api/v1/experiments/${fixture.experimentId}/runs`)
      .query({ page: 1, pageSize: 1 })
      .set('Authorization', `Bearer ${researcherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.runs.length).toBe(1);
    expect(res.body.data.pagination.page).toBe(1);
    expect(res.body.data.pagination.pageSize).toBe(1);
    expect(res.body.data.pagination.hasNext).toBe(true);
  });

  it('should deny access to other researcher', async () => {
    const res = await request(app)
      .get(`/api/v1/experiments/${fixture.experimentId}/runs`)
      .set('Authorization', `Bearer ${otherResearcherToken}`);

    expect(res.status).toBe(403);
  });
});

// ============================================================================
// GET /experiments/:id/results - Get Aggregated Results
// ============================================================================

describe('GET /api/v1/experiments/:id/results', () => {
  beforeEach(async () => {
    // Create completed runs with metrics
    await prisma.experimentRun.createMany({
      data: [
        {
          experimentId: fixture.experimentId,
          conditionId: fixture.conditionIds[0],
          status: 'COMPLETED',
          outputs: '{}',
          metrics: JSON.stringify({ accuracy: 0.90, latency: 100 }),
        },
        {
          experimentId: fixture.experimentId,
          conditionId: fixture.conditionIds[0],
          status: 'COMPLETED',
          outputs: '{}',
          metrics: JSON.stringify({ accuracy: 0.95, latency: 110 }),
        },
        {
          experimentId: fixture.experimentId,
          conditionId: fixture.conditionIds[1],
          status: 'COMPLETED',
          outputs: '{}',
          metrics: JSON.stringify({ accuracy: 0.85, latency: 90 }),
        },
      ]
    });
  });

  it('should return aggregated results', async () => {
    const res = await request(app)
      .get(`/api/v1/experiments/${fixture.experimentId}/results`)
      .set('Authorization', `Bearer ${researcherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.experimentId).toBe(fixture.experimentId);
    expect(res.body.data.resultsByCondition).toBeDefined();
  });

  it('should compute statistics per condition', async () => {
    const res = await request(app)
      .get(`/api/v1/experiments/${fixture.experimentId}/results`)
      .set('Authorization', `Bearer ${researcherToken}`);

    expect(res.status).toBe(200);

    // Check Control condition (2 runs)
    const controlResult = res.body.data.resultsByCondition[fixture.conditionIds[0]];
    expect(controlResult).toBeDefined();
    expect(controlResult.runCount).toBe(2);
    expect(controlResult.metrics.accuracy).toBeDefined();
    expect(controlResult.metrics.accuracy.mean).toBeCloseTo(0.925, 2);

    // Check Treatment condition (1 run)
    const treatmentResult = res.body.data.resultsByCondition[fixture.conditionIds[1]];
    expect(treatmentResult).toBeDefined();
    expect(treatmentResult.runCount).toBe(1);
    expect(treatmentResult.metrics.accuracy.mean).toBeCloseTo(0.85, 2);
  });

  it('should include standard deviation', async () => {
    const res = await request(app)
      .get(`/api/v1/experiments/${fixture.experimentId}/results`)
      .set('Authorization', `Bearer ${researcherToken}`);

    expect(res.status).toBe(200);

    const controlResult = res.body.data.resultsByCondition[fixture.conditionIds[0]];
    expect(controlResult.metrics.accuracy.std).toBeDefined();
    expect(typeof controlResult.metrics.accuracy.std).toBe('number');
  });

  it('should only count COMPLETED runs', async () => {
    // Add a pending run
    await prisma.experimentRun.create({
      data: {
        experimentId: fixture.experimentId,
        conditionId: fixture.conditionIds[0],
        status: 'PENDING',
        outputs: '{}',
        metrics: JSON.stringify({ accuracy: 0.50 }), // Should be ignored
      }
    });

    const res = await request(app)
      .get(`/api/v1/experiments/${fixture.experimentId}/results`)
      .set('Authorization', `Bearer ${researcherToken}`);

    expect(res.status).toBe(200);
    // Still should have 3 completed runs
    expect(res.body.data.completedRuns).toBe(3);
  });

  it('should deny access to other researcher', async () => {
    const res = await request(app)
      .get(`/api/v1/experiments/${fixture.experimentId}/results`)
      .set('Authorization', `Bearer ${otherResearcherToken}`);

    expect(res.status).toBe(404); // Combined ownership check returns 404
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  it('should handle experiment with no runs', async () => {
    const res = await request(app)
      .get(`/api/v1/experiments/${fixture.experimentId}/results`)
      .set('Authorization', `Bearer ${researcherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.totalRuns).toBe(0);
    expect(res.body.data.completedRuns).toBe(0);
  });

  it('should handle experiment with empty metrics', async () => {
    await prisma.experimentRun.create({
      data: {
        experimentId: fixture.experimentId,
        conditionId: fixture.conditionIds[0],
        status: 'COMPLETED',
        outputs: '{}',
        metrics: '{}', // Empty metrics
      }
    });

    const res = await request(app)
      .get(`/api/v1/experiments/${fixture.experimentId}/results`)
      .set('Authorization', `Bearer ${researcherToken}`);

    expect(res.status).toBe(200);
    const controlResult = res.body.data.resultsByCondition[fixture.conditionIds[0]];
    expect(controlResult.runCount).toBe(1);
    expect(Object.keys(controlResult.metrics)).toHaveLength(0);
  });

  it('should return 404 for non-existent experiment ID', async () => {
    const res = await request(app)
      .get('/api/v1/experiments/non-existent-id')
      .set('Authorization', `Bearer ${researcherToken}`);

    expect(res.status).toBe(404);
  });

  it('should handle very long experiment names', async () => {
    const res = await request(app)
      .post('/api/v1/experiments')
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({
        designId: fixture.designId,
        name: 'a'.repeat(256) // exceeds 255 char limit
      });

    expect(res.status).toBe(422);
  });

  it('should handle negative runsPerCondition', async () => {
    const res = await request(app)
      .post('/api/v1/experiments')
      .set('Authorization', `Bearer ${researcherToken}`)
      .send({
        designId: fixture.designId,
        name: 'Negative Runs',
        runsPerCondition: -1
      });

    expect(res.status).toBe(422);
  });

  // ============================================================================
  // Phase 2c: Prompt Integration Tests
  // ============================================================================

  describe('PATCH /api/v1/experiments/:id/conditions/:conditionId/prompt', () => {
    let promptVersionId: string;
    let modelConfigId: string;
    let promptTemplateId: string;

    beforeEach(async () => {
      // Create a prompt template and version for testing
      const template = await prisma.promptTemplate.create({
        data: {
          studyId: fixture.studyId,
          name: 'Test Prompt Template',
          description: 'For integration testing',
        },
      });
      promptTemplateId = template.id;

      const version = await prisma.promptVersion.create({
        data: {
          templateId: template.id,
          version: 1,
          contentHash: 'test-hash-' + Date.now(),
          systemPrompt: 'You are a test assistant.',
          userPromptTemplate: 'Hello {{name}}',
          templateVariables: JSON.stringify([{ name: 'name', type: 'string', required: true }]),
          fewShotExamples: JSON.stringify([]),
          toolDefinitions: JSON.stringify([]),
        },
      });
      promptVersionId = version.id;

      // Create a model config
      const config = await prisma.modelConfig.create({
        data: {
          studyId: fixture.studyId,
          name: 'Test Model Config',
          provider: 'openai',
          model: 'gpt-4',
          temperature: 0.7,
          maxTokens: 1024,
          stopSequences: JSON.stringify([]),
          costPerInputToken: 0.01,
          costPerOutputToken: 0.03,
        },
      });
      modelConfigId = config.id;
    });

    afterEach(async () => {
      // Clean up prompt resources
      await prisma.promptVersion.deleteMany({ where: { templateId: promptTemplateId } }).catch(() => {});
      await prisma.promptTemplate.deleteMany({ where: { id: promptTemplateId } }).catch(() => {});
      await prisma.modelConfig.deleteMany({ where: { id: modelConfigId } }).catch(() => {});
    });

    it('should set prompt version on a condition', async () => {
      const res = await request(app)
        .patch(`/api/v1/experiments/${fixture.experimentId}/conditions/${fixture.conditionIds[0]}/prompt`)
        .set('Authorization', `Bearer ${researcherToken}`)
        .send({
          promptVersionId,
          modelConfigId,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.promptVersion.id).toBe(promptVersionId);
      expect(res.body.data.modelConfig.id).toBe(modelConfigId);
    });

    it('should clear prompt references with null values', async () => {
      // First set the references
      await request(app)
        .patch(`/api/v1/experiments/${fixture.experimentId}/conditions/${fixture.conditionIds[0]}/prompt`)
        .set('Authorization', `Bearer ${researcherToken}`)
        .send({ promptVersionId, modelConfigId });

      // Then clear them
      const res = await request(app)
        .patch(`/api/v1/experiments/${fixture.experimentId}/conditions/${fixture.conditionIds[0]}/prompt`)
        .set('Authorization', `Bearer ${researcherToken}`)
        .send({
          promptVersionId: null,
          modelConfigId: null,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.promptVersion).toBeNull();
      expect(res.body.data.modelConfig).toBeNull();
    });

    it('should reject invalid prompt version ID', async () => {
      const res = await request(app)
        .patch(`/api/v1/experiments/${fixture.experimentId}/conditions/${fixture.conditionIds[0]}/prompt`)
        .set('Authorization', `Bearer ${researcherToken}`)
        .send({
          promptVersionId: 'invalid-id',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Prompt version not found');
    });

    it('should reject access to other researcher conditions', async () => {
      const res = await request(app)
        .patch(`/api/v1/experiments/${fixture.experimentId}/conditions/${fixture.conditionIds[0]}/prompt`)
        .set('Authorization', `Bearer ${otherResearcherToken}`)
        .send({ promptVersionId });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/experiments/:id/conditions/:conditionId/prompt', () => {
    let promptVersionId: string;
    let modelConfigId: string;
    let promptTemplateId: string;

    beforeEach(async () => {
      // Create prompt template and version
      const template = await prisma.promptTemplate.create({
        data: {
          studyId: fixture.studyId,
          name: 'Resolve Test Template',
          description: 'For prompt resolution testing',
        },
      });
      promptTemplateId = template.id;

      const version = await prisma.promptVersion.create({
        data: {
          templateId: template.id,
          version: 1,
          contentHash: 'resolve-test-hash-' + Date.now(),
          systemPrompt: 'You are a helpful assistant.',
          userPromptTemplate: 'Answer: {{question}}',
          templateVariables: JSON.stringify([{ name: 'question', type: 'string', required: true }]),
          fewShotExamples: JSON.stringify([{ input: 'Hi', output: 'Hello!' }]),
          outputSchema: JSON.stringify({ type: 'object', properties: { answer: { type: 'string' } } }),
          toolDefinitions: JSON.stringify([]),
        },
      });
      promptVersionId = version.id;

      // Create model config
      const config = await prisma.modelConfig.create({
        data: {
          studyId: fixture.studyId,
          name: 'Resolve Test Config',
          provider: 'anthropic',
          model: 'claude-3-opus',
          temperature: 0.5,
          maxTokens: 2048,
          stopSequences: JSON.stringify(['END']),
          costPerInputToken: 0.015,
          costPerOutputToken: 0.075,
        },
      });
      modelConfigId = config.id;

      // Set prompt on condition
      await prisma.experimentalCondition.update({
        where: { id: fixture.conditionIds[0] },
        data: { promptVersionId, modelConfigId },
      });
    });

    afterEach(async () => {
      // Clear condition references
      await prisma.experimentalCondition.update({
        where: { id: fixture.conditionIds[0] },
        data: { promptVersionId: null, modelConfigId: null },
      }).catch(() => {});

      // Clean up
      await prisma.promptVersion.deleteMany({ where: { templateId: promptTemplateId } }).catch(() => {});
      await prisma.promptTemplate.deleteMany({ where: { id: promptTemplateId } }).catch(() => {});
      await prisma.modelConfig.deleteMany({ where: { id: modelConfigId } }).catch(() => {});
    });

    it('should resolve prompt configuration for a condition', async () => {
      const res = await request(app)
        .get(`/api/v1/experiments/${fixture.experimentId}/conditions/${fixture.conditionIds[0]}/prompt`)
        .set('Authorization', `Bearer ${researcherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.systemPrompt).toBe('You are a helpful assistant.');
      expect(res.body.data.userPromptTemplate).toBe('Answer: {{question}}');
      expect(res.body.data.templateVariables).toHaveLength(1);
      expect(res.body.data.fewShotExamples).toHaveLength(1);
      expect(res.body.data.outputSchema).toBeDefined();
      expect(res.body.data.modelConfig.provider).toBe('anthropic');
      expect(res.body.data.modelConfig.temperature).toBe(0.5);
    });

    it('should return 404 for condition without prompt config', async () => {
      // Use condition without prompt config
      const res = await request(app)
        .get(`/api/v1/experiments/${fixture.experimentId}/conditions/${fixture.conditionIds[1]}/prompt`)
        .set('Authorization', `Bearer ${researcherToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.message).toContain('No prompt configuration');
    });
  });

  describe('POST /api/v1/experiments/:id/estimate-cost', () => {
    let modelConfigId: string;

    beforeEach(async () => {
      // Create model config with cost rates
      const config = await prisma.modelConfig.create({
        data: {
          studyId: fixture.studyId,
          name: 'Cost Test Config',
          provider: 'openai',
          model: 'gpt-4',
          temperature: 0.7,
          maxTokens: 1024,
          stopSequences: JSON.stringify([]),
          costPerInputToken: 0.01,
          costPerOutputToken: 0.03,
        },
      });
      modelConfigId = config.id;

      // Set model config on first condition
      await prisma.experimentalCondition.update({
        where: { id: fixture.conditionIds[0] },
        data: { modelConfigId },
      });
    });

    afterEach(async () => {
      await prisma.experimentalCondition.update({
        where: { id: fixture.conditionIds[0] },
        data: { modelConfigId: null },
      }).catch(() => {});
      await prisma.modelConfig.deleteMany({ where: { id: modelConfigId } }).catch(() => {});
    });

    it('should estimate cost for experiment', async () => {
      const res = await request(app)
        .post(`/api/v1/experiments/${fixture.experimentId}/estimate-cost`)
        .set('Authorization', `Bearer ${researcherToken}`)
        .query({ inputTokens: 1000, outputTokens: 500 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalConditions).toBe(2);
      // At least one condition should have cost configured
      expect(res.body.data.conditionsWithCost).toBeGreaterThanOrEqual(1);
      expect(res.body.data.totalEstimatedCost).toBeGreaterThan(0);
      expect(res.body.data.currency).toBe('USD');
      expect(res.body.data.breakdown).toHaveLength(2);
    });

    it('should report conditions without cost configuration', async () => {
      // Clear model config from second condition to ensure it has no cost
      await prisma.experimentalCondition.update({
        where: { id: fixture.conditionIds[1] },
        data: { modelConfigId: null },
      });

      const res = await request(app)
        .post(`/api/v1/experiments/${fixture.experimentId}/estimate-cost`)
        .set('Authorization', `Bearer ${researcherToken}`);

      expect(res.status).toBe(200);
      // Second condition should have no model config
      const noCostCondition = res.body.data.breakdown.find(
        (c: { conditionId: string }) => c.conditionId === fixture.conditionIds[1]
      );
      expect(noCostCondition).toBeDefined();
      expect(noCostCondition.estimatedCost).toBeNull();
      expect(noCostCondition.reason).toBe('No model config set');
    });

    it('should use custom token estimates from query params', async () => {
      const res = await request(app)
        .post(`/api/v1/experiments/${fixture.experimentId}/estimate-cost`)
        .set('Authorization', `Bearer ${researcherToken}`)
        .query({ inputTokens: 2000, outputTokens: 1000 });

      expect(res.status).toBe(200);
      expect(res.body.data.assumptions.inputTokensPerRun).toBe(2000);
      expect(res.body.data.assumptions.outputTokensPerRun).toBe(1000);
    });
  });
});
