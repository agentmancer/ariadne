/**
 * Unit tests for TwinePlugin
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TwinePlugin } from '../plugin';
import { TwineActionType, TwineEventType } from '../types';
import { PluginEvent, type PluginContext, type PluginConfig } from '@ariadne/plugins';

// Mock console.error to verify error logging
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

describe('TwinePlugin', () => {
  let plugin: TwinePlugin;
  let mockContext: PluginContext;
  let mockApi: {
    logEvent: ReturnType<typeof vi.fn>;
    saveStory: ReturnType<typeof vi.fn>;
    loadStory: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    plugin = new TwinePlugin();

    mockApi = {
      logEvent: vi.fn().mockResolvedValue(undefined),
      saveStory: vi.fn().mockResolvedValue({ version: 1 }),
      loadStory: vi.fn().mockResolvedValue(null),
    };

    mockContext = {
      actor: { id: 'test-actor-123', type: 'SYNTHETIC' },
      role: 'PLAYER',
      api: mockApi as unknown as PluginContext['api'],
    } as PluginContext;

    mockConsoleError.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('metadata', () => {
    it('should have correct plugin metadata', () => {
      expect(plugin.metadata.id).toBe('twine');
      expect(plugin.metadata.name).toBe('Twine Interactive Fiction');
      expect(plugin.metadata.version).toBe('1.0.0');
      expect(plugin.metadata.capabilities).toContain('create');
      expect(plugin.metadata.capabilities).toContain('edit');
      expect(plugin.metadata.capabilities).toContain('play');
    });
  });

  describe('initHeadless', () => {
    it('should log SESSION_START event on initialization', async () => {
      await plugin.initHeadless(mockContext);

      expect(mockApi.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: TwineEventType.SESSION_START,
          data: expect.objectContaining({
            actorId: 'test-actor-123',
            role: 'PLAYER',
            headless: true,
            playerId: 'test-actor-123',
          }),
        })
      );
    });

    it('should emit INITIALIZED event', async () => {
      const handler = vi.fn();
      plugin.on(PluginEvent.INITIALIZED, handler);

      await plugin.initHeadless(mockContext);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          headless: true,
          context: mockContext,
        })
      );
    });

    it('should load initial state from condition config if provided', async () => {
      const contextWithState = {
        ...mockContext,
        condition: {
          id: 'test-condition',
          name: 'Test Condition',
          config: {
            initialState: {
              pluginType: 'twine',
              version: 1,
              metadata: {
                name: 'Test Story',
                createdAt: new Date(),
                updatedAt: new Date(),
              },
              content: {
                name: 'Test Story',
                startPassage: 'Start',
                passages: [
                  { id: 'passage-0', name: 'Start', text: 'Welcome!' },
                ],
              },
              history: [],
            },
          },
        },
      } as PluginContext;

      await plugin.initHeadless(contextWithState);
      const state = await plugin.getState();

      expect(state.content.passages).toHaveLength(1);
      expect(state.content.passages[0].name).toBe('Start');
    });
  });

  describe('onDestroy / session end', () => {
    it('should log SESSION_END event with session data', async () => {
      await plugin.initHeadless(mockContext);

      // Create some content to track
      await plugin.executeHeadless({
        type: TwineActionType.CREATE_PASSAGE,
        params: { name: 'Passage 1', text: 'Content 1' },
      });
      await plugin.executeHeadless({
        type: TwineActionType.CREATE_PASSAGE,
        params: { name: 'Passage 2', text: 'Content 2' },
      });
      await plugin.executeHeadless({
        type: TwineActionType.ADD_COMMENT,
        params: { comment: 'Test comment' },
      });

      mockApi.logEvent.mockClear();
      await plugin.destroy();

      expect(mockApi.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: TwineEventType.SESSION_END,
          data: expect.objectContaining({
            passagesCreated: 2,
            commentsAdded: 1,
            playerId: 'test-actor-123',
          }),
        })
      );
    });

    it('should capture state before async operation (race condition fix)', async () => {
      await plugin.initHeadless(mockContext);

      // Create passages
      await plugin.executeHeadless({
        type: TwineActionType.CREATE_PASSAGE,
        params: { name: 'Test', text: 'Test' },
      });

      // Simulate slow API call
      let resolveLogEvent: () => void;
      mockApi.logEvent.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveLogEvent = resolve;
          })
      );

      mockApi.logEvent.mockClear();
      const destroyPromise = plugin.destroy();

      // State should be captured before the async operation
      // so even if state resets, the captured values are used
      resolveLogEvent!();
      await destroyPromise;

      expect(mockApi.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: TwineEventType.SESSION_END,
          data: expect.objectContaining({
            passagesCreated: 1,
          }),
        })
      );
    });
  });

  describe('logTwineEvent error handling', () => {
    it('should catch and log errors without throwing', async () => {
      await plugin.initHeadless(mockContext);
      mockApi.logEvent.mockRejectedValueOnce(new Error('Network error'));

      // This should not throw
      const result = await plugin.executeHeadless({
        type: TwineActionType.CREATE_PASSAGE,
        params: { name: 'Test', text: 'Content' },
      });

      expect(result.success).toBe(true);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('[TwinePlugin] Failed to log event'),
        expect.any(Error)
      );
    });

    it('should continue operation even when logging fails', async () => {
      await plugin.initHeadless(mockContext);
      mockApi.logEvent.mockRejectedValue(new Error('API down'));

      // Create passage should still work
      const result1 = await plugin.executeHeadless({
        type: TwineActionType.CREATE_PASSAGE,
        params: { name: 'First', text: 'Content 1' },
      });

      const result2 = await plugin.executeHeadless({
        type: TwineActionType.CREATE_PASSAGE,
        params: { name: 'Second', text: 'Content 2' },
      });

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      const state = await plugin.getState();
      expect(state.content.passages).toHaveLength(2);
    });

    it('should not log if no API context', async () => {
      const config: PluginConfig = { mode: 'play' };
      const contextWithoutApi = {
        actor: { id: 'test', type: 'ai' },
        role: 'PLAYER',
      } as unknown as PluginContext;

      // Initialize without proper api (simulating edge case)
      await plugin.init(config, contextWithoutApi);

      // Should not throw
      await expect(plugin.destroy()).resolves.not.toThrow();
    });
  });

  describe('executeHeadless', () => {
    beforeEach(async () => {
      await plugin.initHeadless(mockContext);
    });

    describe('CREATE_PASSAGE', () => {
      it('should create a passage and log event', async () => {
        mockApi.logEvent.mockClear();

        const result = await plugin.executeHeadless({
          type: TwineActionType.CREATE_PASSAGE,
          params: {
            name: 'New Passage',
            text: 'This is the content.',
            tags: ['important'],
          },
        });

        expect(result.success).toBe(true);
        expect(result.metadata?.passageName).toBe('New Passage');

        expect(mockApi.logEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            type: TwineEventType.CHANGE_PASSAGE,
            data: expect.objectContaining({
              passageName: 'New Passage',
              action: 'create',
            }),
          })
        );
      });

      it('should embed links in passage text', async () => {
        const result = await plugin.executeHeadless({
          type: TwineActionType.CREATE_PASSAGE,
          params: {
            name: 'Choice',
            text: 'Choose wisely.',
            links: [
              { text: 'Go left', target: 'LeftPath' },
              { text: 'Go right', target: 'RightPath' },
            ],
          },
        });

        expect(result.success).toBe(true);

        const state = await plugin.getState();
        const passage = state.content.passages.find((p) => p.name === 'Choice');
        expect(passage?.text).toContain('[[Go left|LeftPath]]');
        expect(passage?.text).toContain('[[Go right|RightPath]]');
      });

      it('should set first passage as start passage', async () => {
        await plugin.executeHeadless({
          type: TwineActionType.CREATE_PASSAGE,
          params: { name: 'First', text: 'First passage' },
        });

        const state = await plugin.getState();
        expect(state.content.startPassage).toBe('First');
      });
    });

    describe('NAVIGATE_TO', () => {
      it('should navigate to a passage and log event', async () => {
        await plugin.executeHeadless({
          type: TwineActionType.CREATE_PASSAGE,
          params: { name: 'Start', text: '[[Continue|Chapter1]]' },
        });
        await plugin.executeHeadless({
          type: TwineActionType.CREATE_PASSAGE,
          params: { name: 'Chapter1', text: 'Chapter 1 content' },
        });

        mockApi.logEvent.mockClear();

        const result = await plugin.executeHeadless({
          type: TwineActionType.NAVIGATE_TO,
          params: { passageName: 'Chapter1' },
        });

        expect(result.success).toBe(true);

        expect(mockApi.logEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            type: TwineEventType.NAVIGATE,
            data: expect.objectContaining({
              passageTitle: 'Chapter1',
            }),
          })
        );
      });

      it('should fail for non-existent passage', async () => {
        const result = await plugin.executeHeadless({
          type: TwineActionType.NAVIGATE_TO,
          params: { passageName: 'NonExistent' },
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Passage not found');
      });
    });

    describe('MAKE_CHOICE', () => {
      it('should make a choice and log event', async () => {
        await plugin.executeHeadless({
          type: TwineActionType.CREATE_PASSAGE,
          params: {
            name: 'Start',
            text: 'Choose: [[Option A|PathA]] or [[Option B|PathB]]',
          },
        });
        await plugin.executeHeadless({
          type: TwineActionType.CREATE_PASSAGE,
          params: { name: 'PathA', text: 'You chose A' },
        });
        await plugin.executeHeadless({
          type: TwineActionType.CREATE_PASSAGE,
          params: { name: 'PathB', text: 'You chose B' },
        });

        mockApi.logEvent.mockClear();

        const result = await plugin.executeHeadless({
          type: TwineActionType.MAKE_CHOICE,
          params: { choiceIndex: 1 },
        });

        expect(result.success).toBe(true);

        expect(mockApi.logEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            type: TwineEventType.MAKE_CHOICE,
            data: expect.objectContaining({
              choiceIndex: 1,
              choiceText: 'Option B',
              targetPassage: 'PathB',
            }),
          })
        );
      });

      it('should fail for invalid choice index', async () => {
        await plugin.executeHeadless({
          type: TwineActionType.CREATE_PASSAGE,
          params: { name: 'Start', text: 'Only one: [[Next|Next]]' },
        });

        const result = await plugin.executeHeadless({
          type: TwineActionType.MAKE_CHOICE,
          params: { choiceIndex: 5 },
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid choice index');
      });

      it('should fail if no current passage', async () => {
        // Don't create any passages

        const result = await plugin.executeHeadless({
          type: TwineActionType.MAKE_CHOICE,
          params: { choiceIndex: 0 },
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('No current passage');
      });
    });

    describe('ADD_COMMENT', () => {
      it('should add comment and log event', async () => {
        mockApi.logEvent.mockClear();

        const result = await plugin.executeHeadless({
          type: TwineActionType.ADD_COMMENT,
          params: {
            comment: 'This is great!',
            passageId: 'passage-1',
          },
        });

        expect(result.success).toBe(true);

        expect(mockApi.logEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            type: TwineEventType.COMMENT,
            data: expect.objectContaining({
              content: 'This is great!',
              passageId: 'passage-1',
            }),
          })
        );
      });
    });

    describe('CREATE_LINK', () => {
      it('should add a link to a passage', async () => {
        await plugin.executeHeadless({
          type: TwineActionType.CREATE_PASSAGE,
          params: { name: 'Start', text: 'Beginning of the story.' },
        });
        await plugin.executeHeadless({
          type: TwineActionType.CREATE_PASSAGE,
          params: { name: 'Chapter1', text: 'Chapter 1 content' },
        });

        const passages = (await plugin.execute('getPassages')) as Array<{ id: string; name: string }>;
        const startPassage = passages.find((p) => p.name === 'Start');

        const result = await plugin.executeHeadless({
          type: TwineActionType.CREATE_LINK,
          params: {
            fromPassageId: startPassage!.id,
            toPassageName: 'Chapter1',
            linkText: 'Continue',
          },
        });

        expect(result.success).toBe(true);
        const state = await plugin.getState();
        const updatedPassage = state.content.passages.find((p) => p.name === 'Start');
        expect(updatedPassage?.text).toContain('[[Continue|Chapter1]]');
      });

      it('should fail for non-existent passage', async () => {
        const result = await plugin.executeHeadless({
          type: TwineActionType.CREATE_LINK,
          params: {
            fromPassageId: 'non-existent',
            toPassageName: 'Target',
            linkText: 'Go',
          },
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Passage not found');
      });
    });

    describe('DELETE_LINK', () => {
      it('should remove a link from a passage', async () => {
        await plugin.executeHeadless({
          type: TwineActionType.CREATE_PASSAGE,
          params: { name: 'Start', text: 'Go [[here|Target]] or [[there|Other]]' },
        });

        const passages = (await plugin.execute('getPassages')) as Array<{ id: string; name: string }>;
        const startPassage = passages.find((p) => p.name === 'Start');

        const result = await plugin.executeHeadless({
          type: TwineActionType.DELETE_LINK,
          params: {
            fromPassageId: startPassage!.id,
            toPassageName: 'Target',
          },
        });

        expect(result.success).toBe(true);
        const state = await plugin.getState();
        const updatedPassage = state.content.passages.find((p) => p.name === 'Start');
        expect(updatedPassage?.text).not.toContain('[[here|Target]]');
        expect(updatedPassage?.text).toContain('[[there|Other]]');
      });

      it('should fail if link does not exist', async () => {
        await plugin.executeHeadless({
          type: TwineActionType.CREATE_PASSAGE,
          params: { name: 'Start', text: 'No links here' },
        });

        const passages = (await plugin.execute('getPassages')) as Array<{ id: string; name: string }>;
        const startPassage = passages.find((p) => p.name === 'Start');

        const result = await plugin.executeHeadless({
          type: TwineActionType.DELETE_LINK,
          params: {
            fromPassageId: startPassage!.id,
            toPassageName: 'NonExistent',
          },
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('not found in passage');
      });
    });

    describe('RESOLVE_COMMENT', () => {
      it('should remove a comment by index', async () => {
        await plugin.executeHeadless({
          type: TwineActionType.ADD_COMMENT,
          params: { comment: 'First comment' },
        });
        await plugin.executeHeadless({
          type: TwineActionType.ADD_COMMENT,
          params: { comment: 'Second comment' },
        });

        const result = await plugin.executeHeadless({
          type: TwineActionType.RESOLVE_COMMENT,
          params: { commentIndex: 0 },
        });

        expect(result.success).toBe(true);
        expect(result.metadata?.remainingComments).toBe(1);
      });

      it('should fail for invalid index', async () => {
        const result = await plugin.executeHeadless({
          type: TwineActionType.RESOLVE_COMMENT,
          params: { commentIndex: 99 },
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid comment index');
      });
    });

    describe('Unknown action type', () => {
      it('should return error for unknown action', async () => {
        const result = await plugin.executeHeadless({
          type: 'UNKNOWN_ACTION' as unknown,
          params: {},
        } as never);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Unknown action type');
      });
    });
  });

  describe('isComplete', () => {
    beforeEach(async () => {
      await plugin.initHeadless(mockContext);
    });

    it('should return false if no current passage', async () => {
      expect(plugin.isComplete()).toBe(false);
    });

    it('should return true for passage with ending tag', async () => {
      await plugin.executeHeadless({
        type: TwineActionType.CREATE_PASSAGE,
        params: {
          name: 'Ending',
          text: 'The End',
          tags: ['ending'],
        },
      });

      expect(plugin.isComplete()).toBe(true);
    });

    it('should return true for passage with end tag', async () => {
      await plugin.executeHeadless({
        type: TwineActionType.CREATE_PASSAGE,
        params: {
          name: 'Final',
          text: 'Fin',
          tags: ['end'],
        },
      });

      expect(plugin.isComplete()).toBe(true);
    });

    it('should return true for dead end in play mode', async () => {
      const config: PluginConfig = { mode: 'play' };
      await plugin.init(config, mockContext);

      await plugin.executeHeadless({
        type: TwineActionType.CREATE_PASSAGE,
        params: {
          name: 'DeadEnd',
          text: 'No links here.',
        },
      });

      expect(plugin.isComplete()).toBe(true);
    });
  });

  describe('execute commands', () => {
    beforeEach(async () => {
      await plugin.initHeadless(mockContext);
      await plugin.executeHeadless({
        type: TwineActionType.CREATE_PASSAGE,
        params: { name: 'Start', text: '[[Continue|Next]]' },
      });
      await plugin.executeHeadless({
        type: TwineActionType.CREATE_PASSAGE,
        params: { name: 'Next', text: 'The next passage' },
      });
    });

    it('should get all passages', async () => {
      const passages = await plugin.execute('getPassages');
      expect(passages).toHaveLength(2);
    });

    it('should get a specific passage', async () => {
      const passages = (await plugin.execute('getPassages')) as Array<{ id: string }>;
      const passage = await plugin.execute('getPassage', passages[0].id);
      expect(passage).toBeDefined();
    });

    it('should get links from a passage', async () => {
      const passages = (await plugin.execute('getPassages')) as Array<{ id: string; name: string }>;
      const startPassage = passages.find((p) => p.name === 'Start');
      const links = await plugin.execute('getLinks', startPassage!.id);
      expect(links).toHaveLength(1);
      expect((links as Array<{ target: string }>)[0].target).toBe('Next');
    });

    it('should get current passage', async () => {
      const current = await plugin.execute('getCurrentPassage');
      expect(current).toBeDefined();
    });

    it('should export to Twee format', async () => {
      const twee = await plugin.execute('exportTwee');
      expect(typeof twee).toBe('string');
      expect(twee).toContain(':: Start');
      expect(twee).toContain(':: Next');
    });

    it('should import from Twee format', async () => {
      const twee = `:: StoryTitle
Imported Story

:: StoryData
{"ifid": "test"}

:: Start
Welcome! [[Continue|Chapter1]]

:: Chapter1
The story continues...`;

      const result = await plugin.execute('importTwee', twee);
      expect(result).toBe(true);

      const passages = (await plugin.execute('getPassages')) as Array<{ name: string }>;
      expect(passages.some((p) => p.name === 'Start')).toBe(true);
      expect(passages.some((p) => p.name === 'Chapter1')).toBe(true);
    });
  });

  describe('getAvailableActions', () => {
    beforeEach(async () => {
      await plugin.initHeadless(mockContext);
    });

    it('should return navigation actions in play mode', async () => {
      const config: PluginConfig = { mode: 'play' };
      await plugin.init(config, mockContext);

      await plugin.executeHeadless({
        type: TwineActionType.CREATE_PASSAGE,
        params: { name: 'Start', text: '[[Go|Next]]' },
      });

      const actions = await plugin.getAvailableActions();

      expect(actions.some((a) => a.type === TwineActionType.MAKE_CHOICE)).toBe(true);
    });

    it('should return authoring actions in author mode', async () => {
      const config: PluginConfig = { mode: 'author' };
      await plugin.init(config, mockContext);

      const actions = await plugin.getAvailableActions();

      expect(actions.some((a) => a.type === TwineActionType.CREATE_PASSAGE)).toBe(true);
    });
  });
});
