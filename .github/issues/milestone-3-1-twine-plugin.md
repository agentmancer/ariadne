# Milestone 3.1: Twine Plugin

**Phase**: 3 - Plugin Ecosystem
**Priority**: High
**Estimated Time**: 1-2 weeks
**Dependencies**: Milestone 2.3 (Web Participant Interface)

## Overview

Implement the Twine story authoring plugin, allowing participants to create and play interactive Twine stories. This is the first plugin and will validate the plugin architecture.

## Tasks

### Twine Integration
- [ ] Embed Twine 2 editor in iframe
- [ ] Configure Harlowe story format (default)
- [ ] Support other formats (Sugarcube, Snowman)
- [ ] Handle localStorage synchronization
- [ ] Implement PostMessage communication
- [ ] Parse Twine story JSON format

### Authoring Mode
- [ ] Enable passage creation
- [ ] Enable content editing (rich text/markdown)
- [ ] Enable link creation between passages
- [ ] Support passage positioning (visual editor)
- [ ] Add passage tagging
- [ ] Implement undo/redo

### Playback Mode
- [ ] Render story in player
- [ ] Handle passage navigation
- [ ] Track navigation history
- [ ] Support back button
- [ ] Render passage links
- [ ] Handle special links (restart, etc.)

### Event Logging
- [ ] Log passage navigation events
- [ ] Log story edit events (create, edit, delete passage)
- [ ] Log time spent per passage
- [ ] Log link click events
- [ ] Log back/forward navigation
- [ ] Include passage context in events

### Story Persistence
- [ ] Implement save to S3
- [ ] Load previous versions from S3
- [ ] Track version history
- [ ] Enable loading partner's story
- [ ] Handle concurrent saves
- [ ] Auto-save every N minutes

### Plugin Implementation
- [ ] Extend BaseStoryPlugin class
- [ ] Implement all required interface methods
- [ ] Register plugin with pluginRegistry
- [ ] Create plugin configuration schema
- [ ] Handle plugin initialization
- [ ] Handle plugin cleanup

### UI/UX
- [ ] Create toolbar for authoring mode
- [ ] Add save/load buttons
- [ ] Show save status indicator
- [ ] Add help text/tutorial
- [ ] Create error messages
- [ ] Add confirmation dialogs

### Testing
- [ ] Test authoring workflow
- [ ] Test playback workflow
- [ ] Test saving/loading stories
- [ ] Test event logging
- [ ] Test with different story formats
- [ ] Test edge cases (empty stories, large stories)

## Success Criteria

- ✅ Researcher can create Twine studies
- ✅ Participants can author Twine stories
- ✅ Participants can play their own stories
- ✅ Participants can play partner's stories (if enabled)
- ✅ All interactions logged to API
- ✅ Stories saved to S3 reliably
- ✅ Version history works
- ✅ Plugin validates the plugin architecture

## Technical Notes

- Use official Twine 2 editor or fork
- Consider hosting Twine editor locally vs. CDN
- Implement proper iframe sandboxing
- Handle cross-origin communication carefully
- Test with large stories (100+ passages)
- Consider performance optimization for large stories

## Plugin Architecture Validation

This is the first plugin - use it to validate:
- Plugin interface design
- Event system
- State management
- API integration
- Error handling patterns

## Related Issues

- Depends on: #[Milestone 2.3 - Web Participant Interface]
- Validates: Plugin system architecture (Phase 1)
- Blocks: #[Milestone 3.2 - AI Story Generator]

## Resources

- Plugin package: `packages/plugins/`
- Plugin types: `packages/plugins/src/types.ts`
- Base plugin: `packages/plugins/src/base-plugin.ts`
- Twine documentation: https://twinery.org/reference/en/
- Harlowe docs: https://twine2.neocities.org/
