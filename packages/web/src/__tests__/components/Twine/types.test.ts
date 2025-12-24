import { describe, it, expect } from 'vitest';
import {
  extractLinks,
  validateStory,
  isTwineStory,
  createDefaultStory,
  generatePassageId,
  TwineStory,
} from '../../../components/Twine/types';

describe('extractLinks', () => {
  it('extracts simple links', () => {
    const text = 'Go to [[Next]] or [[Previous]]';
    const links = extractLinks(text);

    expect(links).toHaveLength(2);
    expect(links[0]).toEqual({ text: 'Next', target: 'Next' });
    expect(links[1]).toEqual({ text: 'Previous', target: 'Previous' });
  });

  it('extracts links with display text and target', () => {
    const text = '[[Click here|Chapter 2]] or [[Go back|Chapter 1]]';
    const links = extractLinks(text);

    expect(links).toHaveLength(2);
    expect(links[0]).toEqual({ text: 'Click here', target: 'Chapter 2' });
    expect(links[1]).toEqual({ text: 'Go back', target: 'Chapter 1' });
  });

  it('handles mixed link formats', () => {
    const text = 'Go [[Forward]] or [[Back to start|Start]]';
    const links = extractLinks(text);

    expect(links).toHaveLength(2);
    expect(links[0]).toEqual({ text: 'Forward', target: 'Forward' });
    expect(links[1]).toEqual({ text: 'Back to start', target: 'Start' });
  });

  it('returns empty array for text without links', () => {
    const text = 'This is just plain text without any links.';
    const links = extractLinks(text);

    expect(links).toHaveLength(0);
  });

  it('trims whitespace from link text and targets', () => {
    const text = '[[  Spaced Link  |  Target  ]]';
    const links = extractLinks(text);

    expect(links).toHaveLength(1);
    expect(links[0]).toEqual({ text: 'Spaced Link', target: 'Target' });
  });
});

describe('isTwineStory', () => {
  it('returns true for valid story with passages', () => {
    const story: TwineStory = {
      name: 'Test Story',
      startPassage: 'Start',
      passages: [
        { id: '1', name: 'Start', text: 'Hello' },
      ],
    };

    expect(isTwineStory(story)).toBe(true);
  });

  it('returns true for minimal valid story', () => {
    const story = {
      passages: [
        { id: '1', name: 'Start', text: 'Hello' },
      ],
    };

    expect(isTwineStory(story)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isTwineStory(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isTwineStory(undefined)).toBe(false);
  });

  it('returns false for non-object', () => {
    expect(isTwineStory('not a story')).toBe(false);
    expect(isTwineStory(123)).toBe(false);
  });

  it('returns false for object without passages', () => {
    expect(isTwineStory({ name: 'Test' })).toBe(false);
  });

  it('returns false for object with non-array passages', () => {
    expect(isTwineStory({ passages: 'not an array' })).toBe(false);
  });

  it('returns false if passages have invalid structure', () => {
    const invalid = {
      passages: [
        { id: '1', name: 'Start' }, // missing text
      ],
    };

    expect(isTwineStory(invalid)).toBe(false);
  });

  it('returns false if name is not a string', () => {
    const invalid = {
      name: 123,
      passages: [
        { id: '1', name: 'Start', text: 'Hello' },
      ],
    };

    expect(isTwineStory(invalid)).toBe(false);
  });
});

describe('validateStory', () => {
  it('returns no issues for valid story', () => {
    const story: TwineStory = {
      name: 'Test',
      startPassage: 'Start',
      passages: [
        { id: '1', name: 'Start', text: '[[End]]' },
        { id: '2', name: 'End', text: 'The end' },
      ],
    };

    const issues = validateStory(story);
    expect(issues).toHaveLength(0);
  });

  it('reports error for missing start passage', () => {
    const story: TwineStory = {
      name: 'Test',
      startPassage: 'NonExistent',
      passages: [
        { id: '1', name: 'Start', text: 'Hello' },
      ],
    };

    const issues = validateStory(story);
    expect(issues.some(i => i.type === 'error' && i.message.includes('NonExistent'))).toBe(true);
  });

  it('reports warning for broken links', () => {
    const story: TwineStory = {
      name: 'Test',
      startPassage: 'Start',
      passages: [
        { id: '1', name: 'Start', text: '[[Broken Link]]' },
      ],
    };

    const issues = validateStory(story);
    expect(issues.some(i => i.type === 'warning' && i.message.includes('Broken Link'))).toBe(true);
  });

  it('reports warning for orphaned passages', () => {
    const story: TwineStory = {
      name: 'Test',
      startPassage: 'Start',
      passages: [
        { id: '1', name: 'Start', text: 'Hello' },
        { id: '2', name: 'Orphan', text: 'Unreachable' },
      ],
    };

    const issues = validateStory(story);
    expect(issues.some(i => i.type === 'warning' && i.message.includes('Orphan'))).toBe(true);
  });
});

describe('createDefaultStory', () => {
  it('creates story with default name', () => {
    const story = createDefaultStory();
    expect(story.name).toBe('Untitled Story');
  });

  it('creates story with custom name', () => {
    const story = createDefaultStory('My Story');
    expect(story.name).toBe('My Story');
  });

  it('creates story with Start passage', () => {
    const story = createDefaultStory();
    expect(story.startPassage).toBe('Start');
    expect(story.passages).toHaveLength(1);
    expect(story.passages[0].name).toBe('Start');
  });

  it('creates story with Harlowe format', () => {
    const story = createDefaultStory();
    expect(story.storyFormat).toBe('Harlowe');
  });
});

describe('generatePassageId', () => {
  it('generates unique IDs', () => {
    const id1 = generatePassageId();
    const id2 = generatePassageId();

    expect(id1).not.toBe(id2);
  });

  it('generates IDs with passage- prefix', () => {
    const id = generatePassageId();
    expect(id.startsWith('passage-')).toBe(true);
  });
});
