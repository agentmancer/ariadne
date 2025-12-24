/**
 * End-to-End Integration Tests for Trials and Orchestration (RFC-002 Phase 4)
 *
 * Tests the complete API workflow for trials:
 * 1. Create test study with conditions and trials
 * 2. Run sessions and track progress
 * 3. Verify metrics collection
 * 4. Validate results aggregation
 *
 * Note: SymbiotePlugin unit tests are in packages/modules/symbiote/__tests__
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../../app';
import { prisma } from '../../lib/prisma';
import { generateResearcherToken } from '../../middleware/auth';
import { ResearcherRole, AccountStatus } from '@ariadne/shared';
import {
  aggregateTrialResults,
  compareTrials,
  exportTrialResults,
  exportStudyTrialComparison,
} from '../../services/trial-aggregation';

// ============================================================================
// Test Fixtures & Helpers
// ============================================================================

// Use unique email to avoid collisions with other test files
const TEST_EMAIL = `e2e-trials-${Date.now()}@test.com`;

interface TestFixture {
  researcherId: string;
  projectId: string;
  studyId: string;
  conditionIds: string[];
  trialIds: string[];
}

let app: Express;
let fixture: TestFixture;
let researcherToken: string;

/**
 * Create test fixtures with multiple conditions and trials
 */
async function createTestFixtures(): Promise<TestFixture> {
  return await prisma.$transaction(async (tx) => {
    // Create researcher
    const researcher = await tx.researcher.create({
      data: {
        email: TEST_EMAIL,
        passwordHash: 'hash',
        name: 'E2E Test Researcher',
        role: 'RESEARCHER',
        status: 'ACTIVE',
        settings: {},
      },
    });

    // Create project
    const project = await tx.project.create({
      data: {
        name: 'E2E Test Project',
        researcherId: researcher.id,
      },
    });

    // Create study
    const study = await tx.study.create({
      data: {
        name: 'E2E Orchestration Study',
        projectId: project.id,
        type: 'SINGLE_PARTICIPANT',
        status: 'ACTIVE',
        config: JSON.stringify({
          repository: 'test-org/test-repo',
          orchestrationMode: 'symbiote',
        }),
      },
    });

    // Create two conditions for comparison
    const conditions = await Promise.all([
      tx.condition.create({
        data: {
          name: 'Control',
          studyId: study.id,
          config: JSON.stringify({ temperature: 0.7 }),
        },
      }),
      tx.condition.create({
        data: {
          name: 'Treatment',
          studyId: study.id,
          config: JSON.stringify({ temperature: 1.0 }),
        },
      }),
    ]);

    // Create trials for each condition
    const trials = await Promise.all([
      tx.trial.create({
        data: {
          studyId: study.id,
          conditionId: conditions[0].id,
          sequence: 1,
          name: 'Control Trial 1',
          parameterKey: 'temperature',
          parameterValue: '0.7',
          parameters: JSON.stringify({ temperature: 0.7 }),
          sessionCount: 2,
        },
      }),
      tx.trial.create({
        data: {
          studyId: study.id,
          conditionId: conditions[1].id,
          sequence: 1,
          name: 'Treatment Trial 1',
          parameterKey: 'temperature',
          parameterValue: '1.0',
          parameters: JSON.stringify({ temperature: 1.0 }),
          sessionCount: 2,
        },
      }),
    ]);

    return {
      researcherId: researcher.id,
      projectId: project.id,
      studyId: study.id,
      conditionIds: conditions.map(c => c.id),
      trialIds: trials.map(t => t.id),
    };
  });
}

/**
 * Clean up test fixtures
 */
async function cleanupTestFixtures(): Promise<void> {
  await prisma.researcher.deleteMany({
    where: { email: TEST_EMAIL }
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
    TEST_EMAIL,
    ResearcherRole.RESEARCHER,
    AccountStatus.ACTIVE
  );
});

afterAll(async () => {
  await cleanupTestFixtures();
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Clear sessions, events, and participants before each test (but keep the base fixtures)
  await prisma.event.deleteMany({
    where: { participant: { studyId: fixture.studyId } }
  });
  await prisma.sessionParticipant.deleteMany({
    where: { session: { studyId: fixture.studyId } }
  });
  await prisma.participant.deleteMany({
    where: { studyId: fixture.studyId }
  });
  await prisma.session.deleteMany({
    where: { studyId: fixture.studyId }
  });
});

// ============================================================================
// Helper for creating sessions with required fields
// ============================================================================

