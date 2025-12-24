# Ariadne Platform v2.0 - Development Roadmap

**Last Updated**: 2025-11-12
**Current Status**: Phase 1 Complete (Foundation)

---

## 🎯 Vision

Build a production-ready, cloud-hybrid interactive storytelling research platform that enables researchers to:
- Design flexible experimental studies with multiple story authoring platforms
- Recruit and manage participants via Prolific integration
- Collect comprehensive behavioral and biosignal data
- Analyze results with powerful visualization tools
- Monitor studies in real-time from desktop or mobile devices

---

## 📅 Development Phases

### Phase 1: Foundation ✅ (Complete)
**Duration**: 1 session
**Status**: ✅ Complete
**Goal**: Establish core architecture and development infrastructure

#### Completed Milestones:
- ✅ Monorepo structure with pnpm workspaces
- ✅ PostgreSQL database schema (Prisma)
- ✅ Express API server with authentication
- ✅ Shared types and validation (Zod)
- ✅ Plugin system architecture
- ✅ Docker deployment configuration
- ✅ Mobile web interface skeleton
- ✅ Comprehensive documentation

#### Deliverables:
- Working API server with auth endpoints
- Complete database schema
- Type-safe shared package
- Plugin interface specification
- Docker Compose for local dev
- README, Quick Start, Contributing guides

---

### Phase 2: Core Implementation 🚧
**Duration**: 2-3 weeks
**Status**: 🚧 Next
**Goal**: Build out desktop app, web app, and complete API

#### Milestone 2.1: Desktop Application (Week 1)
**Priority**: High
**Dependencies**: Phase 1

Tasks:
- [ ] **Electron Setup & Build System**
  - Configure Electron Forge
  - Set up React + TypeScript
  - Configure hot reload
  - Test build/packaging

- [ ] **Authentication UI**
  - Login/register screens
  - Token management
  - API client configuration

- [ ] **Project Management**
  - Project list view
  - Create/edit/delete projects
  - Project details page

- [ ] **Study Designer**
  - Create study form
  - Study type selection
  - Configuration editor (JSON/form)
  - Condition management

- [ ] **Participant Management**
  - Participant list/table
  - Filter by state
  - Manual participant creation
  - Partner assignment UI

- [ ] **Basic Analytics Dashboard**
  - Study overview
  - Participant counts
  - Status breakdown charts

**Success Criteria**:
- Researcher can create and manage projects
- Researcher can design and configure studies
- Desktop app connects to API successfully

---

#### Milestone 2.2: API Completion (Week 1-2)
**Priority**: High
**Dependencies**: Phase 1

Tasks:
- [ ] **Studies Endpoints**
  - GET /studies (list with filters)
  - POST /studies (create)
  - GET /studies/:id (detail)
  - PUT /studies/:id (update)
  - DELETE /studies/:id
  - PUT /studies/:id/status (activate/pause/complete)

- [ ] **Conditions Endpoints**
  - CRUD operations for conditions
  - Assign participants to conditions

- [ ] **Participants Endpoints**
  - GET /participants (list with filters)
  - POST /participants (create)
  - GET /participants/:id
  - PUT /participants/:id (update state, metadata)
  - POST /participants/:id/partner (assign partner)

- [ ] **Sessions Endpoints**
  - CRUD for sessions
  - Participant check-in
  - Session status updates

- [ ] **Surveys Endpoints**
  - CRUD for surveys
  - POST /surveys/:id/responses (submit)
  - GET /surveys/:id/responses (list)

- [ ] **Events Endpoints**
  - POST /events (single event)
  - POST /events/batch (bulk logging)
  - GET /events (query with filters)

- [ ] **Story Data Endpoints**
  - POST /stories (upload to S3)
  - GET /stories/:id (download from S3)
  - GET /participants/:id/stories (list versions)

- [ ] **S3 Integration**
  - Upload helper functions
  - Presigned URL generation
  - Download/streaming

**Success Criteria**:
- All CRUD operations implemented
- S3 upload/download working
- Comprehensive error handling
- API documentation complete

---

#### Milestone 2.3: Web Participant Interface (Week 2)
**Priority**: High
**Dependencies**: Phase 1, Milestone 2.2

Tasks:
- [ ] **Enrollment Flow**
  - Participant registration
  - Email verification (optional)
  - Consent form
  - Demographics survey

