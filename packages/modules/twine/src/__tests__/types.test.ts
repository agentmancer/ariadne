/**
 * Unit tests for Twine module types and helper functions
 */

import { describe, it, expect } from 'vitest';
import {
  TwineEventType,
  TwineActionType,
  createTwineAction,
  isTwineAction,
  TwineLink,
} from '../types';
import type {
  TwineStoryState,
  TwinePassage,
  CreatePassageParams,
  EditPassageParams,
  MakeChoiceParams,
} from '../types';

describe('Twine Types', () => {
  describe('TwineEventType', () => {
    it('should have all expected event types', () => {
      expect(TwineEventType.NAVIGATE).toBe('NAVIGATE');
      expect(TwineEventType.COMMENT).toBe('COMMENT');
      expect(TwineEventType.CLOSE_EDITOR).toBe('CLOSE_EDITOR');
      expect(TwineEventType.STORY_UPDATE).toBe('STORY_UPDATE');
      expect(TwineEventType.CHANGE_PASSAGE).toBe('CHANGE_PASSAGE');
      expect(TwineEventType.REWIND_PASSAGE).toBe('REWIND_PASSAGE');
      expect(TwineEventType.MAKE_CHOICE).toBe('MAKE_CHOICE');
      expect(TwineEventType.SESSION_START).toBe('SESSION_START');
      expect(TwineEventType.SESSION_END).toBe('SESSION_END');
    });

    it('should be readonly', () => {
      // TypeScript would error on direct assignment, but we can verify the object structure
      expect(Object.keys(TwineEventType)).toHaveLength(9);
    });
  });

  describe('TwineActionType', () => {
    it('should have all expected action types', () => {
      expect(TwineActionType.CREATE_PASSAGE).toBe('CREATE_PASSAGE');
      expect(TwineActionType.EDIT_PASSAGE).toBe('EDIT_PASSAGE');
      expect(TwineActionType.DELETE_PASSAGE).toBe('DELETE_PASSAGE');
      expect(TwineActionType.NAVIGATE_TO).toBe('NAVIGATE_TO');
      expect(TwineActionType.MAKE_CHOICE).toBe('MAKE_CHOICE');
      expect(TwineActionType.CREATE_LINK).toBe('CREATE_LINK');
      expect(TwineActionType.DELETE_LINK).toBe('DELETE_LINK');
      expect(TwineActionType.SET_START_PASSAGE).toBe('SET_START_PASSAGE');
      expect(TwineActionType.SET_STORY_PROMPT).toBe('SET_STORY_PROMPT');
      expect(TwineActionType.ADD_COMMENT).toBe('ADD_COMMENT');
      expect(TwineActionType.RESOLVE_COMMENT).toBe('RESOLVE_COMMENT');
      expect(TwineActionType.VALIDATE_STRUCTURE).toBe('VALIDATE_STRUCTURE');
    });

    it('should be readonly', () => {
      expect(Object.keys(TwineActionType)).toHaveLength(12);
    });
  });

  describe('createTwineAction', () => {
    it('should create an action with type and params', () => {
      const params = {
        name: 'Test Passage',
        text: 'This is the passage content',
      };

      const action = createTwineAction(TwineActionType.CREATE_PASSAGE, params);

      expect(action.type).toBe(TwineActionType.CREATE_PASSAGE);
      expect(action.params).toEqual(params);
      expect(action.metadata).toBeUndefined();
    });

    it('should include description in metadata when provided', () => {
      const params = {
        passageName: 'Chapter 1',
      };

      const action = createTwineAction(
        TwineActionType.NAVIGATE_TO,
        params,
        'Navigate to Chapter 1'
      );

      expect(action.type).toBe(TwineActionType.NAVIGATE_TO);
      expect(action.params).toEqual(params);
      expect(action.metadata).toEqual({ description: 'Navigate to Chapter 1' });
    });

    it('should handle complex params', () => {
      const links: TwineLink[] = [
        { text: 'Go left', target: 'LeftPath' },
        { text: 'Go right', target: 'RightPath' },
      ];

      const params = {
        name: 'Crossroads',
        text: 'You stand at a crossroads.',
        tags: ['choice', 'important'],
        position: { x: 100, y: 200 },
        links,
      };

      const action = createTwineAction(TwineActionType.CREATE_PASSAGE, params);

      expect(action.params).toEqual(params);
      expect((action.params as { links: TwineLink[] }).links).toEqual(links);
    });
  });

  describe('isTwineAction', () => {
    it('should return true for matching action type', () => {
      const action = {
        type: TwineActionType.CREATE_PASSAGE,
        params: { name: 'Test', text: 'Content' },
      };

      expect(isTwineAction(action, TwineActionType.CREATE_PASSAGE)).toBe(true);
    });

    it('should return false for non-matching action type', () => {
      const action = {
        type: TwineActionType.CREATE_PASSAGE,
        params: { name: 'Test', text: 'Content' },
      };

      expect(isTwineAction(action, TwineActionType.DELETE_PASSAGE)).toBe(false);
      expect(isTwineAction(action, TwineActionType.NAVIGATE_TO)).toBe(false);
    });

    it('should work with all action types', () => {
      const actionTypes = Object.values(TwineActionType);

      for (const type of actionTypes) {
        const action = { type, params: {} };
        expect(isTwineAction(action, type)).toBe(true);

        // Check it's false for a different type
        const otherType = actionTypes.find((t) => t !== type)!;
        expect(isTwineAction(action, otherType)).toBe(false);
      }
    });
  });

  describe('TwineStoryState interface', () => {
    it('should accept valid story state', () => {
      const passage: TwinePassage = {
        id: 'passage-1',
        name: 'Start',
        text: 'Welcome to the story! [[Continue|Chapter1]]',
        tags: ['start'],
        position: { x: 0, y: 0 },
      };

      const state: TwineStoryState = {
        pluginType: 'twine',
        version: 1,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          name: 'My Story',
        },
        content: {
          name: 'My Story',
          startPassage: 'Start',
          passages: [passage],
          storyFormat: 'Harlowe',
          storyFormatVersion: '3.3.0',
        },
        history: ['passage-1'],
      };

      expect(state.pluginType).toBe('twine');
      expect(state.content.passages).toHaveLength(1);
      expect(state.content.passages[0].name).toBe('Start');
    });
  });

  describe('CreatePassageParams interface', () => {
    it('should accept minimal params', () => {
      const params: CreatePassageParams = {
        name: 'Test',
        text: 'Content',
      };

      expect(params.name).toBe('Test');
      expect(params.text).toBe('Content');
      expect(params.tags).toBeUndefined();
      expect(params.position).toBeUndefined();
      expect(params.links).toBeUndefined();
    });

    it('should accept links using TwineLink type', () => {
      const links: TwineLink[] = [
        { text: 'Option A', target: 'PassageA' },
        { text: 'Option B', target: 'PassageB' },
      ];

      const params: CreatePassageParams = {
        name: 'Choice',
        text: 'Make a choice:',
        links,
      };

      expect(params.links).toHaveLength(2);
      expect(params.links![0].text).toBe('Option A');
      expect(params.links![0].target).toBe('PassageA');
    });
  });

  describe('MakeChoiceParams interface', () => {
    it('should accept choice by index', () => {
      const params: MakeChoiceParams = {
        choiceIndex: 0,
      };

      expect(params.choiceIndex).toBe(0);
      expect(params.choiceText).toBeUndefined();
    });

    it('should accept optional choice text', () => {
      const params: MakeChoiceParams = {
        choiceIndex: 1,
        choiceText: 'Go right',
      };

      expect(params.choiceIndex).toBe(1);
      expect(params.choiceText).toBe('Go right');
    });
  });

  describe('EditPassageParams interface', () => {
    it('should require only passageId', () => {
      const params: EditPassageParams = {
        passageId: 'passage-1',
      };

      expect(params.passageId).toBe('passage-1');
      expect(params.name).toBeUndefined();
      expect(params.text).toBeUndefined();
    });

    it('should accept partial updates', () => {
      const params: EditPassageParams = {
        passageId: 'passage-1',
        text: 'Updated content',
        tags: ['edited'],
      };

      expect(params.text).toBe('Updated content');
      expect(params.tags).toEqual(['edited']);
      expect(params.name).toBeUndefined();
    });
  });
});
