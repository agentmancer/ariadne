/**
 * Twine Editor Types
 * Local type definitions for the web package Twine editor components.
 * These mirror the types from @ariadne/module-twine for ESM compatibility.
 */

export interface TwinePassage {
  id: string;
  name: string;
  text: string;
  tags?: string[];
  position?: {
    x: number;
    y: number;
  };
}

export interface TwineStory {
  name: string;
  startPassage?: string;
  passages: TwinePassage[];
  storyFormat?: string;
  storyFormatVersion?: string;
}

export interface TwineLink {
  text: string;
  target: string;
}

/**
 * Editor type configuration
 * - 'custom': Simplified React-based editor (customizable, simpler UX)
 * - 'iframe': Embedded Twine editor (full features, transferable skills)
 */
export type TwineEditorType = 'custom' | 'iframe';

export interface TwineEditorProps {
  /** Initial story content */
  initialStory?: TwineStory;
  /** Called on story changes (for autosave) */
  onStoryChange: (story: TwineStory) => void;
  /** Called when editor is ready */
  onReady?: () => void;
  /** Read-only mode */
  readOnly?: boolean;
  /** Story format */
  storyFormat?: 'Harlowe' | 'SugarCube' | 'Chapbook';
}

export interface TwineEditorConfig {
  /** Which editor type to use */
  editorType: TwineEditorType;
  /** URL for iframe editor (only used when editorType is 'iframe') */
  editorUrl?: string;
}

export interface ValidationIssue {
  type: 'error' | 'warning';
  message: string;
  passageId?: string;
}

/**
 * Extract links from Twine passage text
 * Supports: [[Link Text]] and [[Display Text|Target Passage]]
 */
export function extractLinks(text: string): TwineLink[] {
  const links: TwineLink[] = [];
  const regex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const displayText = match[1].trim();
    const target = match[2]?.trim() || displayText;
    links.push({ text: displayText, target });
  }

  return links;
}

/**
 * Validate story structure
 */
export function validateStory(story: TwineStory): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const passageNames = new Set(story.passages.map(p => p.name));

  // Check start passage exists
  if (story.startPassage && !passageNames.has(story.startPassage)) {
    issues.push({
      type: 'error',
      message: `Start passage "${story.startPassage}" does not exist`,
    });
  }

  // Check for broken links
  for (const passage of story.passages) {
    const links = extractLinks(passage.text);
    for (const link of links) {
      if (!passageNames.has(link.target)) {
        issues.push({
          type: 'warning',
          message: `Broken link to "${link.target}" in passage "${passage.name}"`,
          passageId: passage.id,
        });
      }
    }
  }

  // Check for orphaned passages (except start)
  const linkedPassages = new Set<string>();
  if (story.startPassage) linkedPassages.add(story.startPassage);

  for (const passage of story.passages) {
    const links = extractLinks(passage.text);
    links.forEach(link => linkedPassages.add(link.target));
  }

  for (const passage of story.passages) {
    if (!linkedPassages.has(passage.name) && passage.name !== story.startPassage) {
      issues.push({
        type: 'warning',
        message: `Passage "${passage.name}" is not linked from any other passage`,
        passageId: passage.id,
      });
    }
  }

  return issues;
}

/**
 * Create a default empty story
 */
export function createDefaultStory(name: string = 'Untitled Story'): TwineStory {
  const startId = `passage-${Date.now()}`;
  return {
    name,
    startPassage: 'Start',
    storyFormat: 'Harlowe',
    storyFormatVersion: '3.3.0',
    passages: [
      {
        id: startId,
        name: 'Start',
        text: 'Your story begins here.\n\n[[Continue|Next]]',
        tags: ['start'],
        position: { x: 100, y: 100 },
      },
    ],
  };
}

/**
 * Generate unique passage ID
 */
export function generatePassageId(): string {
  return `passage-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Type guard to check if an unknown value is a valid TwinePassage
 */
function isValidPassage(value: unknown): value is TwinePassage {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.text === 'string'
  );
}

/**
 * Type guard to check if an unknown value is a valid TwineStory
 * Use this to safely parse story content from API/storage
 */
export function isTwineStory(value: unknown): value is TwineStory {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;

  // Required: passages array
  if (!Array.isArray(obj.passages)) return false;

  // All passages must be valid
  if (!obj.passages.every(isValidPassage)) return false;

  // Optional: name should be string if present
  if (obj.name !== undefined && typeof obj.name !== 'string') return false;

  // Optional: startPassage should be string if present
  if (obj.startPassage !== undefined && typeof obj.startPassage !== 'string') return false;

  return true;
}
