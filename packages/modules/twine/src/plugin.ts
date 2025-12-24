/**
 * Twine Plugin Implementation
 *
 * Supports both UI rendering and headless execution for synthetic actors.
 * Based on legacy Ariadne research platform for Twine story tracking.
 */

import { BaseStoryPlugin } from '@ariadne/plugins';
import {
  PluginMetadata,
  PluginCapability,
  PluginContext,
  PluginAction,
  PluginActionResult,
  PluginEvent,
  StoryState,
} from '@ariadne/plugins';
import {
  TwineStoryState,
  TwinePassage,
  TwineLink,
  TwineActionType,
  TwineEventType,
  CreatePassageParams,
  EditPassageParams,
  DeletePassageParams,
  NavigateToParams,
  MakeChoiceParams,
  CreateLinkParams,
  DeleteLinkParams,
  SetStartPassageParams,
  AddCommentParams,
  ResolveCommentParams,
  isTwineAction,
} from './types';

/**
 * Twine interactive fiction plugin
 *
 * Supports creating, editing, and playing Twine-style branching narratives.
 * Tracks all interactions for research analysis (legacy Ariadne model).
 */
export class TwinePlugin extends BaseStoryPlugin {
  readonly metadata: PluginMetadata = {
    id: 'twine',
    name: 'Twine Interactive Fiction',
    version: '1.0.0',
    description: 'Create and play branching interactive fiction stories',
    author: 'Ariadne Platform',
    capabilities: [
      PluginCapability.CREATE,
      PluginCapability.EDIT,
      PluginCapability.DELETE,
      PluginCapability.PLAY,
      PluginCapability.NAVIGATE,
      PluginCapability.COMMENTING,
      PluginCapability.VERSION_HISTORY,
      PluginCapability.EXPORT,
      PluginCapability.IMPORT,
    ],
  };

  // Internal state
  private passages: Map<string, TwinePassage> = new Map();
  private startPassage: string | undefined;
  private currentPassageId: string | undefined;
  private navigationHistory: string[] = [];
  private storyPrompt: string | undefined;
  private comments: Array<{ passageId?: string; text: string; timestamp: Date }> = [];
  private isHeadless = false;
  private passageIdCounter = 0;

  // ============================================
  // LIFECYCLE METHODS
  // ============================================

  protected async onInit(): Promise<void> {
    this.isHeadless = false;
    this.resetState();
  }

  /**
   * Initialize in headless mode (no UI)
   */
  async initHeadless(context: PluginContext): Promise<void> {
    this.context = context;
    this.isHeadless = true;
    // Set default config for headless mode - defaults to 'play' mode
    this.config = { mode: 'play' };
    this.resetState();

    // Load existing state if available
    if (context.condition?.config?.initialState) {
      const state = context.condition.config.initialState as TwineStoryState;
      await this.setState(state);
    }

    // Log session start (legacy Ariadne event)
    await this.logTwineEvent(TwineEventType.SESSION_START, {
      actorId: context.actor.id,
      role: context.role,
      headless: true,
    });

    this.emit(PluginEvent.INITIALIZED, { headless: true, context });
  }

  private resetState(): void {
    this.passages.clear();
    this.startPassage = undefined;
    this.currentPassageId = undefined;
    this.navigationHistory = [];
    this.storyPrompt = undefined;
    this.comments = [];
    this.passageIdCounter = 0;
  }

  protected async onRender(container: HTMLElement): Promise<void> {
    if (this.isHeadless) {
      throw new Error('Cannot render in headless mode');
    }
    // UI rendering would go here
    container.innerHTML = `
      <div class="twine-plugin">
        <div class="twine-editor">
          <p>Twine Editor (UI implementation pending)</p>
        </div>
      </div>
    `;
  }

  protected async onDestroy(): Promise<void> {
    // Capture values before async operation to prevent race condition
    const sessionData = {
      passagesCreated: this.passages.size,
      navigationSteps: this.navigationHistory.length,
      commentsAdded: this.comments.length,
    };

    // Log session end
    if (this.context?.api) {
      await this.logTwineEvent(TwineEventType.SESSION_END, sessionData);
    }

    this.resetState();
  }