- [ ] **Study Participation UI**
  - Study landing page
  - Instructions display
  - Task navigation

- [ ] **Survey Component**
  - Dynamic form rendering
  - All question types
  - Validation
  - Submit handler

- [ ] **Story Plugin Container**
  - Plugin loader
  - Iframe/component rendering
  - Event logging integration
  - Auto-save functionality

- [ ] **Session Management**
  - Check-in interface
  - Session timer
  - Progress tracking

- [ ] **Completion Flow**
  - Exit survey
  - Completion code display
  - Thank you page

**Success Criteria**:
- Participant can enroll and complete study
- Surveys work for all question types
- Events logged to API
- Story data saved to S3

---

#### Milestone 2.4: Mobile Web Dashboard (Week 2-3)
**Priority**: Medium
**Dependencies**: Milestone 2.2

Tasks:
- [x] **Mobile App Structure** (Complete)
  - Vite + React setup
  - Tailwind configuration
  - PWA support
  - Routing

- [ ] **Authentication**
  - Login form
  - Token storage
  - Auto-login

- [ ] **Dashboard**
  - Study list
  - Quick stats
  - Real-time updates (optional)

- [ ] **Study Detail View**
  - Participant count
  - Status breakdown
  - Recent activity

- [ ] **Participant List**
  - Filterable table
  - State indicators
  - Quick actions

- [ ] **Network Configuration**
  - API endpoint config
  - Local network detection
  - Connection status

**Success Criteria**:
- Researcher can monitor studies on mobile
- Responsive design works on all screen sizes
- Works on local network
- PWA installable on mobile devices

---

### Phase 3: Plugin Ecosystem 🔮
**Duration**: 2-3 weeks
**Status**: Planned
**Goal**: Implement story authoring plugins

#### Milestone 3.1: Twine Plugin
**Priority**: High
**Dependencies**: Milestone 2.3

Tasks:
- [ ] **Twine Integration**
  - Embed Twine 2 editor
  - Story format support (Harlowe)
  - LocalStorage sync
  - PostMessage communication

- [ ] **Authoring Mode**
  - Create passages
  - Edit content
  - Create links
  - Position nodes

- [ ] **Playback Mode**
  - Render story
  - Navigate passages
  - Track history
  - Log interactions

- [ ] **Event Logging**
  - Passage navigation
  - Story edits
  - Time tracking
  - Click tracking

- [ ] **Story Persistence**
  - Save to S3
  - Load previous versions
  - Version history
  - Partner story loading

**Success Criteria**:
- Researcher can create Twine studies
- Participants can author Twine stories
- Participants can play partner stories
- All interactions logged
- Stories saved to S3

---

#### Milestone 3.2: AI Story Generator Plugin
**Priority**: Medium
**Dependencies**: Milestone 3.1

Tasks:
- [ ] **AI Integration**
  - OpenAI/Anthropic API client
  - Prompt templates
  - Streaming support
  - Error handling

- [ ] **Generator UI**
  - Prompt input
  - Generation options
  - Preview area
  - Edit capability

- [ ] **Story Refinement**
  - Iterative generation
  - User feedback loop
  - Version comparison

- [ ] **Event Logging**
  - Generation requests
  - User edits
  - Acceptance/rejection
  - Time metrics

**Success Criteria**:
- Participants can generate stories with AI
- Multiple iterations supported
- All AI interactions logged
- Stories saved with metadata

---

#### Milestone 3.3: Plugin Registry & Marketplace (Optional)
**Priority**: Low
**Dependencies**: Milestones 3.1, 3.2

Tasks:
- [ ] Plugin discovery interface
- [ ] Plugin installation UI
- [ ] Plugin configuration UI
- [ ] Third-party plugin support

---

### Phase 4: Data Collection & Analysis 🔮
**Duration**: 2-3 weeks
**Status**: Planned
**Goal**: Implement biosignal collection and analysis tools

#### Milestone 4.1: Biosignal Collection
**Priority**: Medium
**Dependencies**: Milestone 2.2

Tasks:
- [ ] **Upload Infrastructure**
  - Multipart upload support
  - Progress indicators
  - Retry logic
  - Validation

- [ ] **Data Formats**
  - CSV parsing
  - JSON support
  - Device-specific parsers (E4, Gazepoint, etc.)
  - Metadata extraction

