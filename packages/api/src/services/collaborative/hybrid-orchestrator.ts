/**
 * Hybrid Session Orchestrator
 *
 * Extends collaborative session management to support mixed human/synthetic participants.
 * Unlike the synchronous orchestrator that runs both agents in parallel,
 * this orchestrator handles async phase transitions where humans may take time.
 *
 * Execution Modes:
 * - SYNCHRONOUS: Both synthetic, run immediately (delegates to base orchestrator)
 * - ASYNCHRONOUS: Has human, wait for phase submissions then trigger synthetic
 * - TIMED: Legacy time-based progression (SessionStage)
 */

import {
  CollaborativePhase,
  StudyExecutionMode,
  PhaseCompletionStatus,
  PhaseCompletion,
  HybridStudyConfig,
  HybridSessionState,
  PhaseReadyEvent,
  PhaseCompleteEvent,
  ParticipantType,
} from '@ariadne/shared';
import { prisma } from '../../lib/prisma';  // Used for Comment queries
import { EventEmitter } from 'events';
import {
  CollaborativeSessionOrchestrator,
  AgentSessionState,
  PhaseResult,
  CollaborativeSessionConfig,
} from './orchestrator';
import {
  getOrCreateAgentContext,
  getAgentContext,
  updatePhase,
} from './agent-context';
import { LLMAdapter } from '../llm/types';

/**
 * Events emitted by the hybrid orchestrator
 */
export interface HybridOrchestratorEvents {
  'phase:ready': (event: PhaseReadyEvent) => void;
  'phase:complete': (event: PhaseCompleteEvent) => void;
  'session:complete': (sessionId: string) => void;
  'error': (error: Error, context: { participantId: string; phase: CollaborativePhase }) => void;
}

/**
 * Hybrid Session Orchestrator
 * Manages collaborative sessions with mixed human/synthetic participants
 */
export class HybridSessionOrchestrator extends EventEmitter {
  private config: HybridStudyConfig;
  private baseOrchestrator: CollaborativeSessionOrchestrator;
  private sessionStates: Map<string, HybridSessionState> = new Map();

  constructor(config: HybridStudyConfig) {
    super();
    this.config = config;

    // Create base orchestrator for synchronous phase execution
    const baseConfig: CollaborativeSessionConfig = {
      rounds: config.collaboration.rounds,
      phases: config.collaboration.phasesPerRound,
      feedbackRequired: config.collaboration.feedbackRequired,
      maxPlayActions: config.maxPlayActions || 20,  // Configurable, default 20
    };
    this.baseOrchestrator = new CollaborativeSessionOrchestrator(baseConfig);
  }

  /**
   * Initialize a hybrid session
   */
  async initializeSession(
    sessionId: string,
    studyId: string,
    participantAId: string,
    participantBId: string,
    participantAType: ParticipantType,
    participantBType: ParticipantType
  ): Promise<HybridSessionState> {
    // Initialize base session (sets up partner references)
    await this.baseOrchestrator.initializeSession(
      participantAId,
      participantBId
    );

    // Create hybrid session state
    const state: HybridSessionState = {
      sessionId,
      studyId,
      participantA: {
        id: participantAId,
        type: participantAType,
        currentPhase: CollaborativePhase.AUTHOR,
        currentRound: 1,
        completions: [],
      },
      participantB: {
        id: participantBId,
        type: participantBType,
        currentPhase: CollaborativePhase.AUTHOR,
        currentRound: 1,
        completions: [],
      },
      config: this.config,
      startedAt: new Date().toISOString(),
    };

    this.sessionStates.set(sessionId, state);

    // Store session state in database
    await this.persistSessionState(sessionId, state);

    // Emit phase ready events for first phase
    await this.emitPhaseReady(state, participantAId, 1, CollaborativePhase.AUTHOR);
    await this.emitPhaseReady(state, participantBId, 1, CollaborativePhase.AUTHOR);

    return state;
  }

