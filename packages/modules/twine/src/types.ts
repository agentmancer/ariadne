/**
 * Twine Module Types
 *
 * Twine-specific types for interactive fiction research.
 * Based on legacy Ariadne data model for Twine story tracking.
 */

import { StoryState, PluginAction } from '@ariadne/plugins';

// ============================================
// TWINE STORY STATE
// ============================================

/**
 * Twine-specific story state extending the base StoryState
 */
export interface TwineStoryState extends StoryState {
  pluginType: 'twine';
  content: TwineStoryContent;
}

/**
 * Twine story content structure
 */
export interface TwineStoryContent {
  /** Story name */
  name: string;
  /** Starting passage name */
  startPassage?: string;
  /** All passages in the story */
  passages: TwinePassage[];
  /** Twine story format (e.g., 'Harlowe', 'SugarCube') */
  storyFormat?: string;
  /** Story format version */
  storyFormatVersion?: string;
  /** Custom CSS stylesheet */
  stylesheet?: string;
  /** Custom JavaScript */
  script?: string;
}

/**
 * A single Twine passage
 */
export interface TwinePassage {
  /** Unique passage ID */
  id: string;
  /** Passage name/title */
  name: string;
  /** Tags applied to this passage */
  tags?: string[];
  /** Passage text content (may include Twine markup) */
  text: string;
  /** Position in the visual editor */
  position?: {
    x: number;
    y: number;
  };
}

/**
 * A link extracted from passage text
 */
export interface TwineLink {
  /** Display text for the link */
  text: string;
  /** Target passage name */
  target: string;
}

// ============================================
// TWINE EVENT TYPES (from legacy Ariadne)
// ============================================

/**
 * Event types for Twine story interactions
 * Based on legacy Ariadne LogTypes
 */
export const TwineEventType = {
  /** Player navigated to a new passage */
  NAVIGATE: 'NAVIGATE',
  /** Player added a comment */
  COMMENT: 'COMMENT',
  /** Editor was closed */
  CLOSE_EDITOR: 'CLOSE_EDITOR',
  /** Story content was updated */
  STORY_UPDATE: 'STORY_UPDATE',
  /** Passage was changed/edited */
  CHANGE_PASSAGE: 'CHANGE_PASSAGE',
  /** Player rewound to a previous passage */
  REWIND_PASSAGE: 'REWIND_PASSAGE',
  /** Player made a choice (selected a link) */
  MAKE_CHOICE: 'MAKE_CHOICE',
  /** Session started */
  SESSION_START: 'SESSION_START',
  /** Session ended */
  SESSION_END: 'SESSION_END',
} as const;

export type TwineEventTypeValue = typeof TwineEventType[keyof typeof TwineEventType];

/**
 * Twine event data structure (matches legacy Ariadne Log model)
 */
export interface TwineEventData {
  /** Event type */
  type: TwineEventTypeValue;
  /** Timestamp */
  timestamp: Date;
  /** Player/participant ID */
  playerId: string;
  /** Current passage title */
  passageTitle?: string;
  /** Event-specific content */
  content?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ============================================
// TWINE ACTION TYPES (for headless execution)
// ============================================

/**
 * All available Twine action types for headless/synthetic execution
 */
export const TwineActionType = {
  // Passage management
  CREATE_PASSAGE: 'CREATE_PASSAGE',
  EDIT_PASSAGE: 'EDIT_PASSAGE',
  DELETE_PASSAGE: 'DELETE_PASSAGE',

  // Navigation
  NAVIGATE_TO: 'NAVIGATE_TO',
  MAKE_CHOICE: 'MAKE_CHOICE',

  // Link management
  CREATE_LINK: 'CREATE_LINK',
  DELETE_LINK: 'DELETE_LINK',

  // Story structure
  SET_START_PASSAGE: 'SET_START_PASSAGE',
  SET_STORY_PROMPT: 'SET_STORY_PROMPT',

  // Collaboration/feedback
  ADD_COMMENT: 'ADD_COMMENT',
  RESOLVE_COMMENT: 'RESOLVE_COMMENT',

  // Validation
  VALIDATE_STRUCTURE: 'VALIDATE_STRUCTURE',
} as const;

export type TwineActionTypeValue = typeof TwineActionType[keyof typeof TwineActionType];

// ============================================
// ACTION PARAMETER TYPES
// ============================================

export interface CreatePassageParams {
  name: string;
  text: string;
  tags?: string[];
  position?: { x: number; y: number };
  links?: TwineLink[];
}

export interface EditPassageParams {
  passageId: string;
  name?: string;
  text?: string;
  tags?: string[];
  position?: { x: number; y: number };
}

export interface DeletePassageParams {
  passageId: string;
}

export interface NavigateToParams {
  passageName: string;
}

export interface MakeChoiceParams {
  choiceIndex: number;
  choiceText?: string;
}

export interface CreateLinkParams {
  fromPassageId: string;
  toPassageName: string;
  linkText: string;
}

export interface DeleteLinkParams {
  fromPassageId: string;
  toPassageName: string;
}

export interface SetStartPassageParams {
  passageName: string;
}

export interface SetStoryPromptParams {
  prompt: string;
  theme?: string;
  genre?: string;
  tone?: string;
  characters?: Array<{ name: string; role: string; description: string }>;
  setting?: { location: string; time: string; atmosphere: string };
  plotHooks?: string[];
}

export interface AddCommentParams {
  passageId?: string;
  comment: string;
  strengths?: string[];
  suggestions?: Array<{
    type: string;
    description: string;
    passageName?: string;
    severity: string;
  }>;
  rating?: {
    overall: number;
    creativity: number;
    coherence: number;
    engagement: number;
  };
}

export interface ResolveCommentParams {
  commentIndex: number;
}

export interface ValidateStructureParams {
  isValid: boolean;
  summary?: string;
  issues?: Array<{
    type: string;
    severity: string;
    description: string;
    affectedPassages: string[];
    suggestion?: string;
  }>;
}

// ============================================
// TYPED ACTION HELPERS
// ============================================

/**
 * Create a typed Twine action
 */
export function createTwineAction<T extends Record<string, unknown>>(
  type: TwineActionTypeValue,
  params: T,
  description?: string
): PluginAction {
  return {
    type,
    params,
    metadata: description ? { description } : undefined,
  };
}

/**
 * Check if an action is a specific Twine action type
 */
export function isTwineAction(action: PluginAction, type: TwineActionTypeValue): boolean {
  return action.type === type;
}
