/**
 * API Routes
 */

import { Router } from 'express';
import { authRouter } from './auth';
import { enrollmentRouter } from './enrollment';
import { prolificRouter } from './prolific';
import { projectsRouter } from './projects';
import { studiesRouter } from './studies';
import { conditionsRouter } from './conditions';
import { participantsRouter } from './participants';
import { sessionsRouter } from './sessions';
import { participantSessionRouter } from './participant-session';
import { surveysRouter } from './surveys';
import { eventsRouter } from './events';
import { storyDataRouter } from './story-data';
import { llmProvidersRouter } from './llm-providers';
import { batchExecutionsRouter } from './batch-executions';
import { agentDefinitionsRouter } from './agent-definitions';
import { researchersRouter } from './researchers';
import { architectureConfigsRouter } from './architecture-configs';
import { evaluationRouter } from './evaluation';
import { projectSharesRouter } from './project-shares';
import { enrollmentConfigRouter } from './enrollment-config';
import { experimentsRouter } from './experiments';
import { promptsRouter } from './prompts';
import { modelConfigsRouter } from './model-configs';
import { trialsRouter } from './trials';

export const apiRouter = Router();

// Public routes (no authentication required)
apiRouter.use('/auth', authRouter);
apiRouter.use('/enrollment', enrollmentRouter);  // Human participant enrollment
apiRouter.use('/prolific', prolificRouter);  // Prolific integration

// Admin routes (require admin role)
apiRouter.use('/researchers', researchersRouter);

// Resource routes (require authentication)
apiRouter.use('/projects', projectsRouter);
apiRouter.use('/studies', studiesRouter);
apiRouter.use('/studies/:studyId/enrollment-config', enrollmentConfigRouter);  // Enrollment portal config
apiRouter.use('/conditions', conditionsRouter);
apiRouter.use('/participants', participantsRouter);
apiRouter.use('/sessions', sessionsRouter);
apiRouter.use('/participant-session', participantSessionRouter);  // Participant session management (human participants)
apiRouter.use('/surveys', surveysRouter);
apiRouter.use('/events', eventsRouter);
apiRouter.use('/story-data', storyDataRouter);

// Synthetic actors & LLM integration (Phase 1-2)
apiRouter.use('/llm-providers', llmProvidersRouter);
apiRouter.use('/batch-executions', batchExecutionsRouter);
apiRouter.use('/agent-definitions', agentDefinitionsRouter);
apiRouter.use('/architecture-configs', architectureConfigsRouter);

// Evaluation & Rating Collection (FDG 2026)
apiRouter.use('/evaluation', evaluationRouter);

// Experiment Execution (RFC 003: Evaluation Framework)
apiRouter.use('/experiments', experimentsRouter);

// Prompt Version Control (RFC 003 Phase 2)
apiRouter.use('/prompts', promptsRouter);
apiRouter.use('/model-configs', modelConfigsRouter);

// Trials - Parameter Sweep Experiments (RFC 002)
apiRouter.use('/', trialsRouter);  // Uses /studies/:studyId/trials and /trials/:id patterns

// Project Sharing (Collaboration between researchers)
apiRouter.use('/projects', projectSharesRouter);  // Mounted on /projects for nested share routes
apiRouter.use('/project-shares', projectSharesRouter);  // Also available at /project-shares for my-shares endpoint