  /**
   * Handle phase completion by a participant
   * This is the main entry point for human submissions
   */
  async onPhaseComplete(
    sessionId: string,
    participantId: string,
    result: PhaseCompletion['result']
  ): Promise<void> {
    const state = await this.getSessionState(sessionId);
    if (!state) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const { participant, partner } = this.getParticipants(state, participantId);

    // Record completion
    const completion: PhaseCompletion = {
      participantId,
      partnerId: partner.id,  // partnerId is optional but we have it here
      round: participant.currentRound,
      phase: participant.currentPhase,
      status: PhaseCompletionStatus.COMPLETED,
      completedAt: new Date().toISOString(),
      result,
    };
    participant.completions.push(completion);

    // Emit phase complete event
    this.emit('phase:complete', {
      participantId,
      partnerId: partner.id,
      round: participant.currentRound,
      phase: participant.currentPhase,
      completedAt: completion.completedAt!,
      result,
    } as PhaseCompleteEvent);

    // Persist state
    await this.persistSessionState(sessionId, state);

    // Check if we should trigger synthetic partner
    if (this.isSynthetic(partner.type)) {
      await this.triggerSyntheticPhase(state, partner.id, participant.id);
    }

    // Check if both participants have completed this phase
    const partnerCompleted = partner.completions.some(
      c => c.round === participant.currentRound &&
           c.phase === participant.currentPhase &&
           c.status === PhaseCompletionStatus.COMPLETED
    );

    if (partnerCompleted) {
      await this.advanceToNextPhase(state, participantId);
      await this.advanceToNextPhase(state, partner.id);
    }
  }

  /**
   * Trigger synthetic partner to complete their phase
   */
  async triggerSyntheticPhase(
    state: HybridSessionState,
    syntheticId: string,
    humanId: string,
    llmAdapter?: LLMAdapter
  ): Promise<PhaseResult | null> {
    const synthetic = state.participantA.id === syntheticId
      ? state.participantA
      : state.participantB;
    // Note: humanId is used for context retrieval and agent building below

    // Check if synthetic has already completed this phase
    const alreadyCompleted = synthetic.completions.some(
      c => c.round === synthetic.currentRound &&
           c.phase === synthetic.currentPhase &&
           c.status === PhaseCompletionStatus.COMPLETED
    );

    if (alreadyCompleted) {
      return null;
    }

    // Get agent contexts
    const [syntheticContext, humanContext] = await Promise.all([
      getOrCreateAgentContext(syntheticId),
      getAgentContext(humanId),
    ]);

    if (!humanContext) {
      throw new Error(`Human context not found for ${humanId}`);
    }

    // Build agent session states
    const syntheticAgent: AgentSessionState = {
      participantId: syntheticId,
      partnerId: humanId,
      context: syntheticContext,
      llm: llmAdapter || null,
    };

    const humanAgent: AgentSessionState = {
      participantId: humanId,
      partnerId: syntheticId,
      context: humanContext,
      llm: null, // Human doesn't need LLM
    };

    // If no LLM adapter provided, we need to get one from the config
    if (!llmAdapter && this.config.syntheticPartner?.agentDefinitionId) {
      // The caller should provide the LLM adapter
      throw new Error('LLM adapter required for synthetic partner execution');
    }

    if (!syntheticAgent.llm) {
      throw new Error('LLM adapter not set for synthetic agent');
    }

    // Apply response delay if configured
    if (this.config.syntheticPartner?.responseDelayMs) {
      await this.delay(this.config.syntheticPartner.responseDelayMs);
    }

    // Execute the phase for synthetic partner
    const result = await this.baseOrchestrator.executePhase(
      syntheticAgent,
      humanAgent,
      synthetic.currentPhase,
      synthetic.currentRound
    );

    if (result.success) {
      // Record completion with runtime-validated data
      await this.onPhaseComplete(state.sessionId, syntheticId, {
        storyDataId: typeof result.data?.storyDataId === 'string' ? result.data.storyDataId : undefined,
        playSessionId: typeof result.data?.playSessionId === 'string' ? result.data.playSessionId : undefined,
        feedbackIds: Array.isArray(result.data?.feedbackIds) ? result.data.feedbackIds : undefined,
      });
    } else {
      // Record failure
      const completion: PhaseCompletion = {
        participantId: syntheticId,
        partnerId: humanId,
        round: synthetic.currentRound,
        phase: synthetic.currentPhase,
        status: PhaseCompletionStatus.FAILED,
        completedAt: new Date().toISOString(),
      };
      synthetic.completions.push(completion);
      await this.persistSessionState(state.sessionId, state);

      this.emit('error', new Error(result.error || 'Unknown error'), {
        participantId: syntheticId,
        phase: synthetic.currentPhase,
      });
    }

    return result;
  }

