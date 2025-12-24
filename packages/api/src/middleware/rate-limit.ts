import { Request } from 'express';
import rateLimit from 'express-rate-limit';

// Note: Redis store can be added later by installing rate-limit-redis and redis packages
// For now, using in-memory rate limiting which is sufficient for development

// Default rate limiter - 100 requests per 15 minutes per IP
export const defaultLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Strict rate limiter for auth endpoints - 5 requests per 15 minutes
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: 'Too many authentication attempts, please try again later.',
  skipSuccessfulRequests: true, // Don't count successful requests
  skip: () => process.env.NODE_ENV === 'test', // Skip rate limiting in tests
});

// API rate limiter - 1000 requests per hour for authenticated users
export const apiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1000, // Limit each user to 1000 requests per hour
  keyGenerator: (req: Request) => {
    // Use user ID if authenticated, otherwise use IP
    return (req as any).user?.id || req.ip || 'unknown';
  },
  message: 'API rate limit exceeded, please try again later.',
});

// Batch execution limiter - 10 batch executions per day
export const batchLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 10, // Limit to 10 batch executions per day
  keyGenerator: (req: Request) => {
    // Use researcher ID
    return (req as any).user?.id || 'anonymous';
  },
  message: 'Batch execution limit exceeded. Maximum 10 batches per day.',
});

// Health check endpoint should not be rate limited
export const skipHealthCheck = (req: Request): boolean => {
  return req.path === '/health' || req.path === '/metrics';
};
