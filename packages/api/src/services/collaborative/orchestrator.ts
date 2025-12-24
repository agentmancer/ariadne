/**
 * Collaborative Session Orchestrator
 *
 * Manages the lifecycle of a paired agent collaborative study session.
 * Coordinates phase transitions, story/feedback exchange, and round progression.
 *
 * Round Flow:
 * 1. AUTHOR phase: Both agents write/revise their stories
 * 2. PLAY phase: Each agent plays their partner's story
 * 3. REVIEW phase: Each agent provides feedback on partner's story
 * 4. Repeat for configured number of rounds
 */

import {
  CollaborativePhase,
  AgentCollaborativeContext,
  StoryDraftEntry,
  PlayExperienceEntry,
  FeedbackEntry,
  LearningEntry,
  CommentType,
} from '@ariadne/shared';
import { prisma } from '../../lib/prisma';
import { LLMAdapter } from '../llm/types';
import { TwineCollaborativeAdapter, CollaborativeRoleContext } from '../llm/adapters/twine/collaborative-adapter';
import { uploadToS3, generateStoryKey, deleteFromS3 } from '../s3';
import {
  getOrCreateAgentContext,
  getAgentContext,
  updatePhase,
  advanceRound,
  addStoryDraft,
  addPlayExperience,
  addFeedbackGiven,
  addFeedbackReceived,
  addLearning,
} from './agent-context';
import {
  createComment,
  getCommentsReceived,
  CreateCommentInput,
} from './comments';

/**
 * Plugin type constants to avoid magic strings
 */
export const PLUGIN_TYPES = {
  COLLABORATIVE_TWINE: 'collaborative-twine',
} as const;

/**
 * Maximum depth for comment thread fetching to prevent unbounded queries
 */
export const MAX_COMMENT_THREAD_DEPTH = 10;

/**
 * Helper to safely get agent context with error handling
 */
async function safeGetAgentContext(participantId: string): Promise<AgentCollaborativeContext> {
  const context = await getAgentContext(participantId);
  if (!context) {
    throw new Error(`AgentContext not found for participant ${participantId}`);
  }
  return context;
}

/**
 * Helper to safely get LLM adapter from agent (throws if not set)
 */
function requireLLM(agent: AgentSessionState): LLMAdapter {
  if (!agent.llm) {
    throw new Error(`LLM adapter not set for agent ${agent.participantId}`);
  }
  return agent.llm;
}

/**
 * Simplified story state for the orchestrator
 */
interface SimpleStoryState {
  passages: Array<{
    name: string;
    text: string;
    links?: Array<{
      text: string;
      target: string;
    }>;
  }>;
  startPassage: string;
  currentLocation?: string;
  history: string[];
}

/**
 * Configuration for a collaborative session
 */
export interface CollaborativeSessionConfig {
  /** Total number of rounds */
  rounds: number;
  /** Phases to execute per round */
  phases: CollaborativePhase[];
  /** Story genre/theme constraints */
  storyConstraints?: {
    genre?: string;
    theme?: string;
    maxPassages?: number;
    minPassages?: number;
  };
  /** Whether feedback is required before revision */
  feedbackRequired: boolean;
  /** Maximum actions per play session */
  maxPlayActions?: number;
}

/**
 * State for a single agent in the collaborative session
 */
export interface AgentSessionState {
  participantId: string;
  partnerId: string;
  context: AgentCollaborativeContext;
  currentStory?: SimpleStoryState;
  /** LLM adapter - must be set before calling runSession */
  llm: LLMAdapter | null;
}

/**
 * Result of a phase execution
 */
export interface PhaseResult {
  phase: CollaborativePhase;
  round: number;
  participantId: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

/**
 * Collaborative Session Orchestrator
 */
export class CollaborativeSessionOrchestrator {
  private adapter: TwineCollaborativeAdapter;
  private config: CollaborativeSessionConfig;

  constructor(config: CollaborativeSessionConfig) {
    this.config = config;
    this.adapter = new TwineCollaborativeAdapter();
  }

