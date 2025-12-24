/**
 * Complex database query helpers
 * Optimized queries for common data access patterns
 */

import { prisma } from '../../lib/prisma';

/**
 * Get study with complete participant statistics
 */
export async function getStudyWithStats(studyId: string) {
  const [study, stats] = await Promise.all([
    prisma.study.findUnique({
      where: { id: studyId },
      include: {
        conditions: true,
        surveys: true,
        batchExecutions: {
          select: {
            id: true,
            name: true,
            status: true,
            actorsCompleted: true,
            actorsCreated: true,
          },
        },
      },
    }),
    prisma.participant.groupBy({
      by: ['state'],
      where: { studyId },
      _count: true,
    }),
  ]);

  if (!study) {
    return null;
  }

  // Transform stats into a more usable format
  const participantStats = stats.reduce((acc, curr) => {
    acc[curr.state] = curr._count;
    acc.total = (acc.total || 0) + curr._count;
    return acc;
  }, {} as Record<string, number>);

  return {
    ...study,
    participantStats,
  };
}

/**
 * Get participant with complete activity history
 */
export async function getParticipantWithActivity(
  participantId: string,
  options?: {
    includeEvents?: boolean;
    includeSurveys?: boolean;
    includeBiosignals?: boolean;
    eventLimit?: number;
  }
) {
  const includes: any = {};

  if (options?.includeEvents) {
    includes.events = {
      orderBy: { timestamp: 'desc' },
      take: options.eventLimit || 100,
    };
  }

  if (options?.includeSurveys) {
    includes.surveyResponses = {
      include: {
        survey: true,
      },
      orderBy: { submittedAt: 'desc' },
    };
  }

  if (options?.includeBiosignals) {
    includes.biosignalReadings = {
      orderBy: { timestamp: 'desc' },
      take: 1000, // Limit biosignal data due to volume
    };
  }

  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    include: {
      study: true,
      condition: true,
      agentDefinition: true, // Link to agent definition if synthetic
      ...includes,
    },
  });

  return participant;
}

/**
 * Get batch execution with detailed progress
 */
