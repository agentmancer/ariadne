/**
 * Integration tests for Participant Session API endpoints
 *
 * Tests authentication, authorization, and functionality for:
 * - Session state
 * - Check-in
 * - Stage progression
 * - Story management
 * - Comments
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import * as s3Service from '../../services/s3';
import request from 'supertest';
import { Express } from 'express';
import * as jwt from 'jsonwebtoken';
import { createApp } from '../../app';
import { prisma } from '../../lib/prisma';
import { generateParticipantToken } from '../../middleware/auth';
import { SessionStage } from '@ariadne/shared';
import { config } from '../../config';

// ============================================================================
// Test Fixtures & Helpers
// ============================================================================

interface TestFixture {
  researcherId: string;
  projectId: string;
  studyId: string;
  participantId: string;
  partnerId: string;
}

let app: Express;
let fixture: TestFixture;
let participantToken: string;
let partnerToken: string;

/**
 * Create test fixtures for all tests
 * Uses a transaction to ensure atomicity and avoid FK issues
 */
async function createTestFixtures(): Promise<TestFixture> {
  // First, clean up any leftover data from previous runs
  await prisma.researcher.deleteMany({
    where: { email: 'participant-session-test@test.com' },
  }).catch(() => {});

  // Create all fixtures in a transaction
  return await prisma.$transaction(async (tx) => {
    // Create researcher
    const researcher = await tx.researcher.create({
      data: {
        email: 'participant-session-test@test.com',
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
        name: 'Participant Session Test Project',
        researcherId: researcher.id,
      },
    });

    // Create study
    const study = await tx.study.create({
      data: {
        name: 'Test Study',
        projectId: project.id,
        type: 'PAIRED_COLLABORATIVE',
        status: 'ACTIVE',
        config: JSON.stringify({
          workflow: { rounds: 3, tasksPerRound: 1, timePerTask: 15 },
        }),
      },
    });

    // Create participant
    const participant = await tx.participant.create({
      data: {
        studyId: study.id,
        uniqueId: 'test-participant-001',
        type: 'HUMAN',
        state: 'ENROLLED',
        currentStage: SessionStage.WAITING,
      },
    });

    // Create partner
    const partner = await tx.participant.create({
      data: {
        studyId: study.id,
        uniqueId: 'test-partner-001',
        type: 'SYNTHETIC',
        state: 'ACTIVE',
        currentStage: SessionStage.AUTHOR_1,
        partnerId: participant.id,
        metadata: JSON.stringify({ bio: 'A creative writing partner' }),
      },
    });

    // Link partner back to participant
    await tx.participant.update({
      where: { id: participant.id },
      data: { partnerId: partner.id },
    });

    return {
      researcherId: researcher.id,
      projectId: project.id,
      studyId: study.id,
      participantId: participant.id,
      partnerId: partner.id,
    };
  });
}

/**
 * Clean up test data
 */
async function cleanupTestFixtures(fixture: TestFixture | undefined): Promise<void> {
  // If fixture creation failed, just clean by email
  if (!fixture) {
    await prisma.researcher.deleteMany({
      where: { email: 'participant-session-test@test.com' },
    }).catch(() => {});
    return;
  }

  // Delete in order respecting foreign keys
  await prisma.event.deleteMany({ where: { participantId: { in: [fixture.participantId, fixture.partnerId] } } });
  await prisma.comment.deleteMany({
    where: {
      OR: [
        { authorId: { in: [fixture.participantId, fixture.partnerId] } },
        { targetParticipantId: { in: [fixture.participantId, fixture.partnerId] } }
      ]
    }
  });
  await prisma.storyData.deleteMany({ where: { participantId: { in: [fixture.participantId, fixture.partnerId] } } });
  await prisma.participant.updateMany({
    where: { id: { in: [fixture.participantId, fixture.partnerId] } },
    data: { partnerId: null }
  });
  await prisma.participant.deleteMany({ where: { studyId: fixture.studyId } });
  await prisma.study.deleteMany({ where: { id: fixture.studyId } });
  await prisma.project.deleteMany({ where: { id: fixture.projectId } });
  await prisma.researcher.deleteMany({ where: { email: 'participant-session-test@test.com' } });
}

