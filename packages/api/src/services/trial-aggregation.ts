/**
 * Trial Results Aggregation Service
 *
 * Computes and aggregates statistics across trial sessions and participants.
 * Part of RFC-002 Phase 4 - Integration.
 */

import { prisma } from '../lib/prisma';

/**
 * Aggregated metrics for a trial
 */
export interface TrialMetrics {
  /** Time metrics in milliseconds */
  timing: {
    meanDuration: number | null;
    minDuration: number | null;
    maxDuration: number | null;
    medianDuration: number | null;
    stdDevDuration: number | null;
  };
  /** Completion metrics */
  completion: {
    totalSessions: number;
    completedSessions: number;
    successCount: number;
    failureCount: number;
    successRate: number | null;
    completionRate: number | null;
  };
  /** Event-based metrics */
  events: {
    totalEvents: number;
    eventsByType: Record<string, number>;
    meanEventsPerSession: number | null;
  };
  /** Custom plugin metrics (aggregated from session data) */
  custom: Record<string, unknown>;
}

/**
 * Comparison data for multiple trials
 */
export interface TrialComparison {
  trialId: string;
  trialName: string | null;
  sequence: number;
  conditionId: string | null;
  conditionName: string | null;
  parameterKey: string | null;
  parameterValue: string | null;
  parameters: Record<string, unknown>;
  status: string;
  metrics: TrialMetrics;
}

/**
 * Calculate standard deviation
 */
function calculateStdDev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const squareDiffs = values.map(value => Math.pow(value - mean, 2));
  const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(avgSquareDiff);
}

/**
 * Calculate median
 */
