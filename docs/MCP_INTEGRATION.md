# MCP Integration - Sherlock ↔ Story Platform

**Date**: November 22, 2025
**Status**: ✅ Configured and Ready

---

## Overview

The Sherlock research platform can now connect to the Story MCP Server to access autonomous agent playthrough capabilities for automated story exploration and choice distribution analysis.

## Architecture

```
┌─────────────────────────────────────────┐
│  Sherlock Platform (~/sherlock)        │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │  API Server (Express + Prisma)    │ │
│  │                                   │ │
│  │  Uses:                            │ │
│  │  @sherlock/mcp-server package     │ │
│  │  (TypeScript MCP Client)          │ │
│  └───────────┬───────────────────────┘ │
└──────────────┼─────────────────────────┘
               │
               │ MCP Protocol (stdio)
               ↓
┌─────────────────────────────────────────┐
│  Story Platform (~/story/main)          │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │  Story MCP Server (Python)        │ │
│  │  src/servers/story_mcp_server.py  │ │
│  │                                   │ │
│  │  Provides:                        │ │
│  │  - play_story_session tool        │ │
│  │  - get_playthrough_record tool    │ │
│  │  - State query tools              │ │
│  └───────────┬───────────────────────┘ │
└──────────────┼─────────────────────────┘
               │
               │ HTTP REST API
               ↓
┌─────────────────────────────────────────┐
│  Dynamic Story Server (Flask)           │
│  localhost:5000                         │
│                                         │
│  - Session management                   │
│  - LLM narrative generation             │
│  - Character/world state                │
└─────────────────────────────────────────┘
```

## Files Created

### Sherlock Platform

**`.mcp_config.json`** - MCP server configuration
```json
{
  "mcpServers": {
    "story-game": {
      "command": "/home/john/story/main/venv/bin/python",
      "args": ["/home/john/story/main/src/servers/story_mcp_server.py"],
      "env": {
        "PYTHONPATH": "/home/john/story/main"
      }
    }
  }
}
```

**`packages/mcp-server/`** - MCP client package
- `package.json` - Package configuration
- `tsconfig.json` - TypeScript configuration
- `src/index.ts` - MCP client implementation
- `README.md` - Usage documentation

### Story Platform

Already integrated from earlier work:
- `src/servers/story_mcp_server.py` - MCP server with agent extension
- `docs/MCP_AGENT_EXTENSION.md` - MCP agent documentation

---

## Usage Examples

### Basic Agent Playthrough

```typescript
import { StoryMCPClient } from '@sherlock/mcp-server';

const client = new StoryMCPClient();
await client.connect();

const summary = await client.playStorySession({
  story_template: 'jade_dragon_mystery',
  strategy: 'exploratory',
  max_actions: 50
});

console.log(summary);
await client.disconnect();
```

### Multi-Agent Study

```typescript
import { runMultiAgentExploration } from '@sherlock/mcp-server';

// Run 40 playthroughs across 4 strategies
const results = await runMultiAgentExploration({
  story_template: 'jade_dragon_mystery',
  strategies: ['exploratory', 'goal_driven', 'curious', 'random'],
  playthroughs_per_strategy: 10,
  max_actions: 50
});

// Analyze choice distributions
const choiceFreq = {};
results.forEach(record => {
  record.actions.forEach(action => {
    choiceFreq[action.choice_id] = (choiceFreq[action.choice_id] || 0) + 1;
  });
});
```

### Integration with Sherlock API

```typescript
// In packages/api/src/services/agent-exploration.ts

import { StoryMCPClient } from '@sherlock/mcp-server';
import { prisma } from '../lib/prisma';

export async function runBatchExploration(batchId: string) {
  const client = new StoryMCPClient();
  await client.connect();

  try {
    // Get batch configuration
    const batch = await prisma.batchExecution.findUnique({
      where: { id: batchId }
    });

    // Run playthroughs
    for (let i = 0; i < batch.count; i++) {
      const summary = await client.playStorySession({
        story_template: batch.storyTemplate,
        strategy: batch.strategy,
        max_actions: 50
      });

      // Store results in database
      // ... save to Prisma
    }
  } finally {
    await client.disconnect();
  }
}
```

---

## Agent Strategies

| Strategy | Description | Use Case |
|----------|-------------|----------|
| `exploratory` | Maximizes branch coverage, favors novel choices | Mapping story structure |
| `goal_driven` | Focuses on protagonist goals | Finding success paths |
| `curious` | Follows mysteries and character interactions | Natural player simulation |
| `random` | Random baseline | Control group |
| `optimal` | LLM-based prediction (placeholder) | Perfect playthroughs |

---

## Database Integration

### Prisma Schema (Already Exists)

```prisma
model AgentDefinition {
  id            String    @id @default(cuid())
  researcherId  String
  researcher    Researcher @relation(fields: [researcherId], references: [id])

  name          String
  description   String?
  strategy      String    // exploratory, goal_driven, etc.
  maxActions    Int       @default(50)

  batchExecutions BatchExecution[]

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@map("agent_definitions")
}

model BatchExecution {
  id                String    @id @default(cuid())
  studyId           String
  study             Study     @relation(fields: [studyId], references: [id])

  agentDefinitionId String
  agentDefinition   AgentDefinition @relation(fields: [agentDefinitionId], references: [id])

  storyTemplate     String
  count             Int       // Number of playthroughs
  progress          Int       @default(0)
  status            String    @default("PENDING") // PENDING, RUNNING, COMPLETED, FAILED

  storyData         StoryData[]

  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  @@map("batch_executions")
}

model StoryData {
  id                String    @id @default(cuid())
  sessionId         String    @unique

  batchExecutionId  String?
  batchExecution    BatchExecution? @relation(fields: [batchExecutionId], references: [id])

  data              String    // JSON playthrough record
  createdAt         DateTime  @default(now())

  @@map("story_data")
}
```