- [ ] **Companion App Integration** (Optional)
  - Browser-based collection
  - Device API access
  - Real-time streaming

**Success Criteria**:
- Researchers can upload biosignal files
- Data validated and stored in S3
- Metadata extracted and stored in DB

---

#### Milestone 4.2: Timeline Visualization
**Priority**: High
**Dependencies**: Milestone 4.1

Tasks:
- [ ] **Timeline Component**
  - Video playback
  - Scrubbing
  - Zoom controls
  - Hotkey support

- [ ] **Event Overlay**
  - Event markers
  - Color coding
  - Filtering
  - Details on hover

- [ ] **Biosignal Plotting**
  - Line charts (HR, GSR, etc.)
  - Temporal alignment
  - Multiple signals
  - Synchronized playback

- [ ] **Annotation System**
  - Create annotations
  - Types: scene, beat, choice
  - Color coding
  - Export annotations

- [ ] **Multi-Subject View**
  - Side-by-side video
  - Synchronized playback
  - Individual controls
  - Comparison mode

**Success Criteria**:
- Researcher can view participant timeline
- Events and biosignals synchronized
- Annotation system functional
- Multi-subject comparison works

---

#### Milestone 4.3: Data Export
**Priority**: Medium
**Dependencies**: Milestone 4.2

Tasks:
- [ ] **Export Formats**
  - CSV (events, survey responses)
  - JSON (raw data)
  - Excel (formatted reports)

- [ ] **Export Options**
  - Select participants
  - Date range filtering
  - Event type filtering
  - Include/exclude columns

- [ ] **Batch Export**
  - Export entire study
  - Zip archive
  - Progress indicator

**Success Criteria**:
- Researchers can export data in multiple formats
- Exports include all relevant data
- Large exports handled efficiently

---

### Phase 5: Prolific Integration 🔮
**Duration**: 1-2 weeks
**Status**: Planned
**Goal**: Seamless participant recruitment via Prolific

#### Milestone 5.1: Prolific API Integration
**Priority**: High
**Dependencies**: Milestone 2.2

Tasks:
- [ ] **API Client**
  - Authentication
  - Study creation
  - Participant screening
  - Payment management

- [ ] **Study Synchronization**
  - Create Prolific study from Ariadne
  - Generate participant URLs
  - Sync participant data
  - Track completions

- [ ] **Completion Validation**
  - Completion code generation
  - Code verification
  - Auto-approve payments
  - Bonus payments

- [ ] **Desktop UI**
  - Prolific study creator
  - Participant screening config
  - Payment settings
  - Status dashboard

**Success Criteria**:
- Researcher can create Prolific studies from desktop app
- Participants redirected correctly
- Completion codes validated
- Payments automated

---

### Phase 6: Production Readiness 🔮
**Duration**: 2-3 weeks
**Status**: Planned
**Goal**: Prepare for production deployment

#### Milestone 6.1: Testing & Quality Assurance
**Priority**: High
**Dependencies**: Phases 2-5

Tasks:
- [ ] **Unit Tests**
  - API endpoint tests
  - Service layer tests
  - Utility function tests
  - Target: 80% coverage

- [ ] **Integration Tests**
  - End-to-end participant flow
  - Desktop app workflows
  - API integration tests

- [ ] **E2E Tests**
  - Playwright tests
  - Critical user journeys
  - Cross-browser testing

- [ ] **Performance Testing**
  - Load testing (API)
  - Database query optimization
  - S3 upload performance

- [ ] **Security Audit**
  - Dependency scanning
  - Penetration testing
  - OWASP compliance

**Success Criteria**:
- 80%+ test coverage
- All critical paths tested
- No high-severity security issues
- Performance benchmarks met

---

#### Milestone 6.2: Deployment & DevOps
**Priority**: High
**Dependencies**: Milestone 6.1

Tasks:
- [ ] **CI/CD Pipeline**
  - GitHub Actions workflows
  - Automated testing
  - Docker builds
  - Deployment automation

- [ ] **Production Infrastructure**
  - Cloud provider setup (Railway/AWS)
  - Database provisioning
  - S3 bucket configuration
  - DNS/SSL setup

- [ ] **Monitoring & Logging**
  - Error tracking (Sentry)
  - Performance monitoring
  - Log aggregation
  - Alerting

- [ ] **Backup & Recovery**
  - Database backups
  - S3 versioning
  - Disaster recovery plan

