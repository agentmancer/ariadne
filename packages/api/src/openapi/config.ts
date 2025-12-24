/**
 * OpenAPI Configuration
 * Generates OpenAPI 3.0 specification from Zod schemas and route definitions
 */

import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { config } from '../config';

// Create OpenAPI registry
export const registry = new OpenAPIRegistry();

// Register security schemes
registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description: 'JWT token obtained from /api/v1/auth/login'
});

// Base OpenAPI configuration
const openApiConfig = {
  openapi: '3.0.0',
  info: {
    title: 'Ariadne Platform API',
    version: config.version || '2.0.0',
    description: `
# Ariadne Platform API

Cloud backend API for the Ariadne research platform - an interactive storytelling and behavioral research platform.

## Features

- **Study Management**: Create and manage research studies
- **Participant Management**: Track participants and their progress
- **Experiment Design**: Configure experimental conditions and variables
- **Synthetic Actors**: AI agents for research studies
- **Story Integration**: Support for multiple story authoring platforms
- **Data Collection**: Events, surveys, biosignals, and story data
- **Real-time Sessions**: WebSocket support for live collaboration

## Authentication

Most endpoints require JWT authentication. Obtain a token by logging in:

\`\`\`http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "researcher@example.com",
  "password": "your-password"
}
\`\`\`

Include the token in subsequent requests:

\`\`\`http
Authorization: Bearer <your-jwt-token>
\`\`\`

## Rate Limiting

API requests are rate-limited to prevent abuse:
- **Default**: 100 requests per 15 minutes per IP
- **With Redis**: Enhanced rate limiting with distributed state

## Error Responses

All error responses follow this format:

\`\`\`json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {} // Optional additional details
  }
}
\`\`\`

## Common Error Codes

- \`UNAUTHORIZED\`: Missing or invalid authentication token
- \`FORBIDDEN\`: Authenticated but insufficient permissions
- \`NOT_FOUND\`: Resource not found
- \`VALIDATION_ERROR\`: Request validation failed
- \`RATE_LIMIT_EXCEEDED\`: Too many requests

## Links

- [GitHub Repository](https://github.com/agentmancer/ariadne)
- [Documentation](https://github.com/agentmancer/ariadne/docs)
    `,
    contact: {
      name: 'Ariadne Platform',
      url: 'https://github.com/agentmancer/ariadne'
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT'
    }
  },
  servers: [
    {
      url: config.env === 'production'
        ? 'https://api.ariadne.platform'
        : `http://localhost:${config.port}`,
      description: config.env === 'production' ? 'Production' : 'Development'
    }
  ],
  tags: [
    { name: 'Authentication', description: 'User authentication and authorization' },
    { name: 'Studies', description: 'Research study management' },
    { name: 'Participants', description: 'Participant enrollment and management' },
    { name: 'Sessions', description: 'Research session management' },
    { name: 'Surveys', description: 'Survey creation and response collection' },
    { name: 'Events', description: 'Behavioral event logging' },
    { name: 'Story Data', description: 'Story content and version management' },
    { name: 'Conditions', description: 'Experimental condition management' },
    { name: 'Experiments', description: 'Experiment design and execution' },
    { name: 'Synthetic Actors', description: 'AI agent management' },
    { name: 'Batch Executions', description: 'Bulk agent execution management' },
    { name: 'LLM Providers', description: 'Language model provider configuration' },
    { name: 'Projects', description: 'Research project management' }
  ]
};

/**
 * Generate OpenAPI specification
 */
export function generateOpenAPISpec() {
  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument(openApiConfig);
}

/**
 * Common response schemas
 */
export const commonResponses = {
  unauthorized: {
    description: 'Unauthorized - Missing or invalid authentication token',
    content: {
      'application/json': {
        schema: {
          type: 'object' as const,
          properties: {
            success: { type: 'boolean' as const, example: false },
            error: {
              type: 'object' as const,
              properties: {
                code: { type: 'string' as const, example: 'UNAUTHORIZED' },
                message: { type: 'string' as const, example: 'Authentication required' }
              }
            }
          }
        }
      }
    }
  },
  forbidden: {
    description: 'Forbidden - Insufficient permissions',
    content: {
      'application/json': {
        schema: {
          type: 'object' as const,
          properties: {
            success: { type: 'boolean' as const, example: false },
            error: {
              type: 'object' as const,
              properties: {
                code: { type: 'string' as const, example: 'FORBIDDEN' },
                message: { type: 'string' as const, example: 'Insufficient permissions' }
              }
            }
          }
        }
      }
    }
  },
  notFound: {
    description: 'Not Found - Resource does not exist',
    content: {
      'application/json': {
        schema: {
          type: 'object' as const,
          properties: {
            success: { type: 'boolean' as const, example: false },
            error: {
              type: 'object' as const,
              properties: {
                code: { type: 'string' as const, example: 'NOT_FOUND' },
                message: { type: 'string' as const, example: 'Resource not found' }
              }
            }
          }
        }
      }
    }
  },
  validationError: {
    description: 'Validation Error - Invalid request data',
    content: {
      'application/json': {
        schema: {
          type: 'object' as const,
          properties: {
            success: { type: 'boolean' as const, example: false },
            error: {
              type: 'object' as const,
              properties: {
                code: { type: 'string' as const, example: 'VALIDATION_ERROR' },
                message: { type: 'string' as const, example: 'Request validation failed' },
                details: { type: 'object' as const, additionalProperties: true }
              }
            }
          }
        }
      }
    }
  },
  rateLimitExceeded: {
    description: 'Rate Limit Exceeded - Too many requests',
    content: {
      'application/json': {
        schema: {
          type: 'object' as const,
          properties: {
            success: { type: 'boolean' as const, example: false },
            error: {
              type: 'object' as const,
              properties: {
                code: { type: 'string' as const, example: 'RATE_LIMIT_EXCEEDED' },
                message: { type: 'string' as const, example: 'Too many requests, please try again later' }
              }
            }
          }
        }
      }
    }
  },
  serverError: {
    description: 'Internal Server Error',
    content: {
      'application/json': {
        schema: {
          type: 'object' as const,
          properties: {
            success: { type: 'boolean' as const, example: false },
            error: {
              type: 'object' as const,
              properties: {
                code: { type: 'string' as const, example: 'INTERNAL_ERROR' },
                message: { type: 'string' as const, example: 'An unexpected error occurred' }
              }
            }
          }
        }
      }
    }
  }
};
