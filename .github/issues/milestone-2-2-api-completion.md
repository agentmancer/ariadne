# Milestone 2.2: API Completion

**Phase**: 2 - Core Implementation
**Priority**: High
**Estimated Time**: 1-2 weeks
**Dependencies**: Phase 1 complete ✅

## Overview

Complete all RESTful API endpoints for studies, participants, sessions, surveys, events, and story data. Implement S3 integration for file storage.

## Tasks

### Studies Endpoints
- [ ] `GET /api/v1/studies` - List studies with filters (status, projectId)
- [ ] `POST /api/v1/studies` - Create new study
- [ ] `GET /api/v1/studies/:id` - Get study details
- [ ] `PUT /api/v1/studies/:id` - Update study
- [ ] `DELETE /api/v1/studies/:id` - Delete study
- [ ] `PUT /api/v1/studies/:id/status` - Change status (activate, pause, complete)
- [ ] Add pagination support
- [ ] Add query filters (by project, status, date range)

### Conditions Endpoints
- [ ] `GET /api/v1/conditions` - List conditions for a study
- [ ] `POST /api/v1/conditions` - Create condition
- [ ] `GET /api/v1/conditions/:id` - Get condition details
- [ ] `PUT /api/v1/conditions/:id` - Update condition
- [ ] `DELETE /api/v1/conditions/:id` - Delete condition
- [ ] Implement condition assignment to participants

### Participants Endpoints
- [ ] `GET /api/v1/participants` - List participants with filters
- [ ] `POST /api/v1/participants` - Create participant
- [ ] `GET /api/v1/participants/:id` - Get participant details
- [ ] `PUT /api/v1/participants/:id` - Update participant (state, metadata)
- [ ] `DELETE /api/v1/participants/:id` - Delete/withdraw participant
- [ ] `POST /api/v1/participants/:id/partner` - Assign partner
- [ ] `GET /api/v1/participants/:id/events` - Get participant events
- [ ] Add filters (state, condition, study, date)

### Sessions Endpoints
- [ ] `GET /api/v1/sessions` - List sessions
- [ ] `POST /api/v1/sessions` - Create session
- [ ] `GET /api/v1/sessions/:id` - Get session details
- [ ] `PUT /api/v1/sessions/:id` - Update session
- [ ] `DELETE /api/v1/sessions/:id` - Delete session
- [ ] `POST /api/v1/sessions/:id/checkin` - Participant check-in
- [ ] `PUT /api/v1/sessions/:id/status` - Update session status

### Surveys Endpoints
- [ ] `GET /api/v1/surveys` - List surveys for a study
- [ ] `POST /api/v1/surveys` - Create survey
- [ ] `GET /api/v1/surveys/:id` - Get survey details
- [ ] `PUT /api/v1/surveys/:id` - Update survey
- [ ] `DELETE /api/v1/surveys/:id` - Delete survey
- [ ] `POST /api/v1/surveys/:id/responses` - Submit survey response
- [ ] `GET /api/v1/surveys/:id/responses` - List all responses
- [ ] Validate question types and responses

### Events Endpoints
- [ ] `POST /api/v1/events` - Log single event
- [ ] `POST /api/v1/events/batch` - Log multiple events (bulk)
- [ ] `GET /api/v1/events` - Query events with filters
- [ ] Add filters (participantId, type, category, dateRange)
- [ ] Add pagination for large event sets
- [ ] Optimize bulk insert performance

### Story Data Endpoints
- [ ] `POST /api/v1/stories` - Upload story to S3
- [ ] `GET /api/v1/stories/:id` - Download story from S3
- [ ] `GET /api/v1/participants/:id/stories` - List story versions
- [ ] `GET /api/v1/participants/:id/stories/latest` - Get latest story
- [ ] `DELETE /api/v1/stories/:id` - Delete story from S3

### S3 Integration
- [ ] Implement S3 upload helper functions
- [ ] Implement S3 download helper functions
- [ ] Generate presigned URLs for uploads
- [ ] Generate presigned URLs for downloads
- [ ] Handle large file uploads (multipart)
- [ ] Implement retry logic for failed uploads
- [ ] Add file size validation
- [ ] Add file type validation

### Error Handling & Validation
- [ ] Ensure all endpoints use Zod validation
- [ ] Implement consistent error responses
- [ ] Add request validation middleware
- [ ] Add rate limiting per endpoint (if needed)
- [ ] Log all errors with context
- [ ] Add error codes for all failure cases

### Testing & Documentation
- [ ] Write unit tests for all endpoints
- [ ] Write integration tests for critical flows
- [ ] Test error cases (404, 400, 401, etc.)
- [ ] Document all endpoints (OpenAPI/Swagger)
- [ ] Test S3 upload/download with large files
- [ ] Performance test bulk event logging

## Success Criteria

- ✅ All CRUD operations implemented for each resource
- ✅ S3 upload/download working reliably
- ✅ Comprehensive error handling in place
- ✅ Input validation on all endpoints
- ✅ API documentation generated
- ✅ Tests cover critical paths
- ✅ Desktop app can consume all endpoints

## Technical Notes

- Use Prisma transactions for multi-step operations
- Implement proper indexing on frequently queried fields
- Use connection pooling for database
- Consider implementing API versioning headers
- Add request logging middleware
- Implement CORS properly for all origins

## Related Issues

- Blocks: #[Milestone 2.1 - Desktop App]
- Blocks: #[Milestone 2.3 - Web Participant Interface]
- Blocks: #[Milestone 2.4 - Mobile Web Dashboard]

## Resources

- API package: `packages/api/`
- Prisma schema: `packages/api/prisma/schema.prisma`
- Shared validators: `packages/shared/src/validators.ts`
- AWS S3 SDK docs: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/