function calculateMedian(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Aggregate results for a single trial
 */
export async function aggregateTrialResults(trialId: string): Promise<TrialMetrics> {
  // Get trial with sessions
  const trial = await prisma.trial.findUnique({
    where: { id: trialId },
    include: {
      sessions: {
        select: {
          id: true,
          actualStart: true,
          actualEnd: true,
        }
      }
    }
  });

  if (!trial) {
    throw new Error(`Trial not found: ${trialId}`);
  }

  // Get all participants for sessions in this trial
  const sessionIds = trial.sessions.map((s: { id: string }) => s.id);

  // Get session participants and their events
  const sessionParticipants = await prisma.sessionParticipant.findMany({
    where: {
      sessionId: { in: sessionIds }
    },
    include: {
      participant: {
        include: {
          events: {
            select: {
              id: true,
              type: true,
              data: true,
            }
          }
        }
      }
    }
  });

  // Type for session with dates
  type SessionWithDates = { actualStart: Date | null; actualEnd: Date | null };

  // Calculate duration statistics
  const completedSessions = trial.sessions.filter((s: SessionWithDates) => s.actualEnd !== null);
  const durations = completedSessions
    .filter((s: SessionWithDates) => s.actualStart && s.actualEnd)
    .map((s: SessionWithDates) => new Date(s.actualEnd!).getTime() - new Date(s.actualStart!).getTime());

  const meanDuration = durations.length > 0
    ? durations.reduce((a: number, b: number) => a + b, 0) / durations.length
    : null;

  // Type for participant with events
  type ParticipantWithEvents = {
    events: { id: string; type: string; data: unknown }[];
    state: string;
  };

  // Aggregate events
  const allEvents = sessionParticipants.flatMap((sp: { participant: ParticipantWithEvents }) => sp.participant.events);
  const eventsByType: Record<string, number> = {};
  for (const event of allEvents) {
    eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
  }

  // Calculate success/failure from participant states
  const participants = sessionParticipants.map((sp: { participant: ParticipantWithEvents }) => sp.participant);
  const completedParticipants = participants.filter((p: ParticipantWithEvents) => p.state === 'COMPLETE');
  const excludedParticipants = participants.filter((p: ParticipantWithEvents) => p.state === 'EXCLUDED');

  const metrics: TrialMetrics = {
    timing: {
      meanDuration: meanDuration ? Math.round(meanDuration) : null,
      minDuration: durations.length > 0 ? Math.min(...durations) : null,
      maxDuration: durations.length > 0 ? Math.max(...durations) : null,
      medianDuration: calculateMedian(durations),
      stdDevDuration: meanDuration !== null && durations.length > 1
        ? Math.round(calculateStdDev(durations, meanDuration))
        : null,
    },
    completion: {
      totalSessions: trial.sessionCount,
      completedSessions: completedSessions.length,
      successCount: completedParticipants.length,
      failureCount: excludedParticipants.length,
      successRate: trial.sessionCount > 0
        ? Math.round((completedParticipants.length / trial.sessionCount) * 100) / 100
        : null,
      completionRate: trial.sessionCount > 0
        ? Math.round((completedSessions.length / trial.sessionCount) * 100) / 100
        : null,
    },
    events: {
      totalEvents: allEvents.length,
      eventsByType,
      meanEventsPerSession: trial.sessionCount > 0
        ? Math.round((allEvents.length / trial.sessionCount) * 100) / 100
        : null,
    },
    custom: {},
  };

  return metrics;
}

/**
 * Update trial with aggregated metrics
 */
export async function updateTrialMetrics(trialId: string): Promise<void> {
  const metrics = await aggregateTrialResults(trialId);

  await prisma.trial.update({
    where: { id: trialId },
    data: {
      successCount: metrics.completion.successCount,
      failureCount: metrics.completion.failureCount,
      metrics: JSON.stringify(metrics),
    }
  });
}

/**
 * Compare multiple trials within a study
 */
export async function compareTrials(studyId: string): Promise<TrialComparison[]> {
  const trials = await prisma.trial.findMany({
    where: { studyId },
    include: {
      condition: {
        select: { id: true, name: true }
      },
      sessions: {
        select: {
          id: true,
          actualStart: true,
          actualEnd: true,
        }
      }
    },
    orderBy: [
      { conditionId: 'asc' },
      { sequence: 'asc' }
    ]
  });

  const comparisons: TrialComparison[] = [];

  for (const trial of trials) {
    const metrics = await aggregateTrialResults(trial.id);

    comparisons.push({
      trialId: trial.id,
      trialName: trial.name,
      sequence: trial.sequence,
      conditionId: trial.conditionId,
      conditionName: trial.condition?.name || null,
      parameterKey: trial.parameterKey,
      parameterValue: trial.parameterValue,
      parameters: JSON.parse(trial.parameters),
      status: trial.status,
      metrics,
    });
  }

  return comparisons;
}

/**
 * Export trial results as CSV-ready data
 */
export async function exportTrialResults(trialId: string): Promise<Record<string, unknown>[]> {
  const trial = await prisma.trial.findUnique({
    where: { id: trialId },
    include: {
      condition: {
        select: { name: true }
      },
      sessions: {
        include: {
          participants: {
            include: {
              participant: {
                include: {
                  events: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!trial) {
    throw new Error(`Trial not found: ${trialId}`);
  }

  const rows: Record<string, unknown>[] = [];

  for (const session of trial.sessions) {
    for (const sp of session.participants) {
      const participant = sp.participant;
      const duration = session.actualStart && session.actualEnd
        ? new Date(session.actualEnd).getTime() - new Date(session.actualStart).getTime()
        : null;

      rows.push({
        trialId: trial.id,
        trialName: trial.name,
        trialSequence: trial.sequence,
        conditionName: trial.condition?.name,
        parameterKey: trial.parameterKey,
        parameterValue: trial.parameterValue,
        sessionId: session.id,
        sessionName: session.name,
        participantId: participant.id,
        participantUniqueId: participant.uniqueId,
        participantState: participant.state,
        sessionStart: session.actualStart,
        sessionEnd: session.actualEnd,
        durationMs: duration,
        eventCount: participant.events.length,
        completedAt: participant.completedAt,
      });
    }
  }

  return rows;
}

/**
 * Export comparison data for all trials in a study
 */
export async function exportStudyTrialComparison(studyId: string): Promise<Record<string, unknown>[]> {
  const comparisons = await compareTrials(studyId);

  return comparisons.map(c => ({
    trialId: c.trialId,
    trialName: c.trialName,
    sequence: c.sequence,
    conditionId: c.conditionId,
    conditionName: c.conditionName,
    parameterKey: c.parameterKey,
    parameterValue: c.parameterValue,
    parameters: JSON.stringify(c.parameters),
    status: c.status,
    totalSessions: c.metrics.completion.totalSessions,
    completedSessions: c.metrics.completion.completedSessions,
    successCount: c.metrics.completion.successCount,
    failureCount: c.metrics.completion.failureCount,
    successRate: c.metrics.completion.successRate,
    completionRate: c.metrics.completion.completionRate,
    meanDurationMs: c.metrics.timing.meanDuration,
    minDurationMs: c.metrics.timing.minDuration,
    maxDurationMs: c.metrics.timing.maxDuration,
    medianDurationMs: c.metrics.timing.medianDuration,
    stdDevDurationMs: c.metrics.timing.stdDevDuration,
    totalEvents: c.metrics.events.totalEvents,
    meanEventsPerSession: c.metrics.events.meanEventsPerSession,
  }));
}
