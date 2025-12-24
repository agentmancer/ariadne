# Milestone 3.2: AI Story Generator Plugin

**Phase**: 3 - Plugin Ecosystem
**Priority**: Medium
**Estimated Time**: 1-2 weeks
**Dependencies**: Milestone 3.1 (Twine Plugin)

## Overview

Implement an AI-powered story generation plugin that allows participants to create interactive narratives using large language models (OpenAI GPT, Anthropic Claude, or open-source).

## Tasks

### AI Integration
- [ ] Choose AI provider (OpenAI/Anthropic/open-source)
- [ ] Set up API client
- [ ] Configure API key management
- [ ] Implement prompt templates
- [ ] Add streaming support
- [ ] Handle rate limiting
- [ ] Implement error handling

### Generator UI
- [ ] Create prompt input form
- [ ] Add generation options (temperature, max tokens, etc.)
- [ ] Create preview area for generated text
- [ ] Add edit capability for generated content
- [ ] Show generation progress indicator
- [ ] Display token usage/cost

### Story Refinement
- [ ] Support iterative generation
- [ ] Implement user feedback loop (regenerate sections)
- [ ] Add version comparison view
- [ ] Allow merging of different versions
- [ ] Support editing generated content
- [ ] Add undo/redo for iterations

### Event Logging
- [ ] Log generation requests (prompt, parameters)
- [ ] Log user edits to generated content
- [ ] Log acceptance/rejection of generations
- [ ] Track time metrics
- [ ] Log iteration count
- [ ] Track token usage

### Story Persistence
- [ ] Save stories to S3 with metadata
- [ ] Include AI generation metadata (model, prompt, etc.)
- [ ] Track version history
- [ ] Save prompt history
- [ ] Store user edits separately from AI generations

### Plugin Implementation
- [ ] Extend BaseStoryPlugin class
- [ ] Implement all required interface methods
- [ ] Register plugin with pluginRegistry
- [ ] Create plugin configuration schema
- [ ] Handle plugin initialization
- [ ] Handle plugin cleanup

### Prompt Engineering
- [ ] Design default prompt templates
- [ ] Support custom researcher prompts (from study config)
- [ ] Add prompt variables (participant ID, condition, etc.)
- [ ] Create prompt library (story genres, styles)
- [ ] Test prompts for quality
- [ ] Document prompt best practices

### Safety & Moderation
- [ ] Implement content filtering
- [ ] Add moderation API calls (if available)
- [ ] Handle inappropriate content
- [ ] Add researcher review capability (optional)
- [ ] Log flagged content

## Success Criteria

- ✅ Participants can generate stories with AI
- ✅ Multiple iterations supported
- ✅ User can edit AI-generated content
- ✅ All AI interactions logged
- ✅ Stories saved with full metadata
- ✅ Plugin works alongside Twine plugin
- ✅ Cost tracking functional

## Technical Notes

### AI Provider Options

**OpenAI GPT-4**:
- Pros: High quality, good documentation
- Cons: Cost, rate limits
- API: https://platform.openai.com/docs

**Anthropic Claude**:
- Pros: Large context, good for stories
- Cons: Access limitations
- API: https://docs.anthropic.com/

**Open Source (Llama, Mistral)**:
- Pros: No API costs, private
- Cons: Need hosting, lower quality
- Consider: Together.ai, Replicate

### Configuration

Allow researchers to configure:
- AI model selection
- Temperature (creativity)
- Max tokens (length)
- System prompt
- Custom instructions
- Content filters

### Cost Management

- Track token usage per participant
- Set per-participant limits
- Alert researcher on budget thresholds
- Show estimated costs in dashboard

## Related Issues

- Depends on: #[Milestone 3.1 - Twine Plugin]
- Related: Plugin system architecture (Phase 1)

## Resources

- Plugin package: `packages/plugins/`
- Plugin types: `packages/plugins/src/types.ts`
- Base plugin: `packages/plugins/src/base-plugin.ts`
- OpenAI API: https://platform.openai.com/docs
- Anthropic API: https://docs.anthropic.com/