  // ============================================
  // STATE MANAGEMENT
  // ============================================

  async getState(): Promise<TwineStoryState> {
    const passages = Array.from(this.passages.values());

    return {
      pluginType: 'twine',
      version: this.currentState?.version || 1,
      metadata: {
        name: this.storyPrompt?.substring(0, 50) || 'Untitled Story',
        createdAt: this.currentState?.metadata.createdAt || new Date(),
        updatedAt: new Date(),
      },
      currentLocation: this.currentPassageId,
      history: [...this.navigationHistory],
      content: {
        name: this.storyPrompt?.substring(0, 50) || 'Untitled Story',
        startPassage: this.startPassage,
        passages,
        storyFormat: 'Harlowe',
        storyFormatVersion: '3.3.0',
      },
      custom: {
        storyPrompt: this.storyPrompt,
        comments: this.comments,
      },
    };
  }

  protected async onStateChanged(state: StoryState): Promise<void> {
    const twineState = state as TwineStoryState;

    // Restore passages
    this.passages.clear();
    if (twineState.content?.passages) {
      for (const passage of twineState.content.passages) {
        this.passages.set(passage.id, passage);
        // Track highest ID for counter
        const idNum = parseInt(passage.id.replace('passage-', ''), 10);
        if (!isNaN(idNum) && idNum >= this.passageIdCounter) {
          this.passageIdCounter = idNum + 1;
        }
      }
    }

    // Restore other state
    this.startPassage = twineState.content?.startPassage;
    this.currentPassageId = twineState.currentLocation;
    this.navigationHistory = twineState.history || [];
    this.storyPrompt = twineState.custom?.storyPrompt as string | undefined;
    this.comments = (twineState.custom?.comments as typeof this.comments) || [];
  }

  // ============================================
  // HEADLESS EXECUTION
  // ============================================

