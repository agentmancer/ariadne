# Milestone 2.4: Mobile Web Dashboard

**Phase**: 2 - Core Implementation
**Priority**: Medium
**Estimated Time**: 1 week
**Dependencies**: Milestone 2.2 (API Completion)

## Overview

Complete the mobile-optimized researcher dashboard (PWA) for monitoring studies on-the-go. Foundation already created ✅.

## Tasks

### Authentication
- [ ] Implement login form
- [ ] Add token storage (localStorage/sessionStorage)
- [ ] Implement auto-login on app open
- [ ] Add logout functionality
- [ ] Handle token expiration
- [ ] Show connection status

### Dashboard Enhancements
- [ ] Connect to real API (currently using mock data)
- [ ] Add pull-to-refresh
- [ ] Implement real-time updates (polling or WebSocket)
- [ ] Add loading states
- [ ] Add error handling
- [ ] Add empty states

### Study Detail View
- [ ] Create study detail page
- [ ] Show participant count by state
- [ ] Display status breakdown (pie/donut chart)
- [ ] Show recent activity timeline
- [ ] Add quick actions (pause, activate)
- [ ] Display study configuration

### Participant List
- [ ] Create filterable participant table
- [ ] Add state indicators (badges/chips)
- [ ] Implement sorting
- [ ] Add search functionality
- [ ] Show participant metadata
- [ ] Add quick actions (view, change state)

### Network Configuration
- [ ] Add API endpoint configuration UI
- [ ] Implement local network detection
- [ ] Show connection status indicator
- [ ] Add manual endpoint override
- [ ] Test with different network configs
- [ ] Add connection troubleshooting

### PWA Features
- [ ] Configure service worker caching
- [ ] Add offline support
- [ ] Create app icons (192x192, 512x512)
- [ ] Configure web app manifest
- [ ] Test install on iOS
- [ ] Test install on Android
- [ ] Add update notification

### Performance
- [ ] Optimize images and assets
- [ ] Implement lazy loading
- [ ] Add skeleton loaders
- [ ] Minimize bundle size
- [ ] Test on slow networks
- [ ] Measure Lighthouse scores

## Success Criteria

- ✅ Researcher can log in on mobile device
- ✅ Dashboard shows real study data from API
- ✅ Participant list is filterable and sortable
- ✅ PWA installable on iOS and Android
- ✅ Works on local network
- ✅ Offline mode functional
- ✅ Responsive on all screen sizes

## Technical Notes

- Current status: Foundation complete (UI framework, routing, stub pages)
- Uses Vite + React + Tailwind + PWA plugin
- Runs on port 5174 with --host for LAN access
- Consider using Recharts for visualizations
- Implement optimistic updates for better UX
- Use React Query for caching

## Related Issues

- Depends on: #[Milestone 2.2 - API Completion]
- Related: #[Milestone 2.1 - Desktop App]

## Resources

- Mobile web package: `packages/mobile-web/`
- Current pages: Dashboard, Login, StudyDetail, ParticipantList
- PWA config: `packages/mobile-web/vite.config.ts`