  /**
   * Initialize a collaborative session for a paired set of agents
   */
  async initializeSession(
    participantAId: string,
    participantBId: string
  ): Promise<{ agentA: AgentSessionState; agentB: AgentSessionState }> {
    // Get or create contexts for both participants
    const [contextA, contextB] = await Promise.all([
      getOrCreateAgentContext(participantAId),
      getOrCreateAgentContext(participantBId),
    ]);

    // Update partner references in the database
    await Promise.all([
      prisma.participant.update({
        where: { id: participantAId },
        data: { partnerId: participantBId },
      }),
      prisma.participant.update({
        where: { id: participantBId },
        data: { partnerId: participantAId },
      }),
    ]);

    return {
      agentA: {
        participantId: participantAId,
        partnerId: participantBId,
        context: contextA,
        llm: null, // Must be set by caller before runSession
      },
      agentB: {
        participantId: participantBId,
        partnerId: participantAId,
        context: contextB,
        llm: null, // Must be set by caller before runSession
      },
    };
  }

  /**
   * Run a complete collaborative session for paired agents
   */
  async runSession(
    agentA: AgentSessionState,
    agentB: AgentSessionState,
    onProgress?: (event: { phase: string; round: number; agent: string; status: string }) => void
  ): Promise<{
    rounds: Array<{
      round: number;
      results: PhaseResult[];
    }>;
    finalContextA: AgentCollaborativeContext;
    finalContextB: AgentCollaborativeContext;
  }> {
    // Validate LLM adapters are set
    if (!agentA.llm) {
      throw new Error('LLM adapter not set for agent A. Set agentA.llm before calling runSession.');
    }
    if (!agentB.llm) {
      throw new Error('LLM adapter not set for agent B. Set agentB.llm before calling runSession.');
    }

    const rounds: Array<{ round: number; results: PhaseResult[] }> = [];

    for (let round = 1; round <= this.config.rounds; round++) {
      const roundResults: PhaseResult[] = [];

      for (const phase of this.config.phases) {
        onProgress?.({ phase, round, agent: 'A', status: 'starting' });
        onProgress?.({ phase, round, agent: 'B', status: 'starting' });

        // Execute phase for both agents in parallel with proper error handling
        const results = await Promise.allSettled([
          this.executePhase(agentA, agentB, phase, round),
          this.executePhase(agentB, agentA, phase, round),
        ]);

        // Handle results, capturing any errors
        const resultA = results[0].status === 'fulfilled'
          ? results[0].value
          : {
              phase,
              round,
              participantId: agentA.participantId,
              success: false,
              error: results[0].reason instanceof Error ? results[0].reason.message : 'Unknown error',
            };

        const resultB = results[1].status === 'fulfilled'
          ? results[1].value
          : {
              phase,
              round,
              participantId: agentB.participantId,
              success: false,
              error: results[1].reason instanceof Error ? results[1].reason.message : 'Unknown error',
            };

        roundResults.push(resultA, resultB);

        onProgress?.({ phase, round, agent: 'A', status: resultA.success ? 'completed' : 'failed' });
        onProgress?.({ phase, round, agent: 'B', status: resultB.success ? 'completed' : 'failed' });

        // Exchange data between agents after each phase
        await this.exchangePhaseData(phase);
      }

      // Advance to next round
      if (round < this.config.rounds) {
        await Promise.all([
          advanceRound(agentA.participantId),
          advanceRound(agentB.participantId),
        ]);
        // Refresh contexts
        agentA.context = await safeGetAgentContext(agentA.participantId);
        agentB.context = await safeGetAgentContext(agentB.participantId);
      }

      rounds.push({ round, results: roundResults });
    }

    // Get final contexts
    const [finalContextA, finalContextB] = await Promise.all([
      safeGetAgentContext(agentA.participantId),
      safeGetAgentContext(agentB.participantId),
    ]);

    return {
      rounds,
      finalContextA,
      finalContextB,
    };
  }

