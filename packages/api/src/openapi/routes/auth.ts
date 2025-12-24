/**
 * OpenAPI documentation for authentication routes
 */

import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { registry, commonResponses } from '../config';
import { loginSchema, registerSchema } from '@ariadne/shared';

// Extend Zod with OpenAPI
extendZodWithOpenApi(z);

// Register auth schemas with OpenAPI metadata
const LoginRequestSchema = registry.register(
  'LoginRequest',
  loginSchema.openapi({
    description: 'Login credentials',
    example: {
      email: 'researcher@example.com',
      password: 'your_secure_password_here'
    }
  })
);

const RegisterRequestSchema = registry.register(
  'RegisterRequest',
  registerSchema.openapi({
    description: 'Registration information',
    example: {
      email: 'newresearcher@example.com',
      password: 'your_secure_password_here',
      name: 'Dr. Jane Smith'
    }
  })
);

// Response schemas
const ResearcherSchema = registry.register(
  'Researcher',
  z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string(),
    createdAt: z.string().datetime()
  })
);

const AuthResponseSchema = registry.register(
  'AuthResponse',
  z.object({
    success: z.boolean(),
    data: z.object({
      researcher: ResearcherSchema,
      token: z.string().describe('JWT authentication token')
    })
  }).openapi({
    description: 'Successful authentication response',
    example: {
      success: true,
      data: {
        researcher: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          email: 'researcher@example.com',
          name: 'Dr. Jane Smith',
          createdAt: '2024-01-01T00:00:00Z'
        },
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
      }
    }
  })
);

// Register POST /auth/register
registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/register',
  tags: ['Authentication'],
  summary: 'Register a new researcher account',
  description: 'Create a new researcher account with email and password. Returns the created user and a JWT token.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: RegisterRequestSchema
        }
      }
    }
  },
  responses: {
    201: {
      description: 'Registration successful',
      content: {
        'application/json': {
          schema: AuthResponseSchema
        }
      }
    },
    400: commonResponses.validationError,
    409: {
      description: 'Email already registered',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            error: z.object({
              code: z.string(),
              message: z.string()
            })
          }),
          example: {
            success: false,
            error: {
              code: 'ALREADY_EXISTS',
              message: 'Email already registered'
            }
          }
        }
      }
    },
    429: commonResponses.rateLimitExceeded,
    500: commonResponses.serverError
  }
});

// Register POST /auth/login
registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/login',
  tags: ['Authentication'],
  summary: 'Login as a researcher',
  description: 'Authenticate with email and password. Returns a JWT token for subsequent requests.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: LoginRequestSchema
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Login successful',
      content: {
        'application/json': {
          schema: AuthResponseSchema
        }
      }
    },
    400: commonResponses.validationError,
    401: {
      description: 'Invalid credentials',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            error: z.object({
              code: z.string(),
              message: z.string()
            })
          }),
          example: {
            success: false,
            error: {
              code: 'INVALID_CREDENTIALS',
              message: 'Invalid email or password'
            }
          }
        }
      }
    },
    429: commonResponses.rateLimitExceeded,
    500: commonResponses.serverError
  }
});