  /**
   * Advance participant to the next phase
   */
  private async advanceToNextPhase(
    state: HybridSessionState,
    participantId: string
  ): Promise<void> {
    const { participant, partner } = this.getParticipants(state, participantId);

    const phases = this.config.collaboration.phasesPerRound;
    const currentPhaseIndex = phases.indexOf(participant.currentPhase);
    const isLastPhase = currentPhaseIndex === phases.length - 1;
    const isLastRound = participant.currentRound === this.config.collaboration.rounds;

    if (isLastPhase) {
      if (isLastRound) {
        // Session complete
        state.completedAt = new Date().toISOString();
        await this.persistSessionState(state.sessionId, state);
        this.emit('session:complete', state.sessionId);
        return;
      }

      // Advance to next round
      participant.currentRound++;
      participant.currentPhase = phases[0];
    } else {
      // Advance to next phase
      participant.currentPhase = phases[currentPhaseIndex + 1];
    }

    // Update in database
    await updatePhase(participantId, participant.currentPhase);
    await this.persistSessionState(state.sessionId, state);

    // Emit phase ready event with partner content
    await this.emitPhaseReady(
      state,
      participantId,
      participant.currentRound,
      participant.currentPhase,
      partner.id
    );
  }

  /**
   * Emit a phase ready event for a participant
   */
  private async emitPhaseReady(
    state: HybridSessionState,
    participantId: string,
    round: number,
    phase: CollaborativePhase,
    partnerId?: string
  ): Promise<void> {
    let partnerContent: PhaseReadyEvent['partnerContent'];

    if (partnerId) {
      // Get partner's content for this phase
      if (phase === CollaborativePhase.PLAY) {
        // Get partner's story for playing
        const storyData = await this.getLatestStoryForRound(partnerId, round);
        if (storyData) {
          partnerContent = { storyDataId: storyData.id };
        }
      } else if (phase === CollaborativePhase.AUTHOR && round > 1) {
        // Get feedback on our story from partner
        const feedback = await this.getFeedbackForRound(participantId, round - 1);
        if (feedback.length > 0) {
          partnerContent = { feedbackIds: feedback.map(f => f.id) };
        }
      }
    }

    const timeLimit = this.config.phaseTimeLimits?.[phase];

    const event: PhaseReadyEvent = {
      participantId,
      round,
      phase,
      partnerContent,
      timeLimit,
    };

    this.emit('phase:ready', event);

    // Create pending completion record
    const participant = state.participantA.id === participantId
      ? state.participantA
      : state.participantB;

    const pendingCompletion: PhaseCompletion = {
      participantId,
      partnerId: partnerId || '',
      round,
      phase,
      status: PhaseCompletionStatus.IN_PROGRESS,
      startedAt: new Date().toISOString(),
    };
    participant.completions.push(pendingCompletion);
    await this.persistSessionState(state.sessionId, state);
  }

  /**
   * Get session state, loading from storage if not cached
   */
  async getSessionState(sessionId: string): Promise<HybridSessionState | null> {
    const cachedState = this.sessionStates.get(sessionId);
    if (cachedState) {
      return cachedState;
    }

    // Load from storage
    const loadedState = await this.loadSessionState(sessionId);
    if (loadedState) {
      this.sessionStates.set(sessionId, loadedState);
    }

    return loadedState;
  }