  /**
   * Execute a single phase for one agent
   */
  async executePhase(
    agent: AgentSessionState,
    partner: AgentSessionState,
    phase: CollaborativePhase,
    round: number
  ): Promise<PhaseResult> {
    try {
      // Update agent's current phase
      await updatePhase(agent.participantId, phase);
      agent.context = await safeGetAgentContext(agent.participantId);

      switch (phase) {
        case CollaborativePhase.AUTHOR:
          return await this.executeAuthorPhase(agent, round);
        case CollaborativePhase.PLAY:
          return await this.executePlayPhase(agent, partner, round);
        case CollaborativePhase.REVIEW:
          return await this.executeReviewPhase(agent, partner, round);
        default:
          throw new Error(`Unknown phase: ${phase}`);
      }
    } catch (error) {
      return {
        phase,
        round,
        participantId: agent.participantId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Execute AUTHOR phase - agent writes/revises their story
   */
  private async executeAuthorPhase(
    agent: AgentSessionState,
    round: number
  ): Promise<PhaseResult> {
    // Get partner's feedback if this is a revision round
    let partnerFeedback: unknown[] = [];
    if (round > 1 && this.config.feedbackRequired) {
      partnerFeedback = await getCommentsReceived(agent.participantId, {
        round: round - 1,
        phase: CollaborativePhase.REVIEW,
      });
    }

    // Build collaborative context for the adapter
    const collaborativeContext: CollaborativeRoleContext = {
      state: this.storyToState(agent.currentStory),
      role: 'COLLABORATIVE',
      collaborativeContext: agent.context,
      partnerFeedback: partnerFeedback as any[],
      round,
      config: this.config.storyConstraints,
    };

    // Generate story
    const action = await this.adapter.generateAction(requireLLM(agent), collaborativeContext);

    if (action.type !== 'CREATE_STORY') {
      throw new Error(`Expected CREATE_STORY action, got ${action.type}`);
    }

    const params = action.params as Record<string, unknown>;

    // Update agent's current story state
    const passages = params.passages as SimpleStoryState['passages'] || [];
    const startPassage = params.startPassage as string || 'Start';

    agent.currentStory = {
      passages,
      startPassage,
      currentLocation: undefined,
      history: [],
    };

    // Save story to S3 and database
    const storyDataId = await this.saveStory(agent.participantId, round, agent.currentStory);

    // Add to agent's context
    const storySummary = params.storySummary as string | undefined;
    const draftEntry: Omit<StoryDraftEntry, 'createdAt'> = {
      round,
      storyDataId,
      summary: storySummary || 'Story created',
    };
    await addStoryDraft(agent.participantId, draftEntry);

    // Refresh context
    agent.context = await safeGetAgentContext(agent.participantId);

    return {
      phase: CollaborativePhase.AUTHOR,
      round,
      participantId: agent.participantId,
      success: true,
      data: {
        storyDataId,
        passageCount: passages.length,
        summary: storySummary,
      },
    };
  }

  /**
   * Execute PLAY phase - agent plays partner's story
   */
  private async executePlayPhase(
    agent: AgentSessionState,
    partner: AgentSessionState,
    round: number
  ): Promise<PhaseResult> {
    if (!partner.currentStory) {
      throw new Error('Partner has no story to play');
    }

    // Initialize play state
    const playState: SimpleStoryState = {
      ...partner.currentStory,
      currentLocation: partner.currentStory.startPassage,
      history: [],
    };

    const choicesMade: Array<{ passageId: string; choiceText: string; reasoning?: string }> = [];
    const observations: string[] = [];
    let playNotes = '';
    let actionCount = 0;
    const maxActions = this.config.maxPlayActions || 20;

    // Play through the story
    while (actionCount < maxActions) {
      // Get available choices at current passage
      const availableActions = this.getAvailableChoices(playState);

      if (availableActions.length === 0) {
        // Reached an ending
        playNotes += '\nReached story ending.';
        break;
      }

      // Build context for play
      const collaborativeContext: CollaborativeRoleContext = {
        state: this.storyToState(playState),
        role: 'COLLABORATIVE',
        collaborativeContext: agent.context,
        partnerStory: this.storyToState(partner.currentStory),
        availableActions,
        round,
      };

      // Get agent's choice
      const action = await this.adapter.generateAction(requireLLM(agent), collaborativeContext);
      const params = action.params as Record<string, unknown> | undefined;

      // Record the choice
      if (params) {
        const choiceText = (params.choiceText as string) || (params._llmReasoning as string) || 'choice made';
        const reasoning = params._llmReasoning as string | undefined;

        choicesMade.push({
          passageId: playState.currentLocation || 'unknown',
          choiceText,
          reasoning,
        });

        // Record observation if any
        const observation = params._llmObservation as string | undefined;
        if (observation) {
          observations.push(observation);
        }

        // Navigate to next passage
        const passageName = params.passageName as string | undefined;
        if (passageName) {
          playState.history.push(playState.currentLocation || '');
          playState.currentLocation = passageName;
        }
      }

      actionCount++;
    }

    // Build overall impression
    const overallImpression = observations.length > 0
      ? observations[observations.length - 1]
      : `Played through ${actionCount} passages`;

    // Validate partner's story exists for this round
    const partnerStoryDraft = partner.context.ownStoryDrafts.find(d => d.round === round);
    if (!partnerStoryDraft?.storyDataId) {
      throw new Error(`Partner's story for round ${round} not found during play phase`);
    }

    // Record play experience
    const playExperience: PlayExperienceEntry = {
      round,
      storyDataId: partnerStoryDraft.storyDataId,
      playNotes,
      choicesMade,
      observations,
      overallImpression,
    };
    await addPlayExperience(agent.participantId, playExperience);

    // Refresh context
    agent.context = await safeGetAgentContext(agent.participantId);

    return {
      phase: CollaborativePhase.PLAY,
      round,
      participantId: agent.participantId,
      success: true,
      data: {
        choicesMade: choicesMade.length,
        observations: observations.length,
        reachedEnding: actionCount < maxActions,
      },
    };
  }

  /**
   * Execute REVIEW phase - agent provides feedback on partner's story
   */
  private async executeReviewPhase(
    agent: AgentSessionState,
    partner: AgentSessionState,
    round: number
  ): Promise<PhaseResult> {
    // Build context for review
    const collaborativeContext: CollaborativeRoleContext = {
      state: this.storyToState(partner.currentStory),
      role: 'COLLABORATIVE',
      collaborativeContext: agent.context,
      partnerStory: this.storyToState(partner.currentStory),
      round,
    };

    // Generate feedback
    const action = await this.adapter.generateAction(requireLLM(agent), collaborativeContext);

    if (action.type !== 'SUBMIT_FEEDBACK') {
      throw new Error(`Expected SUBMIT_FEEDBACK action, got ${action.type}`);
    }

    const params = action.params as Record<string, unknown>;
    const strengths = (params.strengths as string[]) || [];
    const improvements = (params.improvements as string[]) || [];
    const overallAssessment = params.overallAssessment as string | undefined;
    const comments = (params.comments as Array<{ passageId?: string; content: string; type: string }>) || [];

    // Validate partner's story exists for this round
    const partnerStoryDraft = partner.context.ownStoryDrafts.find(d => d.round === round);
    if (!partnerStoryDraft?.storyDataId) {
      throw new Error(`Partner's story for round ${round} not found`);
    }

    // Create comments in the database
    for (const comment of comments) {
      // Validate and map comment type to CommentType enum
      const validTypes = Object.values(CommentType);
      const commentType = validTypes.includes(comment.type as CommentType)
        ? (comment.type as CommentType)
        : CommentType.FEEDBACK; // Default to FEEDBACK for unknown types

      const commentInput: CreateCommentInput = {
        authorId: agent.participantId,
        targetParticipantId: partner.participantId,
        storyDataId: partnerStoryDraft.storyDataId,
        passageId: comment.passageId,
        content: comment.content,
        commentType,
        round,
        phase: CollaborativePhase.REVIEW,
      };
      await createComment(commentInput);
    }

    // Record feedback given
    const feedbackEntry: FeedbackEntry = {
      round,
      comments: comments.map((c) => c.content),
      strengths,
      improvements,
      overallAssessment,
    };
    await addFeedbackGiven(agent.participantId, feedbackEntry);

    // Record feedback received by partner
    await addFeedbackReceived(partner.participantId, feedbackEntry);

    // Extract learnings from the feedback process
    if (strengths.length > 0) {
      const learning: LearningEntry = {
        round,
        insight: `Good technique observed: ${strengths[0]}`,
        category: 'storytelling',
      };
      await addLearning(agent.participantId, learning);
    }

    // Refresh contexts
    agent.context = await safeGetAgentContext(agent.participantId);

    return {
      phase: CollaborativePhase.REVIEW,
      round,
      participantId: agent.participantId,
      success: true,
      data: {
        strengths: strengths.length,
        improvements: improvements.length,
        comments: comments.length,
      },
    };
  }

  /**
   * Exchange data between agents after a phase completes
   *
   * Note: This method is intentionally a no-op for most cases because:
   * - After AUTHOR phase: Stories are saved directly to DB/S3, contexts refresh at next phase
   * - After PLAY phase: Play experiences are recorded in agent contexts
   * - After REVIEW phase: Feedback is recorded via addFeedbackGiven/addFeedbackReceived
   *
   * This hook exists for future extensions (e.g., real-time notifications, webhooks)
   */
  private async exchangePhaseData(
    _phase: CollaborativePhase
  ): Promise<void> {
    // Currently a no-op - data exchange happens inline during phase execution
    // Keep this hook for future extensibility (notifications, webhooks, etc.)
  }

  /**
   * Convert SimpleStoryState to the state format expected by the adapter
   */
  private storyToState(story?: SimpleStoryState): any {
    if (!story) {
      return { content: {} };
    }
    return {
      content: {
        passages: story.passages,
        startPassage: story.startPassage,
      },
      currentLocation: story.currentLocation,
      history: story.history,
    };
  }

  /**
   * Get available navigation choices at current passage
   */
  private getAvailableChoices(state: SimpleStoryState): any[] {
    const passages = state.passages || [];
    const currentPassage = passages.find(
      (p) => p.name === state.currentLocation
    );

    if (!currentPassage || !currentPassage.links) {
      return [];
    }

    return currentPassage.links.map((link, index) => ({
      type: 'NAVIGATE_TO',
      params: {
        passageName: link.target,
        choiceText: link.text,
      },
      metadata: {
        description: link.text,
        index,
      },
    }));
  }

  /**
   * Save story to database and S3
   */
  private async saveStory(
    participantId: string,
    round: number,
    storyContent: SimpleStoryState
  ): Promise<string> {
    const pluginType = PLUGIN_TYPES.COLLABORATIVE_TWINE;

    // Use transaction to ensure atomic version increment and record creation
    return await prisma.$transaction(async (tx) => {
      // Get next version number within transaction
      const latestStory = await tx.storyData.findFirst({
        where: {
          participantId,
          pluginType,
        },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const version = (latestStory?.version ?? 0) + 1;

      // Generate S3 key and upload
      const s3Key = generateStoryKey(participantId, pluginType, version);
      const storyJson = JSON.stringify({
        ...storyContent,
        round,
        createdAt: new Date().toISOString(),
      });

      let uploadResult: { bucket: string; key: string; size: number };
      try {
        uploadResult = await uploadToS3(s3Key, storyJson, 'application/json', {
          participantId,
          pluginType,
          version: version.toString(),
          round: round.toString(),
        });
      } catch (error) {
        throw new Error(`Failed to upload story to S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Create database record within transaction
      try {
        const storyData = await tx.storyData.create({
          data: {
            participantId,
            pluginType,
            version,
            s3Key: uploadResult.key,
            s3Bucket: uploadResult.bucket,
            name: `Round ${round} Story`,
            description: `Collaborative story created in round ${round}`,
          },
        });

        return storyData.id;
      } catch (dbError) {
        // Clean up S3 object if DB creation fails
        try {
          await deleteFromS3(s3Key, uploadResult.bucket);
        } catch (cleanupError) {
          // Log cleanup failure - the transaction will still rollback
          console.error('Failed to clean up S3 object after DB error:', s3Key, cleanupError);
        }
        throw new Error(`Failed to create story record: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`);
      }
    });
  }
}

/**
 * Create a new orchestrator instance
 */
export function createOrchestrator(
  config: Partial<CollaborativeSessionConfig> = {}
): CollaborativeSessionOrchestrator {
  const defaultConfig: CollaborativeSessionConfig = {
    rounds: 3,
    phases: [CollaborativePhase.AUTHOR, CollaborativePhase.PLAY, CollaborativePhase.REVIEW],
    feedbackRequired: true,
    maxPlayActions: 20,
    ...config,
  };

  return new CollaborativeSessionOrchestrator(defaultConfig);
}