- [ ] **Desktop App Distribution**
  - Code signing certificates
  - macOS notarization
  - Windows installer
  - Auto-update system

**Success Criteria**:
- Automated deployments working
- Monitoring and alerts configured
- Backup/recovery tested
- Desktop apps signed and distributed

---

#### Milestone 6.3: Documentation & Training
**Priority**: Medium
**Dependencies**: Milestone 6.2

Tasks:
- [ ] **User Documentation**
  - Researcher guide
  - Study design tutorials
  - Troubleshooting guide
  - FAQ

- [ ] **API Documentation**
  - OpenAPI/Swagger docs
  - Example requests
  - Error codes reference

- [ ] **Plugin Development Guide**
  - Tutorial for creating plugins
  - API reference
  - Example plugins

- [ ] **Video Tutorials**
  - Platform overview
  - Creating your first study
  - Data analysis walkthrough

**Success Criteria**:
- Complete user documentation
- API docs auto-generated
- Plugin development guide published
- Tutorial videos created

---

### Phase 7: Advanced Features 🌟
**Duration**: Ongoing
**Status**: Future
**Goal**: Add advanced capabilities based on user feedback

#### Potential Features:
- [ ] **Collaboration**
  - Multi-researcher projects
  - Role-based permissions
  - Activity feed

- [ ] **Advanced Analytics**
  - Statistical analysis tools
  - ML-powered insights
  - Automated report generation

- [ ] **Additional Plugins**
  - Ink narrative scripting
  - Bitsy game engine
  - Custom visual novel editor

- [ ] **Biosignal Processing**
  - Real-time analysis
  - ML emotion detection
  - Advanced visualizations

- [ ] **Study Templates**
  - Pre-configured study types
  - Best practices library
  - Community templates

---

## 🎯 Success Metrics

### Phase 2 (MVP)
- Desktop app functional for study creation
- Participants can complete studies end-to-end
- Data collected and exportable
- Mobile monitoring works

### Phase 3
- 2+ story plugins implemented
- Plugin system validated by external developer

### Phase 4
- Timeline visualization comparable to legacy
- Data export used in real publications

### Phase 5
- 100+ Prolific participants recruited successfully
- Payment automation working flawlessly

### Phase 6
- Zero critical bugs in production
- 99.9% uptime for cloud services
- Desktop app adopted by 5+ researchers

---

## 🚀 Release Strategy

### v2.0.0-alpha (Current)
- Foundation complete
- Internal testing only

### v2.0.0-beta.1 (Phase 2 Complete)
- MVP functional
- Desktop + Web + API working
- Limited researcher testing
- **Target**: 3-4 weeks

### v2.0.0-beta.2 (Phase 3 Complete)
- Twine plugin ready
- First real studies possible
- Expanded testing
- **Target**: 6-8 weeks

### v2.0.0-rc.1 (Phase 5 Complete)
- Prolific integration working
- All core features complete
- Production deployment ready
- **Target**: 10-12 weeks

### v2.0.0 (Phase 6 Complete)
- Production ready
- Full documentation
- Public release
- **Target**: 14-16 weeks

---

## 📋 Decision Points

### After Phase 2:
- **Decision**: Continue with Twine plugin or pivot to different platform?
- **Criteria**: User feedback, researcher needs

### After Phase 4:
- **Decision**: Invest in advanced biosignal processing or focus on other features?
- **Criteria**: Research requirements, available resources

### After Phase 6:
- **Decision**: Open source the platform?
- **Criteria**: Community interest, sustainability model

---

## 🤝 Contributors & Stakeholders

### Primary Researcher
- Study design requirements
- Feature prioritization
- Testing and feedback

### Development Team
- Architecture decisions
- Implementation
- Code review

### Pilot Users (Phase 6+)
- Beta testing
- Feedback
- Bug reports

---

## 📞 Questions & Decisions Needed

1. **Cloud Provider**: Railway, AWS, Azure, or other?
2. **AI Model**: OpenAI GPT-4, Anthropic Claude, or open-source?
3. **Desktop Framework**: Stick with Electron or switch to Tauri?
4. **License**: MIT, GPL, proprietary, or academic?
5. **Funding**: Self-funded, grant-funded, or commercial model?

---

**Last Updated**: 2025-11-12
**Next Review**: After Phase 2 completion
