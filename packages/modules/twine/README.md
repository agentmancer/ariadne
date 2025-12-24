# @ariadne/module-twine

Twine interactive fiction module for the Ariadne research platform. This module provides plugin support for Twine-based story research, including headless execution for automated agent playthroughs.

## Installation

```bash
pnpm add @ariadne/module-twine
```

## Usage

### Registering the Plugin

```typescript
import { pluginRegistry } from '@ariadne/plugins';
import { TwinePlugin } from '@ariadne/module-twine';

// Register the Twine plugin
pluginRegistry.register(TwinePlugin);
```

### Using with Research Studies

The Twine module integrates with Ariadne's research platform to enable:

- **Automated story exploration** - Agent-driven playthroughs with configurable strategies
- **Event tracking** - Captures navigation, choices, comments, and session data
- **Headless execution** - Run stories without a browser for batch processing

```typescript
import { TwinePlugin, TwineStoryState, TwineActionType } from '@ariadne/module-twine';

// Create a plugin instance
const plugin = new TwinePlugin();

// Initialize with story content
await plugin.initialize({
  actor: { id: 'agent-1', type: 'ai' },
  api: researchApi,
  initialState: {
    pluginType: 'twine',
    content: {
      name: 'My Story',
      startPassage: 'Start',
      passages: [
        { id: '1', name: 'Start', text: 'Welcome! [[Begin|Chapter1]]' },
        { id: '2', name: 'Chapter1', text: 'The adventure begins...' }
      ]
    }
  }
});

// Execute actions
await plugin.executeAction({
  type: TwineActionType.NAVIGATE_TO,
  params: { passageName: 'Chapter1' }
});
```

## Available Action Types

| Action | Description |
|--------|-------------|
| `CREATE_PASSAGE` | Create a new passage |
| `EDIT_PASSAGE` | Modify an existing passage |
| `DELETE_PASSAGE` | Remove a passage |
| `NAVIGATE_TO` | Navigate to a named passage |
| `MAKE_CHOICE` | Select a link by index |
| `CREATE_LINK` | Add a link between passages |
| `DELETE_LINK` | Remove a link |
| `SET_START_PASSAGE` | Set the starting passage |
| `SET_STORY_PROMPT` | Configure story generation prompt |
| `ADD_COMMENT` | Add feedback/comments |
| `VALIDATE_STRUCTURE` | Check story structure validity |

## Event Types

The module tracks these event types for research data collection:

| Event | Description |
|-------|-------------|
| `SESSION_START` | Session initialization |
| `SESSION_END` | Session completion |
| `NAVIGATE` | Passage navigation |
| `MAKE_CHOICE` | Link selection |
| `COMMENT` | Comment added |
| `CHANGE_PASSAGE` | Passage edited |
| `REWIND_PASSAGE` | Navigation rewound |
| `STORY_UPDATE` | Story content modified |

## Type Exports

```typescript
// State types
import {
  TwineStoryState,
  TwineStoryContent,
  TwinePassage,
  TwineLink
} from '@ariadne/module-twine';

// Action types
import {
  TwineActionType,
  CreatePassageParams,
  EditPassageParams,
  NavigateToParams,
  MakeChoiceParams
} from '@ariadne/module-twine';

// Event types
import {
  TwineEventType,
  TwineEventData
} from '@ariadne/module-twine';

// Helper functions
import {
  createTwineAction,
  isTwineAction
} from '@ariadne/module-twine';
```

## Migration from @ariadne/plugins

If you were previously importing Twine types from `@ariadne/plugins`, update your imports:

```typescript
// Before
import { TwineStoryState, TwinePassage } from '@ariadne/plugins';

// After
import { TwineStoryState, TwinePassage } from '@ariadne/module-twine';
```

The plugin registration pattern remains the same - the module exports `TwinePlugin` which implements the standard `StoryPlugin` interface.

## Configuration

### Story Format Support

The module supports various Twine story formats:

```typescript
const state: TwineStoryState = {
  pluginType: 'twine',
  content: {
    name: 'My Story',
    storyFormat: 'Harlowe',      // or 'SugarCube', 'Chapbook', etc.
    storyFormatVersion: '3.3.0',
    stylesheet: '/* custom CSS */',
    script: '/* custom JS */',
    passages: [/* ... */]
  }
};
```

### Link Parsing

Links are automatically extracted from passage text using standard Twine syntax:

- `[[Display Text|PassageName]]` - Link with custom display text
- `[[PassageName]]` - Simple link using passage name as text

## Development

```bash
# Build the module
pnpm --filter @ariadne/module-twine run build

# Type check
pnpm --filter @ariadne/module-twine run type-check

# Clean build artifacts
pnpm --filter @ariadne/module-twine run clean
```

## License

MIT