function createSessionData(trialId: string, name: string, opts?: {
  actualStart?: Date;
  actualEnd?: Date;
}) {
  return {
    studyId: fixture.studyId,
    trialId,
    name,
    scheduledStart: new Date(),
    actualStart: opts?.actualStart,
    actualEnd: opts?.actualEnd,
  };
}

// ============================================================================
// E2E Test Suite
// ============================================================================

describe('RFC-002 E2E Integration', () => {
  describe('Trial Creation Workflow', () => {
    it('should create trials via API', async () => {
      const response = await request(app)
        .post(`/api/v1/studies/${fixture.studyId}/trials`)
        .set('Authorization', `Bearer ${researcherToken}`)
        .send({
          conditionId: fixture.conditionIds[0],
          name: 'New Trial',
          parameters: { maxTokens: 1000 },
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('New Trial');
      expect(response.body.data.parameters).toEqual({ maxTokens: 1000 });
    });

    it('should create parameter sweep trials', async () => {
      const response = await request(app)
        .post(`/api/v1/studies/${fixture.studyId}/trials/sweep`)
        .set('Authorization', `Bearer ${researcherToken}`)
        .send({
          conditionId: fixture.conditionIds[0],
          parameterKey: 'temperature',
          values: [0.5, 0.7, 0.9],
          baseParameters: { maxTokens: 1000 },
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.trials).toHaveLength(3);
      expect(response.body.data.trials[0].parameterValue).toBe('0.5');
      expect(response.body.data.trials[1].parameterValue).toBe('0.7');
      expect(response.body.data.trials[2].parameterValue).toBe('0.9');
    });
  });

  describe('Trial Results Aggregation Service', () => {
    it('should aggregate results for a trial with sessions', async () => {
      const trialId = fixture.trialIds[0];

      await prisma.$transaction(async (tx) => {
        // Create two sessions with different completion times
        const session1 = await tx.session.create({
          data: createSessionData(trialId, 'Session 1', {
            actualStart: new Date('2025-01-01T10:00:00Z'),
            actualEnd: new Date('2025-01-01T10:30:00Z'),
          }),
        });

        const session2 = await tx.session.create({
          data: createSessionData(trialId, 'Session 2', {
            actualStart: new Date('2025-01-01T11:00:00Z'),
            actualEnd: new Date('2025-01-01T11:45:00Z'),
          }),
        });

        // Create participants
        const participant1 = await tx.participant.create({
          data: {
            studyId: fixture.studyId,
            uniqueId: `e2e-participant-1-${Date.now()}`,
            state: 'COMPLETE',
            metadata: JSON.stringify({}),
          },
        });

        const participant2 = await tx.participant.create({
          data: {
            studyId: fixture.studyId,
            uniqueId: `e2e-participant-2-${Date.now()}`,
            state: 'COMPLETE',
            metadata: JSON.stringify({}),
          },
        });

        // Link participants to sessions
        await tx.sessionParticipant.create({
          data: {
            sessionId: session1.id,
            participantId: participant1.id,
          },
        });

        await tx.sessionParticipant.create({
          data: {
            sessionId: session2.id,
            participantId: participant2.id,
          },
        });

        // Create events for metrics
        await tx.event.createMany({
          data: [
            {
              participantId: participant1.id,
              type: 'action',
              data: JSON.stringify({ action: 'start' }),
            },
            {
              participantId: participant1.id,
              type: 'action',
              data: JSON.stringify({ action: 'complete' }),
            },
            {
              participantId: participant2.id,
              type: 'action',
              data: JSON.stringify({ action: 'start' }),
            },
          ],
        });
      });

      // Aggregate results
      const metrics = await aggregateTrialResults(trialId);

      expect(metrics).toBeDefined();
      expect(metrics.completion.completedSessions).toBe(2);
      expect(metrics.completion.successCount).toBe(2);
      expect(metrics.events.totalEvents).toBe(3);
      expect(metrics.events.eventsByType['action']).toBe(3);

      // Duration stats (30 min = 1800000ms, 45 min = 2700000ms)
      expect(metrics.timing.minDuration).toBe(30 * 60 * 1000);
      expect(metrics.timing.maxDuration).toBe(45 * 60 * 1000);
      expect(metrics.timing.meanDuration).toBeDefined();
      expect(metrics.timing.medianDuration).toBeDefined();
    });

    it('should compare trials across conditions', async () => {
      // Create minimal sessions for both trials
      await prisma.$transaction(async (tx) => {
        for (let i = 0; i < fixture.trialIds.length; i++) {
          await tx.session.create({
            data: createSessionData(fixture.trialIds[i], `Comparison Session ${i}`, {
              actualStart: new Date(),
              actualEnd: new Date(),
            }),
          });
        }
      });

      const comparisons = await compareTrials(fixture.studyId);

      // At least the 2 fixture trials should be present
      expect(comparisons.length).toBeGreaterThanOrEqual(2);

      // Find our fixture trials in the comparison
      const controlTrial = comparisons.find(c => c.trialName === 'Control Trial 1');
      const treatmentTrial = comparisons.find(c => c.trialName === 'Treatment Trial 1');

      expect(controlTrial).toBeDefined();
      expect(treatmentTrial).toBeDefined();
      expect(controlTrial!.conditionName).toBe('Control');
      expect(treatmentTrial!.conditionName).toBe('Treatment');
      expect(controlTrial!.parameterValue).toBe('0.7');
      expect(treatmentTrial!.parameterValue).toBe('1.0');
    });

    it('should export trial results as CSV-ready data', async () => {
      const trialId = fixture.trialIds[0];

      // Create session with participant
      await prisma.$transaction(async (tx) => {
        const session = await tx.session.create({
          data: createSessionData(trialId, 'Export Test Session', {
            actualStart: new Date('2025-01-01T10:00:00Z'),
            actualEnd: new Date('2025-01-01T10:15:00Z'),
          }),
        });

        const participant = await tx.participant.create({
          data: {
            studyId: fixture.studyId,
            uniqueId: `e2e-export-participant-${Date.now()}`,
            state: 'COMPLETE',
            metadata: JSON.stringify({}),
          },
        });

        await tx.sessionParticipant.create({
          data: {
            sessionId: session.id,
            participantId: participant.id,
          },
        });
      });

      const exportData = await exportTrialResults(trialId);

      expect(exportData).toHaveLength(1);
      expect(exportData[0].trialName).toBe('Control Trial 1');
      expect(exportData[0].participantState).toBe('COMPLETE');
      expect(exportData[0].durationMs).toBe(15 * 60 * 1000); // 15 min
    });

    it('should export study trial comparison data', async () => {
      // Create sessions for the fixture trials
      await prisma.$transaction(async (tx) => {
        for (let i = 0; i < fixture.trialIds.length; i++) {
          await tx.session.create({
            data: createSessionData(fixture.trialIds[i], `Export Comparison Session ${i}`, {
              actualStart: new Date(),
              actualEnd: new Date(),
            }),
          });
        }
      });

      const comparisonData = await exportStudyTrialComparison(fixture.studyId);

      // At least the 2 fixture trials should be present
      expect(comparisonData.length).toBeGreaterThanOrEqual(2);

      // Find our fixture trials in the comparison
      const controlTrial = comparisonData.find((c: { trialName: string }) => c.trialName === 'Control Trial 1');
      const treatmentTrial = comparisonData.find((c: { trialName: string }) => c.trialName === 'Treatment Trial 1');

      expect(controlTrial).toBeDefined();
      expect(treatmentTrial).toBeDefined();
      expect(controlTrial).toHaveProperty('successRate');
      expect(controlTrial).toHaveProperty('completionRate');
      expect(controlTrial).toHaveProperty('meanDurationMs');
    });
  });

  describe('API Aggregation Endpoints', () => {
    it('should aggregate trial results via API', async () => {
      const trialId = fixture.trialIds[0];

      // Create a session for the trial
      await prisma.session.create({
        data: createSessionData(trialId, 'API Aggregate Test', {
          actualStart: new Date(),
          actualEnd: new Date(),
        }),
      });

      const response = await request(app)
        .post(`/api/v1/trials/${trialId}/aggregate`)
        .set('Authorization', `Bearer ${researcherToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should export trial results via API', async () => {
      const trialId = fixture.trialIds[0];

      const response = await request(app)
        .get(`/api/v1/trials/${trialId}/export`)
        .set('Authorization', `Bearer ${researcherToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.trialId).toBe(trialId);
      expect(response.body.data.rows).toBeDefined();
    });

    it('should compare trials within a study via API', async () => {
      const response = await request(app)
        .get(`/api/v1/studies/${fixture.studyId}/trials/compare`)
        .set('Authorization', `Bearer ${researcherToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.comparisons).toBeDefined();
    });

    it('should export study comparison via API', async () => {
      const response = await request(app)
        .get(`/api/v1/studies/${fixture.studyId}/trials/export`)
        .set('Authorization', `Bearer ${researcherToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.rows).toBeDefined();
    });
  });

  describe('Trial Run and Progress', () => {
    it('should run a trial and create sessions', async () => {
      const trialId = fixture.trialIds[0];

      // Run the trial
      const runResponse = await request(app)
        .post(`/api/v1/trials/${trialId}/run`)
        .set('Authorization', `Bearer ${researcherToken}`)
        .send({
          sessionCount: 3,
        });

      expect(runResponse.status).toBe(200);
      expect(runResponse.body.success).toBe(true);
      expect(runResponse.body.data.sessionsCreated).toBe(3);
    });

    it('should check trial progress', async () => {
      const trialId = fixture.trialIds[0];

      // First create some sessions with required fields
      await prisma.session.createMany({
        data: [
          createSessionData(trialId, 'Progress Session 1', { actualEnd: new Date() }),
          createSessionData(trialId, 'Progress Session 2'),
          createSessionData(trialId, 'Progress Session 3'),
        ],
      });

      // Update the trial's session count
      await prisma.trial.update({
        where: { id: trialId },
        data: { sessionCount: 3 }
      });

      // Check progress
      const progressResponse = await request(app)
        .get(`/api/v1/trials/${trialId}/progress`)
        .set('Authorization', `Bearer ${researcherToken}`);

      expect(progressResponse.status).toBe(200);
      expect(progressResponse.body.success).toBe(true);
      expect(progressResponse.body.data.trialId).toBe(trialId);
      expect(progressResponse.body.data.sessionCount).toBe(3);
      expect(progressResponse.body.data.completedSessions).toBe(1);
    });

    it('should run trial with LLM config options', async () => {
      const trialId = fixture.trialIds[0];

      const runResponse = await request(app)
        .post(`/api/v1/trials/${trialId}/run`)
        .set('Authorization', `Bearer ${researcherToken}`)
        .send({
          sessionCount: 2,
          llmConfig: {
            provider: 'anthropic',
            model: 'claude-3-sonnet',
            temperature: 0.5,
            maxTokens: 2000,
          },
          role: 'PLAYER',
          priority: 'NORMAL',
        });

      expect(runResponse.status).toBe(200);
      expect(runResponse.body.success).toBe(true);
      expect(runResponse.body.data.sessionsCreated).toBe(2);
    });
  });

  describe('Full Workflow Integration', () => {
    it('should complete a full trial workflow: create -> run -> aggregate -> export', async () => {
      // Step 1: Create a new trial
      const createResponse = await request(app)
        .post(`/api/v1/studies/${fixture.studyId}/trials`)
        .set('Authorization', `Bearer ${researcherToken}`)
        .send({
          conditionId: fixture.conditionIds[0],
          name: 'Full Workflow Trial',
          parameterKey: 'temperature',
          parameterValue: '0.8',
          parameters: { temperature: 0.8 },
        });

      expect(createResponse.status).toBe(201);
      expect(createResponse.body.success).toBe(true);
      const newTrialId = createResponse.body.data.id;

      // Step 2: Run the trial to create sessions
      const runResponse = await request(app)
        .post(`/api/v1/trials/${newTrialId}/run`)
        .set('Authorization', `Bearer ${researcherToken}`)
        .send({ sessionCount: 2 });

      expect(runResponse.status).toBe(200);
      expect(runResponse.body.success).toBe(true);
      expect(runResponse.body.data.sessionsCreated).toBe(2);

      // Step 3: Simulate session completion (update sessions with end times)
      const sessions = await prisma.session.findMany({
        where: { trialId: newTrialId },
      });

      for (const session of sessions) {
        await prisma.session.update({
          where: { id: session.id },
          data: {
            actualStart: new Date(),
            actualEnd: new Date(),
          },
        });
      }

      // Step 4: Aggregate results
      const aggregateResponse = await request(app)
        .post(`/api/v1/trials/${newTrialId}/aggregate`)
        .set('Authorization', `Bearer ${researcherToken}`);

      expect(aggregateResponse.status).toBe(200);
      expect(aggregateResponse.body.success).toBe(true);

      // Step 5: Export results
      const exportResponse = await request(app)
        .get(`/api/v1/trials/${newTrialId}/export`)
        .set('Authorization', `Bearer ${researcherToken}`);

      expect(exportResponse.status).toBe(200);
      expect(exportResponse.body.success).toBe(true);
      expect(exportResponse.body.data.trialId).toBe(newTrialId);

      // Step 6: Check final progress
      const progressResponse = await request(app)
        .get(`/api/v1/trials/${newTrialId}/progress`)
        .set('Authorization', `Bearer ${researcherToken}`);

      expect(progressResponse.status).toBe(200);
      expect(progressResponse.body.success).toBe(true);
      expect(progressResponse.body.data.completedSessions).toBe(2);
      expect(progressResponse.body.data.sessionCount).toBe(2);
    });
  });
});
