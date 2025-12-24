/**
 * Evaluation Routes
 *
 * API endpoints for human evaluation of narrative passages.
 * Supports the FDG 2026 study instrument and similar evaluation tasks.
 */

import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/error-handler';
import { HTTP_STATUS, ERROR_CODES } from '@ariadne/shared';
import { authenticateResearcher } from '../middleware/auth';

export const evaluationRouter = Router();

// ============================================================================
// FDG 2026 INSTRUMENT DEFINITION
// ============================================================================

const FDG_2026_INSTRUMENT = {
  id: 'fdg2026',
  name: 'FDG 2026 Combined Instrument',
  description: 'Transportation Scale + Narrative Quality + Interactive Quality for AI narrative evaluation',
  version: '1.0',
  scales: [
    {
      id: 'transportation',
      name: 'Transportation Scale (TS-SF)',
      description: 'Appel et al. (2015) adapted from Green & Brock (2000)',
      minValue: 1,
      maxValue: 7,
      items: [
        { id: 'ts1', text: 'While reading, I could easily picture the events taking place.', dimension: 'cognitive' },
        { id: 'ts2', text: 'I was mentally involved in the narrative while reading it.', dimension: 'cognitive' },
        { id: 'ts3', text: 'I wanted to learn how the story ended.', dimension: 'general' },
        { id: 'ts4', text: 'The narrative affected me emotionally.', dimension: 'emotional' },
        { id: 'ts5', text: 'I had a vivid image of the setting.', dimension: 'imagery' },
        { id: 'ts6', text: 'I had a vivid image of the characters.', dimension: 'imagery' },
      ]
    },
    {
      id: 'narrative_quality',
      name: 'Narrative Quality Assessment',
      description: 'Adapted from Purdy et al. (2018) and Busselle & Bilandzic (2009)',
      minValue: 1,
      maxValue: 5,
      items: [
        { id: 'nq1', text: 'The events in this passage follow logically from what came before.', dimension: 'coherence' },
        { id: 'nq2', text: 'The prose is clear, well-structured, and easy to follow.', dimension: 'readability' },
        { id: 'nq3', text: 'The characters speak and act in distinctive, believable ways.', dimension: 'character_voice' },
        { id: 'nq4', text: 'The passage effectively creates a sense of place and mood.', dimension: 'atmosphere' },
        { id: 'nq5', text: 'The passage feels appropriate for its genre.', dimension: 'genre_fit' },
        { id: 'nq6', text: 'I would want to continue reading this story.', dimension: 'engagement' },
      ]
    },
    {
      id: 'interactive_quality',
      name: 'Interactive Narrative Quality',
      description: 'Custom items for interactive fiction-specific concerns',
      minValue: 1,
      maxValue: 7,
      items: [
        { id: 'in1', text: 'The narrative clearly shows the result of the player\'s chosen action.', dimension: 'action_response' },
        { id: 'in2', text: 'The player\'s action feels naturally woven into the story, not forced.', dimension: 'action_integration' },
        { id: 'in3', text: 'The available choices feel meaningfully different from each other.', dimension: 'choice_meaningfulness' },
        { id: 'in4', text: 'I can see how my choice affected what happened next.', dimension: 'consequence_visibility' },
        { id: 'in5', text: 'The narrative respects the player\'s decision without overriding it.', dimension: 'agency_preservation' },
        { id: 'in6', text: 'This passage moves the story forward rather than repeating information.', dimension: 'forward_momentum' },
      ]
    },
    {
      id: 'overall',
      name: 'Overall Assessment',
      description: 'Summary evaluation items',
      minValue: 1,
      maxValue: 10,
      items: [
        { id: 'oa1', text: 'Overall, how would you rate the quality of this passage?', dimension: 'quality', maxValue: 10 },
        { id: 'oa2', text: 'Would you recommend this story experience to others?', dimension: 'recommend', maxValue: 7 },
        { id: 'oa3', text: 'Compared to human-authored interactive fiction, how does this compare?', dimension: 'comparison', maxValue: 5 },
      ]
    }
  ],
  openQuestions: [
    { id: 'or1', prompt: 'What worked well in this passage?' },
    { id: 'or2', prompt: 'What could be improved?' },
    { id: 'or3', prompt: 'Did anything break your immersion or feel "off"? If so, what?' },
  ]
};

