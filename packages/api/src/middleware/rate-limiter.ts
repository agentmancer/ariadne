/**
 * Rate limiting middleware
 */

import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { ERROR_CODES } from '@ariadne/shared';

export const rateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: {
    success: false,
    error: {
      code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
      message: 'Too many requests, please try again later'
    }
  },
  standardHeaders: true,
  legacyHeaders: false
});
