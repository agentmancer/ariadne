# OpenAPI Documentation

## Overview

The Sherlock Platform API uses OpenAPI 3.0 specification for API documentation. Interactive documentation is automatically generated and served at `/api/docs`.

## Accessing the Documentation

### Development
When running the API server locally:
- **Interactive Docs**: http://localhost:3000/api/docs
- **OpenAPI JSON**: http://localhost:3000/api/docs/openapi.json

### Production
- **Interactive Docs**: https://api.sherlock.platform/api/docs
- **OpenAPI JSON**: https://api.sherlock.platform/api/docs/openapi.json

## Features

### 🎨 Interactive Documentation
- Try out API endpoints directly from the browser
- Auto-generated from Zod schemas and route definitions
- Persistent authentication (JWT token stored in browser)
- Request/response examples
- Filter endpoints by tags
- Display request duration

### 📝 Automatic Schema Generation
- Zod validators are converted to OpenAPI schemas using `@asteasolutions/zod-to-openapi`
- Type-safe and always in sync with validation rules
- No manual schema maintenance required

### 🔐 Authentication Support
- Bearer JWT authentication documented
- "Authorize" button in UI for token management
- Token persists across page reloads

### 🏷️ Organized by Tags
- Authentication
- Studies
- Participants
- Sessions
- Surveys
- Events
- Story Data
- Conditions
- Experiments
- Synthetic Actors
- And more...

## Adding Documentation for New Routes

### 1. Create Route Documentation File

Create a new file in `src/openapi/routes/` for your route group:

```typescript
// src/openapi/routes/studies.ts
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { registry, commonResponses } from '../config';
import { createStudySchema } from '@sherlock/shared';

// Extend Zod with OpenAPI
extendZodWithOpenApi(z);

// Register your schema
const CreateStudySchema = registry.register(
  'CreateStudyRequest',
  createStudySchema.openapi({
    description: 'Study creation request',
    example: {
      projectId: '123e4567-e89b-12d3-a456-426614174000',
      name: 'My Research Study',
      description: 'A study about interactive storytelling',
      type: 'STORY',
      config: { ... }
    }
  })
);

// Register your route
registry.registerPath({
  method: 'post',
  path: '/api/v1/studies',
  tags: ['Studies'],
  summary: 'Create a new study',
  description: 'Creates a new research study within a project',
  security: [{ bearerAuth: [] }], // Requires authentication
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateStudySchema
        }
      }
    }
  },
  responses: {
    201: {
      description: 'Study created successfully',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            data: z.object({
              id: z.string().uuid(),
              name: z.string(),
              // ... other fields
            })
          })
        }
      }
    },
    400: commonResponses.validationError,
    401: commonResponses.unauthorized,
    429: commonResponses.rateLimitExceeded,
    500: commonResponses.serverError
  }
});
```

### 2. Import in `src/openapi/index.ts`

```typescript
import './routes/auth';
import './routes/studies'; // Add your new route docs
import './routes/participants';
// ...
```

### 3. Restart the Server

The documentation will be automatically regenerated and available at `/api/docs`.

## Common Response Schemas

Pre-defined error responses are available in `src/openapi/config.ts`:

- `commonResponses.unauthorized` - 401 authentication required
- `commonResponses.forbidden` - 403 insufficient permissions
- `commonResponses.notFound` - 404 resource not found
- `commonResponses.validationError` - 400 validation failed
- `commonResponses.rateLimitExceeded` - 429 too many requests
- `commonResponses.serverError` - 500 internal error

## Generating TypeScript Client SDK

### Option 1: Using openapi-typescript

```bash
# Install globally
npm install -g openapi-typescript

# Generate TypeScript types
openapi-typescript http://localhost:3000/api/docs/openapi.json --output src/types/api.ts
```

### Option 2: Using openapi-generator

```bash
# Install globally
npm install -g @openapitools/openapi-generator-cli

# Generate full TypeScript client
openapi-generator-cli generate \
  -i http://localhost:3000/api/docs/openapi.json \
  -g typescript-fetch \
  -o packages/client
```

### Option 3: Manual Script

A TypeScript client generation script will be added in a future update.

## Best Practices

### 1. Always Extend Zod with OpenAPI

```typescript
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);
```

### 2. Provide Examples

Good examples make the documentation much more useful:

```typescript
const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
}).openapi({
  example: {
    email: 'researcher@example.com',
    password: 'securepassword123'
  }
});
```

### 3. Add Descriptions

Use `.describe()` or `.openapi()` to add descriptions:

```typescript
const token = z.string().describe('JWT authentication token');

// OR

const token = z.string().openapi({
  description: 'JWT authentication token',
  example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
});
```

### 4. Reuse Schemas

Register commonly used schemas once:

```typescript
const ResearcherSchema = registry.register(
  'Researcher',
  z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string()
  })
);

// Reuse in multiple endpoints
const response = z.object({
  success: z.boolean(),
  data: ResearcherSchema
});
```

### 5. Security Requirements

For protected endpoints, add security:

```typescript
registry.registerPath({
  // ...
  security: [{ bearerAuth: [] }], // Requires JWT
  // ...
});
```

### 6. Tag Organization

Use consistent tags to group related endpoints:

```typescript
tags: ['Studies']  // Groups with other study endpoints
```

## Troubleshooting

### Documentation Not Updating

1. Restart the API server
2. Hard refresh the browser (Cmd+Shift+R / Ctrl+Shift+R)
3. Clear browser cache

### Schema Validation Errors

Ensure your Zod schemas are properly extended with OpenAPI:

```typescript
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
extendZodWithOpenApi(z);
```

### Missing Endpoints

1. Check that route documentation file is created
2. Verify it's imported in `src/openapi/index.ts`
3. Restart the server

## Resources

- [OpenAPI 3.0 Specification](https://swagger.io/specification/)
- [Swagger UI Documentation](https://swagger.io/tools/swagger-ui/)
- [zod-to-openapi Documentation](https://github.com/asteasolutions/zod-to-openapi)
- [Zod Documentation](https://zod.dev/)

## Future Enhancements

- [ ] Auto-generate TypeScript client SDK
- [ ] Generate Postman collection
- [ ] API versioning support
- [ ] Response schema validation
- [ ] Contract testing with Prism
- [ ] OpenAPI validation in CI/CD