// ============================================================================
// INSTRUMENT ENDPOINTS
// ============================================================================

/**
 * GET /api/v1/evaluation/instruments
 * List all evaluation instruments
 */
evaluationRouter.get('/instruments', async (_req, res, next) => {
  try {
    const instruments = await prisma.evaluationInstrument.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        description: true,
        version: true,
        createdAt: true,
        _count: { select: { passages: true } }
      }
    });

    res.json({
      success: true,
      data: instruments
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/evaluation/instruments/:id
 * Get instrument definition
 */
evaluationRouter.get('/instruments/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Special case for built-in FDG 2026 instrument
    if (id === 'fdg2026') {
      return res.json({
        success: true,
        data: FDG_2026_INSTRUMENT
      });
    }

    const instrument = await prisma.evaluationInstrument.findUnique({
      where: { id }
    });

    if (!instrument) {
      throw new AppError(HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Instrument not found');
    }

    res.json({
      success: true,
      data: {
        ...instrument,
        definition: JSON.parse(instrument.definition),
        openQuestions: JSON.parse(instrument.openQuestions)
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/evaluation/instruments
 * Create a new instrument (researcher only)
 */
evaluationRouter.post('/instruments', authenticateResearcher, async (req, res, next) => {
  try {
    const schema = z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      version: z.string().default('1.0'),
      definition: z.object({
        scales: z.array(z.object({
          id: z.string(),
          name: z.string(),
          description: z.string().optional(),
          minValue: z.number(),
          maxValue: z.number(),
          items: z.array(z.object({
            id: z.string(),
            text: z.string(),
            dimension: z.string().optional()
          }))
        }))
      }),
      openQuestions: z.array(z.object({
        id: z.string(),
        prompt: z.string()
      })).optional()
    });

    const data = schema.parse(req.body);

    const instrument = await prisma.evaluationInstrument.create({
      data: {
        name: data.name,
        description: data.description,
        version: data.version,
        definition: JSON.stringify(data.definition),
        openQuestions: JSON.stringify(data.openQuestions || [])
      }
    });

    res.status(201).json({
      success: true,
      data: instrument
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// PASSAGE ENDPOINTS
// ============================================================================

/**
 * GET /api/v1/evaluation/passages
 * List passages for rating (with filters)
 */
evaluationRouter.get('/passages', async (req, res, next) => {
  try {
    const { instrumentId, studyId, conditionId, limit = '50', offset = '0' } = req.query;

    const where: Prisma.EvaluationPassageWhereInput = {};
    if (instrumentId) where.instrumentId = instrumentId as string;
    if (studyId) where.studyId = studyId as string;
    if (conditionId) where.conditionId = conditionId as string;

    const passages = await prisma.evaluationPassage.findMany({
      where,
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
      include: {
        _count: { select: { ratings: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: passages.map(p => ({
        ...p,
        choicesOffered: JSON.parse(p.choicesOffered),
        automatedMetrics: JSON.parse(p.automatedMetrics),
        ratingsCount: p._count.ratings
      }))
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/evaluation/passages/next
 * Get next passage to rate for a rater (assignment algorithm)
 */
evaluationRouter.get('/passages/next', async (req, res, next) => {
  try {
    const { raterId, instrumentId } = req.query;

    if (!raterId) {
      throw new AppError(HTTP_STATUS.BAD_REQUEST, ERROR_CODES.INVALID_INPUT, 'raterId is required');
    }

    // Get IDs of passages this rater has already rated
    const ratedPassageIds = await prisma.evaluationRating.findMany({
      where: { raterId: raterId as string },
      select: { passageId: true }
    });
    const ratedIds = ratedPassageIds.map(r => r.passageId);

    // Build filter for passages
    const passageWhere: { id?: { notIn: string[] }; instrumentId?: string; consequenceScene?: { not: string } } = {
      consequenceScene: { not: '' }
    };
    if (ratedIds.length > 0) {
      passageWhere.id = { notIn: ratedIds };
    }
    if (instrumentId) {
      passageWhere.instrumentId = instrumentId as string;
    }

    // Find passages with their rating counts, ordered by fewest ratings
    const passages = await prisma.evaluationPassage.findMany({
      where: passageWhere,
      include: {
        _count: { select: { ratings: true } }
      },
      orderBy: { createdAt: 'asc' }
    });

    if (passages.length === 0) {
      return res.json({
        success: true,
        data: null,
        message: 'All passages have been rated'
      });
    }

    // Sort by rating count and pick randomly among lowest
    const sorted = passages.sort((a, b) => a._count.ratings - b._count.ratings);
    const minRatings = sorted[0]._count.ratings;
    const lowestRated = sorted.filter(p => p._count.ratings === minRatings);
    const p = lowestRated[Math.floor(Math.random() * lowestRated.length)];

    // Get progress stats using Prisma ORM
    const completed = await prisma.evaluationRating.count({
      where: { raterId: raterId as string }
    });
    const total = await prisma.evaluationPassage.count({
      where: { consequenceScene: { not: '' } }
    });

    res.json({
      success: true,
      data: {
        passage: {
          ...p,
          choicesOffered: JSON.parse(p.choicesOffered || '[]'),
          automatedMetrics: JSON.parse(p.automatedMetrics || '{}')
        },
        progress: {
          completed,
          total
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/evaluation/passages
 * Create passages from various sources (researcher only)
 */
evaluationRouter.post('/passages', authenticateResearcher, async (req, res, next) => {
  try {
    const schema = z.object({
      instrumentId: z.string(),
      studyId: z.string().optional(),
      conditionId: z.string().optional(),
      passages: z.array(z.object({
        sourceType: z.string().default('IMPORT'),
        sourceId: z.string().optional(),
        sequenceNum: z.number().default(0),
        previousScene: z.string().optional(),
        playerAction: z.string().optional(),
        consequenceScene: z.string(),
        choicesOffered: z.array(z.any()).optional(),
        automatedMetrics: z.record(z.any()).optional()
      }))
    });

    const data = schema.parse(req.body);

    // Verify instrument exists or use fdg2026
    let instrumentId = data.instrumentId;
    if (instrumentId === 'fdg2026') {
      // Create or get the FDG 2026 instrument
      const existing = await prisma.evaluationInstrument.findFirst({
        where: { name: FDG_2026_INSTRUMENT.name }
      });

      if (existing) {
        instrumentId = existing.id;
      } else {
        const created = await prisma.evaluationInstrument.create({
          data: {
            name: FDG_2026_INSTRUMENT.name,
            description: FDG_2026_INSTRUMENT.description,
            version: FDG_2026_INSTRUMENT.version,
            definition: JSON.stringify({ scales: FDG_2026_INSTRUMENT.scales }),
            openQuestions: JSON.stringify(FDG_2026_INSTRUMENT.openQuestions)
          }
        });
        instrumentId = created.id;
      }
    }

    const created = await prisma.evaluationPassage.createMany({
      data: data.passages.map(p => ({
        instrumentId,
        studyId: data.studyId,
        conditionId: data.conditionId,
        sourceType: p.sourceType,
        sourceId: p.sourceId,
        sequenceNum: p.sequenceNum,
        previousScene: p.previousScene,
        playerAction: p.playerAction,
        consequenceScene: p.consequenceScene,
        choicesOffered: JSON.stringify(p.choicesOffered || []),
        automatedMetrics: JSON.stringify(p.automatedMetrics || {})
      }))
    });

    res.status(201).json({
      success: true,
      data: { created: created.count }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/evaluation/passages/import-session
 * Import passages from a story playthrough session
 */
evaluationRouter.post('/passages/import-session', authenticateResearcher, async (req, res, next) => {
  try {
    const schema = z.object({
      instrumentId: z.string().default('fdg2026'),
      sessionId: z.string(),
      condition: z.string().optional(),
      studyId: z.string().optional(),
      history: z.array(z.object({
        scene_before: z.string().optional(),
        choice_made: z.string().optional(),
        consequence: z.string().optional(),
        new_scene: z.string().optional()
      }))
    });

    const data = schema.parse(req.body);

    // Resolve instrument ID
    let instrumentId = data.instrumentId;
    if (instrumentId === 'fdg2026') {
      const existing = await prisma.evaluationInstrument.findFirst({
        where: { name: FDG_2026_INSTRUMENT.name }
      });
      if (existing) instrumentId = existing.id;
      else {
        const created = await prisma.evaluationInstrument.create({
          data: {
            name: FDG_2026_INSTRUMENT.name,
            description: FDG_2026_INSTRUMENT.description,
            version: FDG_2026_INSTRUMENT.version,
            definition: JSON.stringify({ scales: FDG_2026_INSTRUMENT.scales }),
            openQuestions: JSON.stringify(FDG_2026_INSTRUMENT.openQuestions)
          }
        });
        instrumentId = created.id;
      }
    }

    const passages = data.history
      .filter(h => h.consequence || h.new_scene) // Only include passages with content
      .map((h, i) => ({
        instrumentId,
        studyId: data.studyId,
        conditionId: data.condition,
        sourceType: 'STORY_PLAYTHROUGH',
        sourceId: data.sessionId,
        sequenceNum: i,
        previousScene: h.scene_before?.substring(0, 2000),
        playerAction: h.choice_made,
        consequenceScene: h.consequence || h.new_scene || '',
        choicesOffered: '[]',
        automatedMetrics: '{}'
      }));

    const created = await prisma.evaluationPassage.createMany({
      data: passages
    });

    res.status(201).json({
      success: true,
      data: { imported: created.count, sessionId: data.sessionId }
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// RATING ENDPOINTS
// ============================================================================

/**
 * POST /api/v1/evaluation/ratings
 * Submit a rating for a passage
 */
evaluationRouter.post('/ratings', async (req, res, next) => {
  try {
    const schema = z.object({
      passageId: z.string(),
      raterId: z.string(),
      scaleRatings: z.record(z.record(z.number())).optional(),
      overallRatings: z.record(z.number()).optional(),
      openResponses: z.record(z.string()).optional(),
      timeSpentSeconds: z.number().optional()
    });

    const data = schema.parse(req.body);

    // Check if rating already exists
    const existing = await prisma.evaluationRating.findUnique({
      where: {
        passageId_raterId: {
          passageId: data.passageId,
          raterId: data.raterId
        }
      }
    });

    if (existing) {
      throw new AppError(HTTP_STATUS.CONFLICT, ERROR_CODES.ALREADY_EXISTS, 'Rating already exists for this passage');
    }

    // Verify passage exists
    const passage = await prisma.evaluationPassage.findUnique({
      where: { id: data.passageId }
    });

    if (!passage) {
      throw new AppError(HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Passage not found');
    }

    // Determine if rating is complete (all required scales filled)
    const isComplete = data.scaleRatings && Object.keys(data.scaleRatings).length >= 3;

    const rating = await prisma.evaluationRating.create({
      data: {
        passageId: data.passageId,
        raterId: data.raterId,
        scaleRatings: JSON.stringify(data.scaleRatings || {}),
        overallRatings: JSON.stringify(data.overallRatings || {}),
        openResponses: JSON.stringify(data.openResponses || {}),
        timeSpentSeconds: data.timeSpentSeconds,
        isComplete
      }
    });

    res.status(201).json({
      success: true,
      data: rating
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/evaluation/ratings
 * Get ratings with filters
 */
evaluationRouter.get('/ratings', async (req, res, next) => {
  try {
    const { passageId, raterId, studyId, conditionId, limit = '100', offset = '0' } = req.query;

    const where: Prisma.EvaluationRatingWhereInput = {};
    if (passageId) where.passageId = passageId as string;
    if (raterId) where.raterId = raterId as string;
    if (studyId || conditionId) {
      const passageFilter: Prisma.EvaluationPassageWhereInput = {};
      if (studyId) passageFilter.studyId = studyId as string;
      if (conditionId) passageFilter.conditionId = conditionId as string;
      where.passage = passageFilter;
    }

    const ratings = await prisma.evaluationRating.findMany({
      where,
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
      include: {
        passage: {
          select: {
            conditionId: true,
            studyId: true,
            sequenceNum: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: ratings.map(r => ({
        ...r,
        scaleRatings: JSON.parse(r.scaleRatings),
        overallRatings: JSON.parse(r.overallRatings),
        openResponses: JSON.parse(r.openResponses)
      }))
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// STATISTICS & EXPORT
// ============================================================================

/**
 * GET /api/v1/evaluation/stats
 * Get evaluation statistics
 */
evaluationRouter.get('/stats', async (req, res, next) => {
  try {
    const { instrumentId, studyId } = req.query;

    const where: Prisma.EvaluationPassageWhereInput = {};
    if (instrumentId) where.instrumentId = instrumentId as string;
    if (studyId) where.studyId = studyId as string;

    // Total counts
    const totalPassages = await prisma.evaluationPassage.count({ where });
    const totalRatings = await prisma.evaluationRating.count({
      where: { passage: where }
    });
    const uniqueRaters = await prisma.evaluationRating.groupBy({
      by: ['raterId'],
      where: { passage: where }
    });

    // Get condition breakdown using Prisma ORM instead of raw SQL
    const passagesByCondition = await prisma.evaluationPassage.groupBy({
      by: ['conditionId'],
      where,
      _count: { id: true }
    });

    const conditionStats = await Promise.all(
      passagesByCondition.map(async (pc) => {
        const ratingsCount = await prisma.evaluationRating.count({
          where: {
            passage: { ...where, conditionId: pc.conditionId }
          }
        });
        const ratersCount = await prisma.evaluationRating.groupBy({
          by: ['raterId'],
          where: {
            passage: { ...where, conditionId: pc.conditionId }
          }
        });
        return {
          conditionId: pc.conditionId,
          passages: pc._count.id,
          ratings: ratingsCount,
          raters: ratersCount.length
        };
      })
    );

    res.json({
      success: true,
      data: {
        totalPassages,
        totalRatings,
        uniqueRaters: uniqueRaters.length,
        avgRatingsPerPassage: totalPassages > 0 ? totalRatings / totalPassages : 0,
        byCondition: conditionStats
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/evaluation/export
 * Export all ratings as JSON (for analysis)
 */
evaluationRouter.get('/export', authenticateResearcher, async (req, res, next) => {
  try {
    const { instrumentId, studyId, format = 'json' } = req.query;

    const where: Prisma.EvaluationRatingWhereInput = {};
    if (instrumentId || studyId) {
      const passageFilter: Prisma.EvaluationPassageWhereInput = {};
      if (instrumentId) passageFilter.instrumentId = instrumentId as string;
      if (studyId) passageFilter.studyId = studyId as string;
      where.passage = passageFilter;
    }

    const ratings = await prisma.evaluationRating.findMany({
      where,
      include: {
        passage: {
          select: {
            id: true,
            conditionId: true,
            studyId: true,
            sourceType: true,
            sourceId: true,
            sequenceNum: true,
            playerAction: true,
            automatedMetrics: true
          }
        }
      }
    });

    const exportData = ratings.map(r => ({
      ratingId: r.id,
      passageId: r.passageId,
      raterId: r.raterId,
      condition: r.passage.conditionId,
      studyId: r.passage.studyId,
      sequenceNum: r.passage.sequenceNum,
      playerAction: r.passage.playerAction,
      automatedMetrics: JSON.parse(r.passage.automatedMetrics),
      scaleRatings: JSON.parse(r.scaleRatings),
      overallRatings: JSON.parse(r.overallRatings),
      openResponses: JSON.parse(r.openResponses),
      timeSpentSeconds: r.timeSpentSeconds,
      isComplete: r.isComplete,
      createdAt: r.createdAt
    }));

    if (format === 'csv') {
      // Flatten for CSV export
      const csvRows = exportData.map(r => {
        const flat: Record<string, string | number | null> = {
          ratingId: r.ratingId,
          passageId: r.passageId,
          raterId: r.raterId,
          condition: r.condition,
          sequenceNum: r.sequenceNum,
          timeSpentSeconds: r.timeSpentSeconds
        };

        // Flatten scale ratings
        Object.entries(r.scaleRatings as Record<string, Record<string, number>>).forEach(([scale, items]) => {
          Object.entries(items).forEach(([item, value]) => {
            flat[`${scale}_${item}`] = value;
          });
        });

        // Flatten overall ratings
        Object.entries(r.overallRatings as Record<string, number>).forEach(([item, value]) => {
          flat[`overall_${item}`] = value;
        });

        return flat;
      });

      // Generate CSV
      if (csvRows.length > 0) {
        const headers = Object.keys(csvRows[0]);
        const csv = [
          headers.join(','),
          ...csvRows.map(row => headers.map(h => row[h] ?? '').join(','))
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=evaluation_export.csv');
        return res.send(csv);
      }
    }

    res.json({
      success: true,
      data: exportData,
      meta: {
        totalRatings: exportData.length,
        exportedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// RATER MANAGEMENT
// ============================================================================

/**
 * POST /api/v1/evaluation/raters
 * Register a new rater
 */
evaluationRouter.post('/raters', async (req, res, next) => {
  try {
    const schema = z.object({
      externalId: z.string().optional(),
      email: z.string().email().optional(),
      name: z.string().optional(),
      experienceLevel: z.enum(['novice', 'intermediate', 'expert']).default('intermediate')
    });

    const data = schema.parse(req.body);

    // Check for existing rater by externalId
    if (data.externalId) {
      const existing = await prisma.evaluationRater.findUnique({
        where: { externalId: data.externalId }
      });
      if (existing) {
        return res.json({
          success: true,
          data: existing,
          message: 'Existing rater found'
        });
      }
    }

    const rater = await prisma.evaluationRater.create({
      data: {
        externalId: data.externalId,
        email: data.email,
        name: data.name,
        experienceLevel: data.experienceLevel
      }
    });

    res.status(201).json({
      success: true,
      data: rater
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/evaluation/raters/:id/progress
 * Get rater's progress
 */
evaluationRouter.get('/raters/:id/progress', async (req, res, next) => {
  try {
    const { id } = req.params;

    const completed = await prisma.evaluationRating.count({
      where: { raterId: id }
    });

    const total = await prisma.evaluationPassage.count({
      where: { consequenceScene: { not: '' } }
    });

    const ratings = await prisma.evaluationRating.findMany({
      where: { raterId: id },
      select: {
        timeSpentSeconds: true,
        createdAt: true
      }
    });

    const totalTime = ratings.reduce((sum, r) => sum + (r.timeSpentSeconds || 0), 0);
    const avgTime = completed > 0 ? totalTime / completed : 0;

    res.json({
      success: true,
      data: {
        raterId: id,
        completed,
        total,
        remaining: total - completed,
        percentComplete: total > 0 ? Math.round((completed / total) * 100) : 0,
        totalTimeSeconds: totalTime,
        avgTimePerRating: Math.round(avgTime)
      }
    });
  } catch (error) {
    next(error);
  }
});
