# Milestone 2.3: Web Participant Interface

**Phase**: 2 - Core Implementation
**Priority**: High
**Estimated Time**: 1 week
**Dependencies**: Milestone 2.2 (API Completion)

## Overview

Build the participant-facing web application where participants enroll, complete studies, author/play stories, and fill out surveys.

## Tasks

### Enrollment Flow
- [ ] Create participant registration page
- [ ] Implement email verification (optional)
- [ ] Create consent form component
- [ ] Add demographics survey integration
- [ ] Handle Prolific participant URL params
- [ ] Generate unique participant IDs

### Study Participation UI
- [ ] Create study landing page
- [ ] Display study instructions
- [ ] Create task navigation (multi-round support)
- [ ] Add progress indicator
- [ ] Implement session timer
- [ ] Handle study completion

### Survey Component
- [ ] Build dynamic form renderer
- [ ] Implement all question types:
  - [ ] Multiple choice
  - [ ] Likert scale
  - [ ] Text/textarea
  - [ ] Number input
  - [ ] Scale slider
  - [ ] Checkbox (multi-select)
- [ ] Add client-side validation
- [ ] Implement required field handling
- [ ] Add progress saving (draft responses)
- [ ] Create submit handler

### Story Plugin Container
- [ ] Create plugin loader component
- [ ] Implement iframe rendering for plugins
- [ ] Add component rendering for native plugins
- [ ] Integrate event logging
- [ ] Implement auto-save functionality
- [ ] Add manual save button
- [ ] Handle plugin errors gracefully

### Session Management
- [ ] Create check-in interface
- [ ] Implement session timer display
- [ ] Add progress tracking
- [ ] Handle session timeout
- [ ] Allow session pause/resume

### Completion Flow
- [ ] Create exit survey page
- [ ] Generate completion code
- [ ] Display completion code prominently
- [ ] Create thank you page
- [ ] Add redirect to Prolific (if applicable)
- [ ] Handle withdrawal flow

### Real-Time Event Logging
- [ ] Log all navigation events
- [ ] Log all interaction events
- [ ] Batch events for performance
- [ ] Implement retry logic for failed logs
- [ ] Queue events when offline
- [ ] Sync queued events when back online

## Success Criteria

- ✅ Participant can enroll in a study
- ✅ Participant can complete surveys
- ✅ All question types render correctly
- ✅ Events logged to API successfully
- ✅ Story data saved to S3
- ✅ Completion code generated and displayed
- ✅ Works on mobile and desktop browsers

## Technical Notes

- Use React Router for navigation
- Implement form state management (React Hook Form or Formik)
- Use React Query for API calls
- Consider offline support (Service Worker)
- Ensure responsive design (mobile-first)
- Test on multiple browsers (Chrome, Firefox, Safari)
- Implement proper error boundaries

## Related Issues

- Depends on: #[Milestone 2.2 - API Completion]
- Blocks: #[Milestone 3.1 - Twine Plugin]
- Related: #[Milestone 2.4 - Mobile Web Dashboard]

## Resources

- Web package: `packages/web/`
- Shared types: `packages/shared/`
- Plugin system: `packages/plugins/`
