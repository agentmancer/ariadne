# Sherlock Feature Gap Analysis

Last updated: December 2024

## Summary

Sherlock is **production-ready** for core collaborative storytelling research. The Twine visual editor is available via iframe embedding (like sherlock-legacy).

---

## Twine Editor Options

| Editor | Implementation | Use Case |
|--------|----------------|----------|
| **TwineIframeEditor** | ✅ Complete | Full Twine with visual canvas via iframe |
| **TwineEditor** (custom) | ✅ Complete | Simplified React editor for basic editing |

The vendored Twine (`vendor/twinejs/`) includes Sherlock integration:
- `sherlock/post-message-bridge.ts` - Bidirectional postMessage communication
- `sherlock/state-integration.ts` - Story state sync
- `sherlock/dom-observer.ts` - DOM mutation tracking for research events

---

## FDG Paper Requirements

**What's needed for the paper demo/screenshots:**

| Feature | Status | Notes |
|---------|--------|-------|
| Researcher Dashboard | ✅ Ready | `mobile-web/Dashboard.tsx` |
| Study Configuration | ✅ Ready | `mobile-web/StudyDetail.tsx` |
| Batch Execution View | ✅ Ready | `mobile-web/BatchExecutions.tsx` |
| Twine Visual Editor | ✅ Ready | Via `TwineIframeEditor` with vendored Twine |
| Twine Player | ✅ Ready | `web/TwinePlayer.tsx` |
| Synthetic Actor Execution | ✅ Ready | Orchestrator + LLM adapters |
| Data Export (JSON/CSV) | ✅ Ready | Export worker |

**NOT needed for paper (nice-to-haves):**
- QDA-XML export (can mention as future work)
- Real-time WebSocket sync (paper describes polling approach)
- Advanced pairing algorithms (basic pairing works)

**To verify before submission:**
1. [ ] Run full synthetic actor batch to confirm orchestrator works
2. [ ] Capture screenshots of all UI screens
3. [ ] Export sample data to verify pipeline
4. [ ] Build vendored Twine if not already built

---

## Feature Status Overview

| Feature | Status | Priority |
|---------|--------|----------|
| Twine Plugin Core | ✅ Complete | - |
| Twine UI Editor (iframe) | ✅ Complete | - |
| Twine UI Editor (custom) | ✅ Complete | - |
| Twine Player | ✅ Complete | - |
| LLM Adapters | ✅ Complete | - |
| Agent Memory/Context | ✅ Complete | - |
| Collaborative Orchestrator | ✅ Complete | - |
| Hybrid Orchestrator | ⚠️ Partial | Medium |
| Data Export (JSON/CSV) | ✅ Complete | - |
| QDA-XML Export | ❌ Missing | Medium |
| Story Versioning | ✅ Complete | - |
| Comments/Feedback | ✅ Complete | - |
| Real-time Sync | ❌ Missing | High |
| Visual Editor Canvas | ❌ Missing | Medium |
| LLM Provider CRUD | ⚠️ Partial | Low |

---

## Detailed Gap Analysis

### 1. Twine Plugin (`packages/modules/twine/`)

**Implemented:**
- Full plugin lifecycle (onInit, onRender, onDestroy)
- Headless mode for synthetic actors (`initHeadless()`)
- 11 action types: CREATE_PASSAGE, EDIT_PASSAGE, DELETE_PASSAGE, NAVIGATE_TO, MAKE_CHOICE, CREATE_LINK, DELETE_LINK, SET_START_PASSAGE, SET_STORY_PROMPT, ADD_COMMENT, VALIDATE_STRUCTURE
- Event tracking (SESSION_START, NAVIGATE, MAKE_CHOICE, COMMENT, STORY_UPDATE)
- Twee format import/export
- IFID generation

**Missing:**
- Visual graph canvas (passages shown as cards, not graph layout)
- Drag-and-drop passage positioning
- Visual link drawing between passages
- Rich text editor for passage content

### 2. Frontend Twine Editor (`packages/web/`)

**Implemented:**
- TwineEditor: Add/edit/delete passages, auto-save, validation
- TwinePlayer: Story playback, Harlowe link parsing, navigation history
- PassageCard: Passage display component
- FeedbackPanel: Basic comment interface

**Missing:**
- Graph visualization canvas
- Passage position visualization
- Real-time link validation warnings
- Rich text editing

### 3. Synthetic Actor System

**Fully Implemented:**
- `CollaborativeSessionOrchestrator`: Multi-round AUTHOR → PLAY → REVIEW
- 6 LLM adapters: TwineCollaborativeAdapter, TwinePlayerAdapter, TwineStorytellerAdapter, TwineEditorAdapter, TwineNavigatorAdapter, TwineConsistencyAdapter
- AgentContext with persistent memory (drafts, feedback, learnings)
- LLM client factory (Anthropic, OpenAI, Google Vertex)

**Partial - Hybrid Orchestrator:**
- Structure present but async timing incomplete
- TODO: Redis persistence for session state
- Phase timeout handling not fully tested

### 4. Data Pipeline

**Implemented:**
- Export formats: JSON, JSONL, CSV
- Event tracking with flexible JSON data
- Story versioning with S3 storage
- Bulk query optimization

**Missing:**
- QDA-XML export (for ATLAS.ti, NVivo)
- Differential storage (currently full copies)
- Snapshot branching

### 5. Real-Time Collaboration

**Missing:**
- WebSocket implementation
- Live phase synchronization
- Real-time comment notifications
- Currently polling-based only

### 6. MCP Server (`packages/mcp-server/`)

**Implemented:**
- StoryMCPClient with tool invocation
- play_story_session, get_playthrough_record tools

**Limitations:**
- Client-side only, no MCP server
- Limited tool set

---

## Priority Development Roadmap

### Phase 1: Essential for FDG Paper
- [ ] Ensure all documented features work end-to-end
- [ ] Add screenshots/demo workflow
- [ ] Basic documentation cleanup

### Phase 2: High Priority
- [ ] **Visual Twine Editor Canvas** - Graph layout for passages
- [ ] **Real-time WebSocket Sync** - Live phase synchronization
- [ ] **LLM Provider Management** - Complete CRUD endpoints

### Phase 3: Medium Priority
- [ ] **QDA-XML Export** - ATLAS.ti/NVivo compatibility
- [ ] **Hybrid Orchestrator Completion** - Redis persistence, timeouts
- [ ] **Advanced Pairing Algorithms** - Preference-based matching

### Phase 4: Nice to Have
- [ ] Rich text editor for passages
- [ ] Mobile web app completion
- [ ] Federated multi-site support

---

## Test Coverage

Current test files (15):
- Auth, researchers, studies routes
- Prolific integration
- Evaluation endpoints
- Agent definitions
- Twine plugin (types, plugin tests)

Gaps:
- Orchestrator integration tests
- LLM adapter mocking
- End-to-end collaboration tests

---

## Architecture Strengths

1. Clean plugin separation
2. Type safety with Zod validators
3. Transaction-based atomic operations
4. Scalable BullMQ job queue
5. S3 integration for large data
6. Role-based LLM adapters (extensible)
7. Persistent agent context across phases