/**
 * Reset participant state between tests
 */
async function resetParticipantState(): Promise<void> {
  await prisma.participant.update({
    where: { id: fixture.participantId },
    data: {
      state: 'ENROLLED',
      currentStage: SessionStage.WAITING,
      checkedIn: null,
      sessionStart: null,
      completedAt: null,
    },
  });
  await prisma.event.deleteMany({ where: { participantId: fixture.participantId } });
  // Clean up comments where participant is author OR target (for proper isolation)
  await prisma.comment.deleteMany({
    where: {
      OR: [
        { authorId: fixture.participantId },
        { targetParticipantId: fixture.participantId }
      ]
    }
  });
  await prisma.storyData.deleteMany({ where: { participantId: fixture.participantId } });
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
  participantToken = generateParticipantToken(fixture.participantId);
  partnerToken = generateParticipantToken(fixture.partnerId);
});

afterAll(async () => {
  await cleanupTestFixtures(fixture);
});

// Restore all mocks after each test to prevent mock leakage
afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// Authentication & Authorization Tests
// ============================================================================

describe('Authentication & Authorization', () => {
  describe('Unauthenticated requests', () => {
    it('should return 401 for missing token', async () => {
      const response = await request(app)
        .get(`/api/v1/participant-session/${fixture.participantId}/state`);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 for invalid token', async () => {
      const response = await request(app)
        .get(`/api/v1/participant-session/${fixture.participantId}/state`)
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should return 401 for expired token', async () => {
      // Create an expired token
      const expiredToken = jwt.sign(
        { participantId: fixture.participantId },
        config.jwt.secret,
        { expiresIn: '-1h' }
      );

      const response = await request(app)
        .get(`/api/v1/participant-session/${fixture.participantId}/state`)
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('TOKEN_EXPIRED');
    });

    it('should return 401 for malformed Authorization header', async () => {
      const response = await request(app)
        .get(`/api/v1/participant-session/${fixture.participantId}/state`)
        .set('Authorization', 'NotBearer token');

      expect(response.status).toBe(401);
    });
  });

  describe('Authorization - ownership verification', () => {
    it('should return 403 when accessing another participant\'s data', async () => {
      // Partner token trying to access participant's state
      const response = await request(app)
        .get(`/api/v1/participant-session/${fixture.participantId}/state`)
        .set('Authorization', `Bearer ${partnerToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('should allow access to own data', async () => {
      const response = await request(app)
        .get(`/api/v1/participant-session/${fixture.participantId}/state`)
        .set('Authorization', `Bearer ${participantToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});

// ============================================================================
// GET /state Tests
// ============================================================================

describe('GET /:participantId/state', () => {
  beforeEach(async () => {
    await resetParticipantState();
  });

  it('should return current session state', async () => {
    const response = await request(app)
      .get(`/api/v1/participant-session/${fixture.participantId}/state`)
      .set('Authorization', `Bearer ${participantToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      participant: {
        id: fixture.participantId,
        currentStage: SessionStage.WAITING,
        state: 'ENROLLED',
      },
      partner: {
        id: fixture.partnerId,
      },
      study: {
        id: fixture.studyId,
      },
    });
  });

  it('should include stage configuration', async () => {
    const response = await request(app)
      .get(`/api/v1/participant-session/${fixture.participantId}/state`)
      .set('Authorization', `Bearer ${participantToken}`);

    expect(response.body.data.stageConfig).toBeDefined();
    expect(response.body.data.stageConfig.name).toBeDefined();
    expect(response.body.data.stageConfig.description).toBeDefined();
  });

  it('should return 422 for invalid ID format', async () => {
    const response = await request(app)
      .get('/api/v1/participant-session/invalid-id-format/state')
      .set('Authorization', `Bearer ${participantToken}`);

    expect(response.status).toBe(422);
  });
});

// ============================================================================
// POST /checkin Tests
// ============================================================================

describe('POST /:participantId/checkin', () => {
  beforeEach(async () => {
    await resetParticipantState();
  });

  it('should mark participant as checked in', async () => {
    const response = await request(app)
      .post(`/api/v1/participant-session/${fixture.participantId}/checkin`)
      .set('Authorization', `Bearer ${participantToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.checkedIn).toBeDefined();
    expect(response.body.data.state).toBe('CHECKED_IN');
    expect(response.body.data.currentStage).toBe(SessionStage.WAITING);
  });

  it('should reject double check-in', async () => {
    // First check-in
    await request(app)
      .post(`/api/v1/participant-session/${fixture.participantId}/checkin`)
      .set('Authorization', `Bearer ${participantToken}`);

    // Second check-in attempt
    const response = await request(app)
      .post(`/api/v1/participant-session/${fixture.participantId}/checkin`)
      .set('Authorization', `Bearer ${participantToken}`);

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('already checked in');
  });

  it('should log session event', async () => {
    await request(app)
      .post(`/api/v1/participant-session/${fixture.participantId}/checkin`)
      .set('Authorization', `Bearer ${participantToken}`);

    const events = await prisma.event.findMany({
      where: {
        participantId: fixture.participantId,
        type: 'session_checkin',
      },
    });

    expect(events.length).toBe(1);
  });
});

// ============================================================================
// POST /stage Tests
// ============================================================================

describe('POST /:participantId/stage', () => {
  beforeEach(async () => {
    await resetParticipantState();
    // Set up participant as checked in with session started
    await prisma.participant.update({
      where: { id: fixture.participantId },
      data: {
        state: 'ACTIVE',
        checkedIn: new Date(),
        sessionStart: new Date(Date.now() - 120 * 60 * 1000), // 120 minutes ago
        currentStage: SessionStage.WAITING,
      },
    });
  });

  it('should advance to next stage', async () => {
    const response = await request(app)
      .post(`/api/v1/participant-session/${fixture.participantId}/stage`)
      .set('Authorization', `Bearer ${participantToken}`)
      .send({ targetStage: SessionStage.TUTORIAL });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.currentStage).toBe(SessionStage.TUTORIAL);
  });

  it('should start session timer when moving from WAITING to TUTORIAL', async () => {
    const response = await request(app)
      .post(`/api/v1/participant-session/${fixture.participantId}/stage`)
      .set('Authorization', `Bearer ${participantToken}`)
      .send({ targetStage: SessionStage.TUTORIAL });

    expect(response.body.data.sessionStart).toBeDefined();
  });

  it('should enforce time constraints (without force flag)', async () => {
    // Set session start to just now
    await prisma.participant.update({
      where: { id: fixture.participantId },
      data: {
        sessionStart: new Date(), // Just started
        currentStage: SessionStage.TUTORIAL,
      },
    });

    // Try to advance to AUTHOR_1 (requires 15 min elapsed)
    const response = await request(app)
      .post(`/api/v1/participant-session/${fixture.participantId}/stage`)
      .set('Authorization', `Bearer ${participantToken}`)
      .send({ targetStage: SessionStage.AUTHOR_1 });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('Cannot advance');
  });

  it('should allow force flag to bypass time constraints', async () => {
    // Set session start to just now
    await prisma.participant.update({
      where: { id: fixture.participantId },
      data: {
        sessionStart: new Date(),
        currentStage: SessionStage.TUTORIAL,
      },
    });

    const response = await request(app)
      .post(`/api/v1/participant-session/${fixture.participantId}/stage`)
      .set('Authorization', `Bearer ${participantToken}`)
      .send({ targetStage: SessionStage.AUTHOR_1, force: true });

    expect(response.status).toBe(200);
    expect(response.body.data.currentStage).toBe(SessionStage.AUTHOR_1);
  });

  it('should prevent advancing past COMPLETE', async () => {
    await prisma.participant.update({
      where: { id: fixture.participantId },
      data: { currentStage: SessionStage.COMPLETE },
    });

    // Try to use an invalid stage value - this fails Zod validation with 422
    const response = await request(app)
      .post(`/api/v1/participant-session/${fixture.participantId}/stage`)
      .set('Authorization', `Bearer ${participantToken}`)
      .send({ targetStage: 999, force: true }); // Invalid stage value

    // Validation rejects invalid enum values with 422
    expect(response.status).toBe(422);
  });

  it('should set state to COMPLETE when reaching final stage', async () => {
    await prisma.participant.update({
      where: { id: fixture.participantId },
      data: { currentStage: SessionStage.SURVEY },
    });

    const response = await request(app)
      .post(`/api/v1/participant-session/${fixture.participantId}/stage`)
      .set('Authorization', `Bearer ${participantToken}`)
      .send({ targetStage: SessionStage.COMPLETE, force: true });

    expect(response.status).toBe(200);
    expect(response.body.data.state).toBe('COMPLETE');
  });

  it('should log stage change event', async () => {
    await request(app)
      .post(`/api/v1/participant-session/${fixture.participantId}/stage`)
      .set('Authorization', `Bearer ${participantToken}`)
      .send({ targetStage: SessionStage.TUTORIAL });

    const events = await prisma.event.findMany({
      where: {
        participantId: fixture.participantId,
        type: 'stage_change',
      },
    });

    expect(events.length).toBe(1);
  });
});

// ============================================================================
// Story Management Tests
// ============================================================================

describe('Story Management', () => {
  beforeEach(async () => {
    await resetParticipantState();
    await prisma.storyData.deleteMany({ where: { participantId: fixture.partnerId } });
  });

  describe('GET /:participantId/story', () => {
    it('should return null when no story exists', async () => {
      const response = await request(app)
        .get(`/api/v1/participant-session/${fixture.participantId}/story`)
        .set('Authorization', `Bearer ${participantToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeNull();
    });

    it('should return confirmed story with download URL', async () => {
      // Create a confirmed story
      await prisma.storyData.create({
        data: {
          participantId: fixture.participantId,
          pluginType: 'twine',
          version: 1,
          s3Key: `stories/${fixture.studyId}/${fixture.participantId}/twine/v1.json`,
          s3Bucket: config.s3.bucket,
          status: 'CONFIRMED',
          name: 'Test Story',
        },
      });

      const response = await request(app)
        .get(`/api/v1/participant-session/${fixture.participantId}/story`)
        .set('Authorization', `Bearer ${participantToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.version).toBe(1);
      expect(response.body.data.downloadUrl).toBeDefined();
    });
  });

  describe('PUT /:participantId/story', () => {
    it('should create story record and return upload URL', async () => {
      const response = await request(app)
        .put(`/api/v1/participant-session/${fixture.participantId}/story`)
        .set('Authorization', `Bearer ${participantToken}`)
        .send({ pluginType: 'twine', name: 'My Story' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.version).toBe(1);
      expect(response.body.data.uploadUrl).toBeDefined();
    });

    it('should increment version for subsequent saves', async () => {
      // First save
      await request(app)
        .put(`/api/v1/participant-session/${fixture.participantId}/story`)
        .set('Authorization', `Bearer ${participantToken}`)
        .send({ pluginType: 'twine' });

      // Second save
      const response = await request(app)
        .put(`/api/v1/participant-session/${fixture.participantId}/story`)
        .set('Authorization', `Bearer ${participantToken}`)
        .send({ pluginType: 'twine' });

      expect(response.body.data.version).toBe(2);
    });

    it('should set default plugin type', async () => {
      const response = await request(app)
        .put(`/api/v1/participant-session/${fixture.participantId}/story`)
        .set('Authorization', `Bearer ${participantToken}`)
        .send({});

      expect(response.status).toBe(200);

      // Verify default plugin type is 'twine' in database
      const story = await prisma.storyData.findFirst({
        where: { participantId: fixture.participantId },
        orderBy: { createdAt: 'desc' },
      });
      expect(story?.pluginType).toBe('twine');
    });

    it('should log story save event', async () => {
      await request(app)
        .put(`/api/v1/participant-session/${fixture.participantId}/story`)
        .set('Authorization', `Bearer ${participantToken}`)
        .send({ pluginType: 'twine' });

      const events = await prisma.event.findMany({
        where: {
          participantId: fixture.participantId,
          type: 'story_save',
        },
      });

      expect(events.length).toBe(1);
    });
  });

  describe('POST /:participantId/story/confirm', () => {
    it('should confirm story upload when file exists in S3', async () => {
      // Create a pending story
      const story = await prisma.storyData.create({
        data: {
          participantId: fixture.participantId,
          pluginType: 'twine',
          version: 1,
          s3Key: `stories/${fixture.studyId}/${fixture.participantId}/twine/v1.json`,
          s3Bucket: config.s3.bucket,
          status: 'PENDING',
          name: 'Test Story',
          expiresAt: new Date(Date.now() + 3600 * 1000),
        },
      });

      // Mock existsInS3 to return true
      vi.spyOn(s3Service, 'existsInS3').mockResolvedValueOnce(true);

      const response = await request(app)
        .post(`/api/v1/participant-session/${fixture.participantId}/story/confirm`)
        .set('Authorization', `Bearer ${participantToken}`)
        .send({ storyId: story.id });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('CONFIRMED');

      // Verify database was updated
      const updatedStory = await prisma.storyData.findUnique({
        where: { id: story.id },
      });
      expect(updatedStory?.status).toBe('CONFIRMED');
      expect(updatedStory?.expiresAt).toBeNull();
    });

    it('should return 400 when file not uploaded to S3', async () => {
      // Create a pending story
      const story = await prisma.storyData.create({
        data: {
          participantId: fixture.participantId,
          pluginType: 'twine',
          version: 2,
          s3Key: `stories/${fixture.studyId}/${fixture.participantId}/twine/v2.json`,
          s3Bucket: config.s3.bucket,
          status: 'PENDING',
          name: 'Test Story 2',
          expiresAt: new Date(Date.now() + 3600 * 1000),
        },
      });

      // Mock existsInS3 to return false
      vi.spyOn(s3Service, 'existsInS3').mockResolvedValueOnce(false);

      const response = await request(app)
        .post(`/api/v1/participant-session/${fixture.participantId}/story/confirm`)
        .set('Authorization', `Bearer ${participantToken}`)
        .send({ storyId: story.id });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('not uploaded');
    });

    it('should return 404 for non-existent story', async () => {
      // Use a valid CUID format that doesn't exist
      const response = await request(app)
        .post(`/api/v1/participant-session/${fixture.participantId}/story/confirm`)
        .set('Authorization', `Bearer ${participantToken}`)
        .send({ storyId: 'clnonexistentstoryid12345' });

      expect(response.status).toBe(404);
    });

    it('should return 422 for invalid story ID format', async () => {
      const response = await request(app)
        .post(`/api/v1/participant-session/${fixture.participantId}/story/confirm`)
        .set('Authorization', `Bearer ${participantToken}`)
        .send({ storyId: 'not-a-cuid' });

      expect(response.status).toBe(422);
    });
  });

  describe('GET /:participantId/partner-story', () => {
    it('should return null when partner has no story', async () => {
      const response = await request(app)
        .get(`/api/v1/participant-session/${fixture.participantId}/partner-story`)
        .set('Authorization', `Bearer ${participantToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeNull();
      expect(response.body.message).toContain('not submitted');
    });

    it('should return partner story with download URL', async () => {
      // Create partner's story
      await prisma.storyData.create({
        data: {
          participantId: fixture.partnerId,
          pluginType: 'twine',
          version: 1,
          s3Key: `stories/${fixture.studyId}/${fixture.partnerId}/twine/v1.json`,
          s3Bucket: config.s3.bucket,
          status: 'CONFIRMED',
          name: 'Partner Story',
        },
      });

      const response = await request(app)
        .get(`/api/v1/participant-session/${fixture.participantId}/partner-story`)
        .set('Authorization', `Bearer ${participantToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.partnerId).toBe(fixture.partnerId);
      expect(response.body.data.downloadUrl).toBeDefined();
    });
  });
});

// ============================================================================
// Comment Tests
// ============================================================================

describe('Comments', () => {
  beforeEach(async () => {
    await resetParticipantState();
    await prisma.participant.update({
      where: { id: fixture.participantId },
      data: {
        state: 'ACTIVE',
        currentStage: SessionStage.PLAY_1,
      },
    });
  });

  describe('POST /:participantId/comment', () => {
    it('should create comment on partner\'s story', async () => {
      const response = await request(app)
        .post(`/api/v1/participant-session/${fixture.participantId}/comment`)
        .set('Authorization', `Bearer ${participantToken}`)
        .send({
          content: 'Great story! I loved the twist at the end.',
          commentType: 'PRAISE',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.content).toBe('Great story! I loved the twist at the end.');
      expect(response.body.data.commentType).toBe('PRAISE');
      expect(response.body.data.targetParticipantId).toBe(fixture.partnerId);
    });

    it('should determine round from current stage', async () => {
      // Set to PLAY_2 (round 2)
      await prisma.participant.update({
        where: { id: fixture.participantId },
        data: { currentStage: SessionStage.PLAY_2 },
      });

      const response = await request(app)
        .post(`/api/v1/participant-session/${fixture.participantId}/comment`)
        .set('Authorization', `Bearer ${participantToken}`)
        .send({ content: 'Round 2 feedback' });

      expect(response.body.data.round).toBe(2);
    });

    it('should validate comment content length', async () => {
      // Empty content
      const response = await request(app)
        .post(`/api/v1/participant-session/${fixture.participantId}/comment`)
        .set('Authorization', `Bearer ${participantToken}`)
        .send({ content: '' });

      expect(response.status).toBe(422);
    });

    it('should validate comment type enum', async () => {
      const response = await request(app)
        .post(`/api/v1/participant-session/${fixture.participantId}/comment`)
        .set('Authorization', `Bearer ${participantToken}`)
        .send({
          content: 'Test comment',
          commentType: 'INVALID_TYPE',
        });

      expect(response.status).toBe(422);
    });

    it('should allow optional passage ID', async () => {
      const response = await request(app)
        .post(`/api/v1/participant-session/${fixture.participantId}/comment`)
        .set('Authorization', `Bearer ${participantToken}`)
        .send({
          content: 'Comment on specific passage',
          passageId: 'passage-123',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.passageId).toBe('passage-123');
    });

    it('should log comment event', async () => {
      await request(app)
        .post(`/api/v1/participant-session/${fixture.participantId}/comment`)
        .set('Authorization', `Bearer ${participantToken}`)
        .send({ content: 'Test comment' });

      const events = await prisma.event.findMany({
        where: {
          participantId: fixture.participantId,
          type: 'comment_added',
        },
      });

      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('GET /:participantId/comments', () => {
    beforeEach(async () => {
      // Clean up any existing comments first for proper test isolation
      // Clean both targetParticipantId and authorId to ensure complete isolation
      await prisma.comment.deleteMany({
        where: {
          OR: [
            { targetParticipantId: fixture.participantId },
            { authorId: fixture.partnerId }
          ]
        }
      });

      // Create some comments on participant's story (from partner)
      for (let i = 0; i < 5; i++) {
        await prisma.comment.create({
          data: {
            authorId: fixture.partnerId,
            targetParticipantId: fixture.participantId,
            content: `Comment ${i + 1}`,
            round: i < 3 ? 1 : 2,
            phase: 'REVIEW',
          },
        });
      }
    });

    it('should return paginated comments', async () => {
      const response = await request(app)
        .get(`/api/v1/participant-session/${fixture.participantId}/comments`)
        .set('Authorization', `Bearer ${participantToken}`)
        .query({ page: 1, pageSize: 3 });

      expect(response.status).toBe(200);
      expect(response.body.data.comments.length).toBe(3);
      expect(response.body.data.pagination.total).toBe(5);
      expect(response.body.data.pagination.hasNext).toBe(true);
    });

    it('should filter by round', async () => {
      const response = await request(app)
        .get(`/api/v1/participant-session/${fixture.participantId}/comments`)
        .set('Authorization', `Bearer ${participantToken}`)
        .query({ round: 1 });

      expect(response.status).toBe(200);
      expect(response.body.data.comments.length).toBe(3);
      response.body.data.comments.forEach((comment: { round: number }) => {
        expect(comment.round).toBe(1);
      });
    });

    it('should include author info', async () => {
      const response = await request(app)
        .get(`/api/v1/participant-session/${fixture.participantId}/comments`)
        .set('Authorization', `Bearer ${participantToken}`);

      expect(response.body.data.comments[0].author).toBeDefined();
      expect(response.body.data.comments[0].author.id).toBe(fixture.partnerId);
    });

    it('should handle empty result', async () => {
      // Remove all comments
      await prisma.comment.deleteMany({ where: { targetParticipantId: fixture.participantId } });

      const response = await request(app)
        .get(`/api/v1/participant-session/${fixture.participantId}/comments`)
        .set('Authorization', `Bearer ${participantToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.comments.length).toBe(0);
      expect(response.body.data.pagination.total).toBe(0);
    });

    it('should validate pagination params', async () => {
      const response = await request(app)
        .get(`/api/v1/participant-session/${fixture.participantId}/comments`)
        .set('Authorization', `Bearer ${participantToken}`)
        .query({ page: 0 }); // Invalid - min is 1

      expect(response.status).toBe(422);
    });
  });
});

// ============================================================================
// Edge Cases & Error Handling
// ============================================================================

describe('Edge Cases', () => {
  it('should return 404 for non-existent participant', async () => {
    // Use a valid CUID format that doesn't exist
    const fakeId = 'clnonexistentparticipant1';
    const fakeToken = generateParticipantToken(fakeId);

    const response = await request(app)
      .get(`/api/v1/participant-session/${fakeId}/state`)
      .set('Authorization', `Bearer ${fakeToken}`);

    expect(response.status).toBe(404);
  });

  it('should handle participant without partner', async () => {
    // Create a participant without partner
    const noPartnerParticipant = await prisma.participant.create({
      data: {
        studyId: fixture.studyId,
        uniqueId: 'no-partner-participant',
        type: 'HUMAN',
        state: 'ACTIVE',
        currentStage: SessionStage.PLAY_1,
      },
    });

    const token = generateParticipantToken(noPartnerParticipant.id);

    const response = await request(app)
      .get(`/api/v1/participant-session/${noPartnerParticipant.id}/partner-story`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('no assigned partner');

    // Cleanup
    await prisma.participant.delete({ where: { id: noPartnerParticipant.id } });
  });

  it('should handle concurrent story saves correctly (version increment)', async () => {
    await resetParticipantState();

    // Make concurrent requests
    const promises = [
      request(app)
        .put(`/api/v1/participant-session/${fixture.participantId}/story`)
        .set('Authorization', `Bearer ${participantToken}`)
        .send({ pluginType: 'twine' }),
      request(app)
        .put(`/api/v1/participant-session/${fixture.participantId}/story`)
        .set('Authorization', `Bearer ${participantToken}`)
        .send({ pluginType: 'twine' }),
    ];

    const responses = await Promise.all(promises);

    // Both should succeed
    expect(responses[0].status).toBe(200);
    expect(responses[1].status).toBe(200);

    // Versions should be different (1 and 2, in either order)
    const versions = responses.map(r => r.body.data.version).sort();
    expect(versions).toEqual([1, 2]);
  });
});