---

## Next Steps

### 1. Install Dependencies

```bash
cd ~/sherlock
pnpm install
```

This will install the `@modelcontextprotocol/sdk` dependency for the mcp-server package.

### 2. Implement Agent Routes

**Create**: `packages/api/src/routes/agent-definitions.ts`

```typescript
import { Router } from 'express';
import { StoryMCPClient } from '@sherlock/mcp-server';
import { prisma } from '../lib/prisma';

export const agentDefinitionsRouter = Router();

// List agent definitions
agentDefinitionsRouter.get('/', async (req, res) => {
  const agents = await prisma.agentDefinition.findMany({
    where: { researcherId: req.user.id }
  });
  res.json({ success: true, data: agents });
});

// Create agent definition
agentDefinitionsRouter.post('/', async (req, res) => {
  const agent = await prisma.agentDefinition.create({
    data: {
      researcherId: req.user.id,
      name: req.body.name,
      strategy: req.body.strategy,
      maxActions: req.body.maxActions || 50
    }
  });
  res.json({ success: true, data: agent });
});

// Run batch exploration
agentDefinitionsRouter.post('/:id/run-batch', async (req, res) => {
  const { id } = req.params;
  const { storyTemplate, count, studyId } = req.body;

  // Create batch execution
  const batch = await prisma.batchExecution.create({
    data: {
      agentDefinitionId: id,
      studyId,
      storyTemplate,
      count,
      status: 'PENDING'
    }
  });

  // Queue for background processing
  // (Use BullMQ or similar)

  res.json({ success: true, data: batch });
});
```

### 3. Create Background Worker

**Create**: `packages/api/src/workers/agent-exploration.ts`

```typescript
import { StoryMCPClient } from '@sherlock/mcp-server';
import { prisma } from '../lib/prisma';

export async function processAgentExploration(batchId: string) {
  const batch = await prisma.batchExecution.findUnique({
    where: { id: batchId },
    include: { agentDefinition: true }
  });

  if (!batch) throw new Error('Batch not found');

  // Update status
  await prisma.batchExecution.update({
    where: { id: batchId },
    data: { status: 'RUNNING' }
  });

  const client = new StoryMCPClient();
  await client.connect();

  try {
    for (let i = 0; i < batch.count; i++) {
      // Run playthrough
      const summary = await client.playStorySession({
        story_template: batch.storyTemplate,
        strategy: batch.agentDefinition.strategy as any,
        max_actions: batch.agentDefinition.maxActions
      });

      // Extract session ID
      const sessionIdMatch = summary.match(/Session ID: ([\\w-]+)/);
      if (sessionIdMatch) {
        const record = await client.getPlaythroughRecord(sessionIdMatch[1]);

        // Store in database
        await prisma.storyData.create({
          data: {
            sessionId: record.session_id,
            batchExecutionId: batchId,
            data: JSON.stringify(record)
          }
        });
      }

      // Update progress
      await prisma.batchExecution.update({
        where: { id: batchId },
        data: { progress: i + 1 }
      });
    }

    // Mark complete
    await prisma.batchExecution.update({
      where: { id: batchId },
      data: { status: 'COMPLETED' }
    });

  } catch (error) {
    await prisma.batchExecution.update({
      where: { id: batchId },
      data: { status: 'FAILED' }
    });
    throw error;
  } finally {
    await client.disconnect();
  }
}
```

### 4. Add UI Components

In `packages/desktop` or `packages/web`, create UI for:
- Defining agent strategies
- Running batch explorations
- Viewing results and analytics
- Visualizing choice distributions

---

## Testing

### Test MCP Connection

```bash
cd ~/sherlock/packages/mcp-server
pnpm dev

# In another terminal
node -e "
import { StoryMCPClient } from './src/index.ts';
const client = new StoryMCPClient();
await client.connect();
const tools = await client.listTools();
console.log(tools);
await client.disconnect();
"
```

### Test Agent Playthrough

```bash
cd ~/story/main
source venv/bin/activate
python src/servers/dynamic_story_server.py

# In another terminal
cd ~/sherlock/packages/mcp-server
# Create test script
# Run playthrough
```

---

## Dependencies

**Prerequisites**:
1. ✅ Story MCP Server configured (`~/story/main`)
2. ✅ Dynamic Story Server running (`localhost:5000`)
3. ⏭️ Install Sherlock dependencies (`pnpm install`)
4. ⏭️ Implement API routes and workers

---

## Benefits

1. **Clean Separation**: Story platform provides MCP tools, Sherlock consumes them
2. **Type Safety**: TypeScript client with full type definitions
3. **Scalable**: Can run hundreds of playthroughs via background workers
4. **Database Integration**: Results stored in Prisma-managed database
5. **Research Ready**: Perfect for choice distribution studies and pattern analysis

---

## Related Documentation

- **Story MCP Extension**: `~/story/main/docs/MCP_AGENT_EXTENSION.md`
- **Agent Quickstart**: `~/story/main/docs/AGENT_QUICKSTART.md`
- **Integration Summary**: `~/story/main/AGENT_INTEGRATION_SUMMARY.md`
- **MCP Server Package**: `~/sherlock/packages/mcp-server/README.md`

---

**Status**: ✅ MCP Integration Ready
**Next**: Install dependencies and implement API routes