  /**
   * Execute an action in headless mode
   * Uses type guards for improved type safety
   */
  async executeHeadless(action: PluginAction): Promise<PluginActionResult> {
    try {
      // Cast params through unknown for type safety with specific param types
      const params = action.params as unknown;

      // Use type guards for safer type checking
      if (isTwineAction(action, TwineActionType.CREATE_PASSAGE)) {
        return this.executeCreatePassage(params as CreatePassageParams);
      }

      if (isTwineAction(action, TwineActionType.EDIT_PASSAGE)) {
        return this.executeEditPassage(params as EditPassageParams);
      }

      if (isTwineAction(action, TwineActionType.DELETE_PASSAGE)) {
        return this.executeDeletePassage(params as DeletePassageParams);
      }

      if (isTwineAction(action, TwineActionType.NAVIGATE_TO)) {
        return this.executeNavigateTo(params as NavigateToParams);
      }

      if (isTwineAction(action, TwineActionType.MAKE_CHOICE)) {
        return this.executeMakeChoice(params as MakeChoiceParams);
      }

      if (isTwineAction(action, TwineActionType.CREATE_LINK)) {
        return this.executeCreateLink(params as CreateLinkParams);
      }

      if (isTwineAction(action, TwineActionType.DELETE_LINK)) {
        return this.executeDeleteLink(params as DeleteLinkParams);
      }

      if (isTwineAction(action, TwineActionType.SET_START_PASSAGE)) {
        return this.executeSetStartPassage(params as SetStartPassageParams);
      }

      if (isTwineAction(action, TwineActionType.SET_STORY_PROMPT)) {
        return this.executeSetStoryPrompt(params as Record<string, unknown>);
      }

      if (isTwineAction(action, TwineActionType.ADD_COMMENT)) {
        return this.executeAddComment(params as AddCommentParams);
      }

      if (isTwineAction(action, TwineActionType.RESOLVE_COMMENT)) {
        return this.executeResolveComment(params as ResolveCommentParams);
      }

      if (isTwineAction(action, TwineActionType.VALIDATE_STRUCTURE)) {
        return this.executeValidateStructure(params as Record<string, unknown>);
      }

      return {
        success: false,
        newState: await this.getState(),
        error: `Unknown action type: ${action.type}`,
      };
    } catch (error) {
      return {
        success: false,
        newState: await this.getState(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check if the story/task is complete
   */
  isComplete(): boolean {
    if (!this.currentPassageId) {
      return false;
    }

    const currentPassage = this.passages.get(this.currentPassageId);
    if (!currentPassage) {
      return false;
    }

    // Check for ending tags
    if (currentPassage.tags?.some(t => ['ending', 'complete', 'end'].includes(t.toLowerCase()))) {
      return true;
    }

    // Check if dead end (no outgoing links) in play mode
    if (this.config?.mode === 'play') {
      const links = this.extractLinksFromText(currentPassage.text);
      return links.length === 0;
    }

    return false;
  }

  /**
   * Get available actions at current state
   */
  async getAvailableActions(): Promise<PluginAction[]> {
    const actions: PluginAction[] = [];

    if (this.config?.mode === 'play') {
      actions.push(...this.getNavigationActions());
    } else {
      actions.push(...this.getAuthoringActions());
    }

    return actions;
  }

  // ============================================
  // ACTION EXECUTORS
  // ============================================

  private async executeCreatePassage(params: CreatePassageParams): Promise<PluginActionResult> {
    // Check for duplicate passage name
    if (this.findPassageByName(params.name)) {
      return {
        success: false,
        newState: await this.getState(),
        error: `Passage already exists with name: ${params.name}`,
      };
    }

    const id = `passage-${this.passageIdCounter++}`;

    const passage: TwinePassage = {
      id,
      name: params.name,
      text: params.text,
      tags: params.tags,
      position: params.position || { x: this.passageIdCounter * 150, y: 100 },
    };

    // Embed links in text if provided
    if (params.links && params.links.length > 0) {
      let text = passage.text;
      for (const link of params.links) {
        const linkSyntax = `[[${link.text}|${link.target}]]`;
        if (!text.includes(linkSyntax) && !text.includes(`[[${link.text}]]`)) {
          text += `\n\n${linkSyntax}`;
        }
      }
      passage.text = text;
    }

    this.passages.set(id, passage);

    // Set as start passage if first
    if (this.passages.size === 1) {
      this.startPassage = passage.name;
      this.currentPassageId = id;
    }

    this.emit(PluginEvent.CONTENT_EDITED, { action: 'create', passage });

    // Log legacy Ariadne event
    await this.logTwineEvent(TwineEventType.CHANGE_PASSAGE, {
      passageId: id,
      passageName: params.name,
      action: 'create',
    });

    return {
      success: true,
      newState: await this.getState(),
      metadata: { passageId: id, passageName: params.name },
    };
  }

  private async executeEditPassage(params: EditPassageParams): Promise<PluginActionResult> {
    const passage = this.passages.get(params.passageId);
    if (!passage) {
      return {
        success: false,
        newState: await this.getState(),
        error: `Passage not found: ${params.passageId}`,
      };
    }

    if (params.name !== undefined) passage.name = params.name;
    if (params.text !== undefined) passage.text = params.text;
    if (params.tags !== undefined) passage.tags = params.tags;
    if (params.position !== undefined) passage.position = params.position;

    this.passages.set(params.passageId, passage);
    this.emit(PluginEvent.CONTENT_EDITED, { action: 'edit', passage });

    // Log legacy Ariadne event
    await this.logTwineEvent(TwineEventType.CHANGE_PASSAGE, {
      passageId: params.passageId,
      passageName: passage.name,
      action: 'edit',
    });

    return {
      success: true,
      newState: await this.getState(),
      metadata: { passageId: params.passageId },
    };
  }

  private async executeDeletePassage(params: DeletePassageParams): Promise<PluginActionResult> {
    if (!this.passages.has(params.passageId)) {
      return {
        success: false,
        newState: await this.getState(),
        error: `Passage not found: ${params.passageId}`,
      };
    }

    const passage = this.passages.get(params.passageId)!;
    this.passages.delete(params.passageId);

    if (this.startPassage === passage.name) {
      const firstPassage = this.passages.values().next().value as TwinePassage | undefined;
      this.startPassage = firstPassage?.name;
    }

    this.emit(PluginEvent.CONTENT_EDITED, { action: 'delete', passageId: params.passageId });

    return {
      success: true,
      newState: await this.getState(),
    };
  }

  private async executeNavigateTo(params: NavigateToParams): Promise<PluginActionResult> {
    const passage = this.findPassageByName(params.passageName);
    if (!passage) {
      return {
        success: false,
        newState: await this.getState(),
        error: `Passage not found: ${params.passageName}`,
      };
    }

    const fromPassage = this.currentPassageId;
    if (this.currentPassageId) {
      this.navigationHistory.push(this.currentPassageId);
    }
    this.currentPassageId = passage.id;

    this.emit(PluginEvent.NAVIGATE_TO, { passageName: params.passageName, passageId: passage.id });

    // Log legacy Ariadne navigation event
    await this.logTwineEvent(TwineEventType.NAVIGATE, {
      fromPassage,
      toPassage: passage.id,
      passageTitle: params.passageName,
    });

    return {
      success: true,
      newState: await this.getState(),
      metadata: { passageId: passage.id, passageName: params.passageName },
    };
  }

  private async executeMakeChoice(params: MakeChoiceParams): Promise<PluginActionResult> {
    if (!this.currentPassageId) {
      return {
        success: false,
        newState: await this.getState(),
        error: 'No current passage to make choice from',
      };
    }

    const currentPassage = this.passages.get(this.currentPassageId);
    if (!currentPassage) {
      return {
        success: false,
        newState: await this.getState(),
        error: 'Current passage not found',
      };
    }

    const links = this.extractLinksFromText(currentPassage.text);
    if (params.choiceIndex < 0 || params.choiceIndex >= links.length) {
      return {
        success: false,
        newState: await this.getState(),
        error: `Invalid choice index: ${params.choiceIndex}. Available choices: ${links.length}`,
      };
    }

    const chosenLink = links[params.choiceIndex];

    // Log choice event
    await this.logTwineEvent(TwineEventType.MAKE_CHOICE, {
      passageTitle: currentPassage.name,
      choiceIndex: params.choiceIndex,
      choiceText: chosenLink.text,
      targetPassage: chosenLink.target,
    });

    return this.executeNavigateTo({ passageName: chosenLink.target });
  }

  private async executeSetStartPassage(params: SetStartPassageParams): Promise<PluginActionResult> {
    const passage = this.findPassageByName(params.passageName);
    if (!passage) {
      return {
        success: false,
        newState: await this.getState(),
        error: `Passage not found: ${params.passageName}`,
      };
    }

    this.startPassage = params.passageName;

    return {
      success: true,
      newState: await this.getState(),
    };
  }

  private async executeSetStoryPrompt(params: Record<string, unknown>): Promise<PluginActionResult> {
    this.storyPrompt = params.prompt as string;

    await this.logTwineEvent(TwineEventType.STORY_UPDATE, {
      action: 'set_prompt',
      prompt: this.storyPrompt,
    });

    return {
      success: true,
      newState: await this.getState(),
      metadata: { prompt: this.storyPrompt },
    };
  }

  private async executeAddComment(params: AddCommentParams): Promise<PluginActionResult> {
    this.comments.push({
      passageId: params.passageId,
      text: params.comment,
      timestamp: new Date(),
    });

    this.emit(PluginEvent.COMMENT_ADDED, params);

    // Log legacy Ariadne comment event
    await this.logTwineEvent(TwineEventType.COMMENT, {
      passageId: params.passageId,
      content: params.comment,
    });

    return {
      success: true,
      newState: await this.getState(),
      metadata: { commentCount: this.comments.length },
    };
  }

  private async executeCreateLink(params: CreateLinkParams): Promise<PluginActionResult> {
    const passage = this.passages.get(params.fromPassageId);
    if (!passage) {
      return {
        success: false,
        newState: await this.getState(),
        error: `Passage not found: ${params.fromPassageId}`,
      };
    }

    // Add link syntax to passage text
    const linkSyntax = `[[${params.linkText}|${params.toPassageName}]]`;
    if (!passage.text.includes(linkSyntax)) {
      passage.text += `\n\n${linkSyntax}`;
      this.passages.set(params.fromPassageId, passage);
    }

    this.emit(PluginEvent.CONTENT_EDITED, { action: 'createLink', passage, link: params });

    return {
      success: true,
      newState: await this.getState(),
      metadata: { fromPassageId: params.fromPassageId, toPassageName: params.toPassageName },
    };
  }

  private async executeDeleteLink(params: DeleteLinkParams): Promise<PluginActionResult> {
    const passage = this.passages.get(params.fromPassageId);
    if (!passage) {
      return {
        success: false,
        newState: await this.getState(),
        error: `Passage not found: ${params.fromPassageId}`,
      };
    }

    // Remove link syntax from passage text (both formats)
    const linkRegex1 = new RegExp(`\\[\\[[^\\]|]*\\|${params.toPassageName}\\]\\]`, 'g');
    const linkRegex2 = new RegExp(`\\[\\[${params.toPassageName}\\]\\]`, 'g');

    const originalText = passage.text;
    passage.text = passage.text.replace(linkRegex1, '').replace(linkRegex2, '').trim();

    if (passage.text === originalText) {
      return {
        success: false,
        newState: await this.getState(),
        error: `Link to "${params.toPassageName}" not found in passage`,
      };
    }

    this.passages.set(params.fromPassageId, passage);
    this.emit(PluginEvent.CONTENT_EDITED, { action: 'deleteLink', passage, link: params });

    return {
      success: true,
      newState: await this.getState(),
      metadata: { fromPassageId: params.fromPassageId, toPassageName: params.toPassageName },
    };
  }

  private async executeResolveComment(params: ResolveCommentParams): Promise<PluginActionResult> {
    if (params.commentIndex < 0 || params.commentIndex >= this.comments.length) {
      return {
        success: false,
        newState: await this.getState(),
        error: `Invalid comment index: ${params.commentIndex}. Available comments: ${this.comments.length}`,
      };
    }

    const resolvedComment = this.comments.splice(params.commentIndex, 1)[0];
    this.emit(PluginEvent.CONTENT_EDITED, { action: 'resolveComment', comment: resolvedComment });

    return {
      success: true,
      newState: await this.getState(),
      metadata: { resolvedComment, remainingComments: this.comments.length },
    };
  }

  private async executeValidateStructure(params: Record<string, unknown>): Promise<PluginActionResult> {
    return {
      success: true,
      newState: await this.getState(),
      metadata: { validation: params },
    };
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private findPassageByName(name: string): TwinePassage | undefined {
    for (const passage of this.passages.values()) {
      if (passage.name === name) {
        return passage;
      }
    }
    return undefined;
  }

  private extractLinksFromText(text: string): TwineLink[] {
    const links: TwineLink[] = [];
    const regex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      links.push({
        text: match[1],
        target: match[2] || match[1],
      });
    }

    return links;
  }

  private getNavigationActions(): PluginAction[] {
    const actions: PluginAction[] = [];

    if (!this.currentPassageId) {
      if (this.startPassage) {
        actions.push({
          type: TwineActionType.NAVIGATE_TO,
          params: { passageName: this.startPassage },
          metadata: { description: `Go to start: "${this.startPassage}"` },
        });
      }
      return actions;
    }

    const currentPassage = this.passages.get(this.currentPassageId);
    if (!currentPassage) return actions;

    const links = this.extractLinksFromText(currentPassage.text);
    links.forEach((link, index) => {
      actions.push({
        type: TwineActionType.MAKE_CHOICE,
        params: { choiceIndex: index, choiceText: link.text },
        metadata: { description: `Choose: "${link.text}" → ${link.target}` },
      });
    });

    return actions;
  }

  private getAuthoringActions(): PluginAction[] {
    const actions: PluginAction[] = [];

    actions.push({
      type: TwineActionType.CREATE_PASSAGE,
      params: { name: '', text: '' },
      metadata: { description: 'Create a new passage' },
    });

    for (const passage of this.passages.values()) {
      actions.push({
        type: TwineActionType.EDIT_PASSAGE,
        params: { passageId: passage.id },
        metadata: { description: `Edit passage: "${passage.name}"` },
      });
    }

    return actions;
  }

  /**
   * Log a Twine-specific event (legacy Ariadne format)
   * Errors are caught and logged to console to prevent event logging
   * failures from breaking plugin operations.
   */
  private async logTwineEvent(
    type: string,
    data: Record<string, unknown>
  ): Promise<void> {
    if (!this.context?.api) return;

    try {
      await this.context.api.logEvent({
        type,
        timestamp: new Date(),
        data: {
          ...data,
          playerId: this.context.actor.id,
          passageTitle: this.currentPassageId
            ? this.passages.get(this.currentPassageId)?.name
            : undefined,
        },
      });
    } catch (error) {
      // Log to console but don't throw - event logging should not break plugin operations
      console.error(`[TwinePlugin] Failed to log event ${type}:`, error);
    }
  }

  // ============================================
  // COMMAND EXECUTION
  // ============================================

  async execute(command: string, args?: unknown): Promise<unknown> {
    switch (command) {
      case 'getPassages':
        return Array.from(this.passages.values());

      case 'getPassage':
        return this.passages.get(args as string);

      case 'getLinks':
        if (typeof args === 'string') {
          const passage = this.passages.get(args);
          return passage ? this.extractLinksFromText(passage.text) : [];
        }
        return [];

      case 'getCurrentPassage':
        return this.currentPassageId ? this.passages.get(this.currentPassageId) : undefined;

      case 'getHistory':
        return [...this.navigationHistory];

      case 'exportTwee':
        return this.exportToTwee();

      case 'importTwee':
        return this.importFromTwee(args as string);

      default:
        return super.execute(command, args);
    }
  }

  // ============================================
  // IMPORT/EXPORT
  // ============================================

  private exportToTwee(): string {
    let twee = `:: StoryTitle\n${this.storyPrompt?.substring(0, 50) || 'Untitled'}\n\n`;
    twee += `:: StoryData\n{\n  "ifid": "${this.generateIFID()}",\n  "format": "Harlowe",\n  "format-version": "3.3.0"\n}\n\n`;

    for (const passage of this.passages.values()) {
      const tags = passage.tags?.length ? ` [${passage.tags.join(' ')}]` : '';
      const position = passage.position ? ` {"position":"${passage.position.x},${passage.position.y}"}` : '';
      twee += `:: ${passage.name}${tags}${position}\n${passage.text}\n\n`;
    }

    return twee;
  }

  private importFromTwee(twee: string): boolean {
    const passageRegex = /:: ([^\n\[{]+)(?:\s*\[([^\]]*)\])?(?:\s*\{[^}]*\})?\n([\s\S]*?)(?=\n:: |$)/g;
    let match;

    this.resetState();

    while ((match = passageRegex.exec(twee)) !== null) {
      const name = match[1].trim();
      const tags = match[2]?.split(' ').filter(Boolean);
      const text = match[3].trim();

      if (name === 'StoryTitle' || name === 'StoryData') {
        if (name === 'StoryTitle') {
          this.storyPrompt = text;
        }
        continue;
      }

      const id = `passage-${this.passageIdCounter++}`;
      this.passages.set(id, { id, name, text, tags });

      if (!this.startPassage) {
        this.startPassage = name;
      }
    }

    return true;
  }

  private generateIFID(): string {
    // Use crypto.randomUUID() for proper unique identifier generation
    // Falls back to manual generation if crypto is unavailable (legacy environments)
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID().toUpperCase();
    }
    // Fallback for environments without crypto.randomUUID
    // Uses Date.now() for additional entropy alongside Math.random()
    const timestamp = Date.now();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c, i) => {
      const r = (Math.random() * 16 + (timestamp >> (i % 8)) % 16) | 0;
      const v = c === 'x' ? r & 0xf : (r & 0x3 | 0x8);
      return v.toString(16).toUpperCase();
    });
  }
}