export async function getBatchExecutionProgress(batchExecutionId: string) {
  const batch = await prisma.batchExecution.findUnique({
    where: { id: batchExecutionId },
    include: {
      study: true,
      participants: {
        select: {
          id: true,
          state: true,
          actorType: true,
          events: {
            select: {
              type: true,
              timestamp: true,
            },
            orderBy: { timestamp: 'desc' },
            take: 1,
          },
        },
      },
    },
  });

  if (!batch) {
    return null;
  }

  // Calculate progress metrics - filter to synthetic actors only
  const syntheticParticipants = batch.participants.filter(p => p.actorType === 'SYNTHETIC');
  const actorStates = syntheticParticipants.reduce((acc: Record<string, number>, participant) => {
    const state = participant.state || 'UNKNOWN';
    acc[state] = (acc[state] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const progress = {
    total: batch.actorsCreated,
    completed: actorStates.COMPLETE || 0,
    active: actorStates.ACTIVE || 0,
    failed: actorStates.EXCLUDED || 0,
    pending:
      batch.actorsCreated -
      (actorStates.COMPLETE || 0) -
      (actorStates.ACTIVE || 0) -
      (actorStates.EXCLUDED || 0),
    completionRate:
      batch.actorsCreated > 0
        ? ((actorStates.COMPLETE || 0) / batch.actorsCreated) * 100
        : 0,
  };

  return {
    ...batch,
    progress,
    actorStates,
  };
}

/**
 * Get study metrics aggregated by condition
 */
export async function getStudyMetricsByCondition(studyId: string) {
  // Get all conditions for the study
  const conditions = await prisma.condition.findMany({
    where: { studyId },
  });

  // Get metrics for each condition
  const metricsByCondition = await Promise.all(
    conditions.map(async (condition) => {
      const participants = await prisma.participant.findMany({
        where: {
          studyId,
          conditionId: condition.id,
        },
        include: {
          events: {
            where: {
              type: {
                in: ['task_complete', 'session_end'],
              },
            },
          },
          surveyResponses: {
            include: {
              survey: true,
            },
          },
        },
      });

      // Calculate aggregated metrics
      const metrics = {
        participantCount: participants.length,
        completionRate:
          participants.length > 0
            ? (participants.filter((p) => p.state === 'COMPLETE').length /
                participants.length) *
              100
            : 0,
        avgSessionDuration: calculateAvgSessionDuration(participants),
        avgTaskCompletionTime: calculateAvgTaskTime(participants),
        surveyResponseRate: calculateSurveyResponseRate(participants),
      };

      return {
        condition,
        metrics,
        participants: participants.length,
      };
    })
  );

  return metricsByCondition;
}

/**
 * Search participants with filters
 */
export async function searchParticipants(options: {
  studyId?: string;
  state?: string;
  conditionId?: string;
  searchTerm?: string;
  includeEvents?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) {
  const {
    studyId,
    state,
    conditionId,
    searchTerm,
    includeEvents = false,
    page = 1,
    limit = 20,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = options;

  const where: any = {};

  if (studyId) where.studyId = studyId;
  if (state) where.state = state;
  if (conditionId) where.conditionId = conditionId;

  if (searchTerm) {
    where.OR = [
      { uniqueId: { contains: searchTerm } },
      { metadata: { path: '$', string_contains: searchTerm } },
    ];
  }

  const [participants, total] = await Promise.all([
    prisma.participant.findMany({
      where,
      include: {
        study: true,
        condition: true,
        ...(includeEvents && {
          events: {
            orderBy: { timestamp: 'desc' },
            take: 10,
          },
        }),
      },
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.participant.count({ where }),
  ]);

  return {
    items: participants,
    total,
    page,
    pageSize: limit,
    hasNext: page * limit < total,
  };
}

/**
 * Get recent activity across all studies
 */
export async function getRecentActivity(
  researcherId: string,
  limit: number = 50
) {
  const recentEvents = await prisma.event.findMany({
    where: {
      participant: {
        study: {
          project: {
            researcherId,
          },
        },
      },
    },
    include: {
      participant: {
        select: {
          id: true,
          uniqueId: true,
          study: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: { timestamp: 'desc' },
    take: limit,
  });

  return recentEvents.map((event) => ({
    ...event,
    activityType: 'event',
    studyName: event.participant.study.name,
    participantId: event.participant.uniqueId,
  }));
}

/**
 * Get experiment results summary
 */
export async function getExperimentResultsSummary(experimentId: string) {
  const experiment = await prisma.experimentDesign.findUnique({
    where: { id: experimentId },
    include: {
      conditions: {
        include: {
          experimentResults: true,
        },
      },
    },
  });

  if (!experiment) {
    return null;
  }

  // Parse dependent variables from JSON string
  const dependentVariables = JSON.parse(experiment.dependentVariables || '[]') as Array<{ id: string; name: string }>;

  // Aggregate results by condition and dependent variable
  const summary = experiment.conditions.map((condition) => {
    const results = condition.experimentResults;
    const aggregated: Record<string, any> = {};

    // Aggregate metrics for each dependent variable
    dependentVariables.forEach((variable) => {
      const values = results
        .map((r) => {
          const metrics = JSON.parse(r.metrics || '{}');
          return metrics[variable.id];
        })
        .filter((v): v is number => v !== undefined && v !== null);

      if (values.length > 0) {
        aggregated[variable.name] = {
          mean: mean(values),
          median: median(values),
          stdDev: standardDeviation(values),
          min: Math.min(...values),
          max: Math.max(...values),
          n: values.length,
        };
      }
    });

    return {
      conditionName: condition.name,
      conditionId: condition.id,
      participantCount: results.length,
      metrics: aggregated,
    };
  });

  return {
    experiment,
    summary,
    totalParticipants: experiment.conditions.reduce(
      (sum, c) => sum + c.experimentResults.length,
      0
    ),
  };
}

// Helper functions for metric calculations
function calculateAvgSessionDuration(participants: any[]): number {
  const durations = participants
    .map((p) => {
      const start = p.events.find((e: any) => e.type === 'session_start');
      const end = p.events.find((e: any) => e.type === 'session_end');
      if (start && end) {
        return (
          new Date(end.timestamp).getTime() -
          new Date(start.timestamp).getTime()
        );
      }
      return null;
    })
    .filter((d) => d !== null) as number[];

  return durations.length > 0 ? mean(durations) / 1000 / 60 : 0; // Convert to minutes
}

function calculateAvgTaskTime(participants: any[]): number {
  const taskTimes: number[] = [];

  for (const p of participants) {
    const taskStarts = p.events.filter((e: any) => e.type === 'task_start');
    const taskCompletes = p.events.filter((e: any) => e.type === 'task_complete');

    for (const start of taskStarts) {
      const complete = taskCompletes.find(
        (c: any) =>
          c.data.taskId === start.data.taskId &&
          new Date(c.timestamp) > new Date(start.timestamp)
      );
      if (complete) {
        const duration = new Date(complete.timestamp).getTime() - new Date(start.timestamp).getTime();
        taskTimes.push(duration);
      }
    }
  }

  return taskTimes.length > 0 ? mean(taskTimes) / 1000 / 60 : 0; // Convert to minutes
}

function calculateSurveyResponseRate(participants: any[]): number {
  const totalExpected = participants.length * 3; // Assuming 3 surveys per participant
  const totalResponses = participants.reduce(
    (sum, p) => sum + p.surveyResponses.length,
    0
  );
  return totalExpected > 0 ? (totalResponses / totalExpected) * 100 : 0;
}

// Statistical helper functions
function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function standardDeviation(values: number[]): number {
  const avg = mean(values);
  const squareDiffs = values.map((v) => Math.pow(v - avg, 2));
  const avgSquareDiff = mean(squareDiffs);
  return Math.sqrt(avgSquareDiff);
}