/**
 * LLM Providers routes - Placeholder implementation
 */

import { Router } from 'express';

export const llmProvidersRouter = Router();

// TODO: Implement LLM providers management
llmProvidersRouter.get('/', (_req, res) => {
  res.status(501).json({
    success: false,
    error: {
      code: 'NOT_IMPLEMENTED',
      message: 'LLM providers endpoints are not yet implemented'
    }
  });
});

export default llmProvidersRouter;