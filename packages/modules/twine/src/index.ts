/**
 * @ariadne/module-twine
 *
 * Twine interactive fiction module for Ariadne research platform.
 * Based on legacy Ariadne data model for Twine story tracking.
 *
 * @example
 * ```typescript
 * import { TwinePlugin, TwineStoryState, TwineEventType } from '@ariadne/module-twine';
 *
 * // Register the plugin
 * pluginRegistry.register(TwinePlugin);
 *
 * // Create and use a plugin instance
 * const plugin = new TwinePlugin();
 * await plugin.init(config, context);
 * ```
 */

// Plugin implementation
export { TwinePlugin } from './plugin';

// All types
export {
  // Story state types
  TwineStoryState,
  TwineStoryContent,
  TwinePassage,
  TwineLink,

  // Event types (legacy Ariadne)
  TwineEventType,
  TwineEventTypeValue,
  TwineEventData,

  // Action types (headless execution)
  TwineActionType,
  TwineActionTypeValue,

  // Action parameter types
  CreatePassageParams,
  EditPassageParams,
  DeletePassageParams,
  NavigateToParams,
  MakeChoiceParams,
  CreateLinkParams,
  DeleteLinkParams,
  SetStartPassageParams,
  SetStoryPromptParams,
  AddCommentParams,
  ResolveCommentParams,
  ValidateStructureParams,

  // Helper functions
  createTwineAction,
  isTwineAction,
} from './types';