  /**
   * Get participant's current phase status
   */
  async getParticipantPhaseStatus(
    sessionId: string,
    participantId: string
  ): Promise<{
    phase: CollaborativePhase;
    round: number;
    status: PhaseCompletionStatus;
    partnerReady: boolean;
  } | null> {
    const state = await this.getSessionState(sessionId);
    if (!state) return null;

    const participant = state.participantA.id === participantId
      ? state.participantA
      : state.participantB;
    const partner = state.participantA.id === participantId
      ? state.participantB
      : state.participantA;

    // Get current phase status
    const currentCompletion = participant.completions.find(
      c => c.round === participant.currentRound &&
           c.phase === participant.currentPhase
    );

    // Check if partner is ready (has completed their phase)
    const partnerReady = partner.completions.some(
      c => c.round === participant.currentRound &&
           c.phase === participant.currentPhase &&
           c.status === PhaseCompletionStatus.COMPLETED
    );

    return {
      phase: participant.currentPhase,
      round: participant.currentRound,
      status: currentCompletion?.status || PhaseCompletionStatus.PENDING,
      partnerReady,
    };
  }

  /**
   * Check if a participant type should be treated as synthetic (AI-controlled)
   * Any non-human participant is treated as synthetic
   */
  private isSynthetic(type: ParticipantType): boolean {
    return type !== ParticipantType.HUMAN;
  }

  /**
   * Get participant and partner from session state
   * Helper method to reduce duplication
   */
  private getParticipants(state: HybridSessionState, participantId: string) {
    const isParticipantA = state.participantA.id === participantId;
    return {
      participant: isParticipantA ? state.participantA : state.participantB,
      partner: isParticipantA ? state.participantB : state.participantA,
    };
  }

  /**
   * Persist session state
   * Currently uses in-memory storage via sessionStates Map
   * TODO: Add Redis or database persistence for production use
   */
  private async persistSessionState(_sessionId: string, state: HybridSessionState): Promise<void> {
    // State is already stored in sessionStates Map
    // This hook exists for future persistence to Redis/database
    this.sessionStates.set(state.sessionId, state);
  }

  /**
   * Load session state from storage
   * Currently only uses in-memory Map
   * TODO: Add Redis or database loading for production use
   */
  private async loadSessionState(sessionId: string): Promise<HybridSessionState | null> {
    // For now, just return from Map (session must be active)
    return this.sessionStates.get(sessionId) || null;
  }

  /**
   * Get latest story for a participant in a round
   */
  private async getLatestStoryForRound(
    participantId: string,
    round: number
  ): Promise<{ id: string } | null> {
    const context = await getAgentContext(participantId);
    if (!context) return null;

    const draft = context.ownStoryDrafts.find(d => d.round === round);
    if (!draft) return null;

    return { id: draft.storyDataId };
  }

  /**
   * Get feedback given to a participant in a round
   */
  private async getFeedbackForRound(
    participantId: string,
    round: number
  ): Promise<Array<{ id: string }>> {
    const comments = await prisma.comment.findMany({
      where: {
        targetParticipantId: participantId,
        round,
        phase: CollaborativePhase.REVIEW,
      },
      select: { id: true },
    });

    return comments;
  }

  /**
   * Helper to delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create a hybrid orchestrator instance
 */
export function createHybridOrchestrator(
  config: HybridStudyConfig
): HybridSessionOrchestrator {
  return new HybridSessionOrchestrator(config);
}

/**
 * Determine execution mode based on participant types
 */
export function determineExecutionMode(
  participantAType: ParticipantType,
  participantBType: ParticipantType
): StudyExecutionMode {
  // Only purely synthetic pairs run synchronously
  // Any non-synthetic participant (HUMAN, HYBRID_*) requires async execution
  const aIsPurelySynthetic = participantAType === ParticipantType.SYNTHETIC;
  const bIsPurelySynthetic = participantBType === ParticipantType.SYNTHETIC;

  if (aIsPurelySynthetic && bIsPurelySynthetic) {
    return StudyExecutionMode.SYNCHRONOUS;
  }

  return StudyExecutionMode.ASYNCHRONOUS;
}
