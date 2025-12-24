# Milestone 2.1: Desktop Application UI

**Phase**: 2 - Core Implementation
**Priority**: High
**Estimated Time**: 1 week
**Dependencies**: Phase 1 complete ✅

## Overview

Build the researcher desktop application UI using Electron + React. This is the primary interface for researchers to design studies, manage participants, and analyze data.

## Tasks

### Setup & Configuration
- [ ] Configure Electron Forge build system
- [ ] Set up React 18 + TypeScript
- [ ] Configure hot reload for development
- [ ] Test build and packaging process
- [ ] Set up window management and menus

### Authentication UI
- [ ] Create login screen
- [ ] Create registration screen
- [ ] Implement token management (store JWT)
- [ ] Create API client configuration
- [ ] Add logout functionality
- [ ] Handle token expiration

### Project Management
- [ ] Create project list view with table/cards
- [ ] Implement create project dialog
- [ ] Implement edit project dialog
- [ ] Implement delete project confirmation
- [ ] Create project details page
- [ ] Add project search/filter

### Study Designer
- [ ] Create study form (name, description, type)
- [ ] Add study type selection (single, paired, multi-round)
- [ ] Build configuration editor (JSON + form views)
- [ ] Implement condition management (add/edit/delete)
- [ ] Add study status controls (draft/active/paused)
- [ ] Create study settings panel

### Participant Management
- [ ] Create participant list table with sorting
- [ ] Add filters (state, condition, date range)
- [ ] Implement manual participant creation
- [ ] Add partner assignment UI
- [ ] Create participant detail view
- [ ] Add participant state change controls

### Basic Analytics Dashboard
- [ ] Create study overview page
- [ ] Add participant count widgets
- [ ] Create status breakdown charts (Chart.js/Recharts)
- [ ] Add recent activity timeline
- [ ] Create export button (CSV placeholder)

## Success Criteria

- ✅ Researcher can log in and register
- ✅ Researcher can create and manage projects
- ✅ Researcher can design and configure studies
- ✅ Researcher can view participant lists
- ✅ Desktop app connects to API successfully
- ✅ App builds and packages for distribution

## Technical Notes

- Use Electron Store for local preferences
- Implement React Context for auth state
- Use React Query or SWR for API data fetching
- Consider using a component library (Shadcn/ui, MUI, Ant Design)
- Ensure responsive layout within desktop window

## Related Issues

- Depends on: #[Milestone 2.2 - API Completion]
- Blocks: #[Phase 3 - Plugin Integration]

## Resources

- Electron Forge docs: https://www.electronforge.io/
- Desktop package: `packages/desktop/`
- Shared types: `packages/shared/`
