# Sherlock MCP Server

**Location**: `packages/api/src/mcp-server.ts`
**Purpose**: Expose Sherlock Platform study design and management tools via MCP
**For**: AI assistants (like Claude) to help design and configure research studies

---

## Overview

The Sherlock MCP Server allows AI assistants to interact with the Sherlock research platform to help you design studies, configure conditions, set up agents, and manage research workflows.

### What Can I Do With It?

When connected to this MCP server, I (Claude) can help you:

- **Design Research Studies**: Create new studies with proper experimental conditions
- **Configure Conditions**: Set up control/experimental conditions with appropriate settings
- **Define Agents**: Configure autonomous agents for story exploration
- **Run Batch Explorations**: Queue up multiple agent playthroughs for data collection
- **Suggest Study Designs**: Analyze your research question and propose study structures

---

## Configuration

The MCP server is configured in `.mcp_config.json`:

```json
{
  "mcpServers": {
    "sherlock-platform": {
      "command": "node",
      "args": [
        "/home/john/sherlock/node_modules/.bin/tsx",
        "/home/john/sherlock/packages/api/src/mcp-server.ts"
      ],
      "env": {
        "DATABASE_URL": "file:/home/john/sherlock/packages/api/dev.db",
        "NODE_ENV": "development"
      }
    }
  }
}
```

---

## Available Tools

### Project Management

#### `list_projects`
List all research projects with study counts.

**Returns**:
```json
[
  {
    "id": "proj_123",
    "name": "Interactive Storytelling Study 2025",
    "description": "Investigating choice patterns in narrative games",
    "study_count": 3,
    "created_at": "2025-01-15T10:00:00Z"
  }
]
```

#### `create_project`
Create a new research project.

**Input**:
```json
{
  "name": "My Research Project",
  "description": "Optional description"
}
```

---

### Study Management

#### `list_studies`
List studies (optionally filtered by project).

**Input**:
```json
{
  "project_id": "proj_123"  // Optional
}
```

**Returns**:
```json
[
  {
    "id": "study_456",
    "name": "Choice Patterns Study",
    "type": "SINGLE_PARTICIPANT",
    "status": "DRAFT",
    "project": "Interactive Storytelling Study 2025",
    "condition_count": 2,
    "participant_count": 0,
    "session_count": 0
  }
]
```

#### `create_study`
Create a new study with conditions.

**Input**:
```json
{
  "project_id": "proj_123",
  "name": "Choice Distribution Study",
  "description": "Analyze how different agent strategies explore story space",
  "type": "SINGLE_PARTICIPANT",
  "conditions": [
    {
      "name": "Control - Random Agent",
      "description": "Baseline random choice selection",
      "story_template": "jade_dragon_mystery",
      "config": {
        "agent_strategy": "random"
      }
    },
    {
      "name": "Experimental - Goal-Driven Agent",
      "description": "Agent focuses on protagonist goals",
      "story_template": "jade_dragon_mystery",
      "config": {
        "agent_strategy": "goal_driven"
      }
    }
  ]
}
```

#### `get_study_details`
Get complete study information including conditions, participants, and recent sessions.

**Input**:
```json
{
  "study_id": "study_456"
}
```

---

### Condition Management

#### `add_condition`
Add an experimental condition to a study.

**Input**:
```json
{
  "study_id": "study_456",
  "name": "Exploratory Agent Condition",
  "description": "Agent maximizes branch coverage",
  "story_template": "jade_dragon_mystery",
  "config": {
    "agent_strategy": "exploratory",
    "max_actions": 50
  }
}
```

#### `list_conditions`
List all conditions for a study.

**Input**:
```json
{
  "study_id": "study_456"
}
```

---

### Agent Management

#### `create_agent_definition`
Define an autonomous agent for story exploration.

**Input**:
```json
{
  "name": "Exploratory Agent v1",
  "description": "Maximizes branch coverage by favoring novel choices",
  "strategy": "exploratory",
  "max_actions": 50
}
```

**Strategies**:
- `exploratory` - Maximizes branch coverage
- `goal_driven` - Focuses on protagonist goals
- `curious` - Follows mysteries and interesting content
- `random` - Baseline random selection
- `optimal` - LLM-based prediction (placeholder)

#### `list_agent_definitions`
List all configured agents.

---

### Batch Execution

#### `create_batch_execution`
Queue multiple agent playthroughs for data collection.

**Input**:
```json
{
  "study_id": "study_456",
  "agent_definition_id": "agent_789",
  "story_template": "jade_dragon_mystery",
  "count": 50
}
```

This will run 50 playthroughs using the specified agent and store all results in the database.

#### `get_batch_status`
Check progress of a batch execution.

**Input**:
```json
{
  "batch_id": "batch_abc"
}
```

**Returns**:
```json
{
  "id": "batch_abc",
  "status": "RUNNING",
  "progress": 25,
  "total": 50,
  "agent": "Exploratory Agent v1",
  "strategy": "exploratory",
  "completed_playthroughs": 25
}
```

---

### AI-Assisted Design

#### `suggest_study_design`
Get AI-assisted study design suggestions based on your research question.

**Input**:
```json
{
  "research_question": "How do different narrative strategies affect player choice distributions in interactive stories?",
  "study_type": "SINGLE_PARTICIPANT",  // Optional
  "participant_count": 100  // Optional
}
```

**Returns**:
```json
{
  "research_question": "How do different narrative strategies...",
  "suggested_type": "SINGLE_PARTICIPANT",
  "suggested_conditions": [
    {
      "name": "Control - Linear Narrative",
      "description": "Traditional linear story with minimal branching",
      "config": {}
    },
    {
      "name": "Experimental - Branching Narrative",
      "description": "Multiple story paths with significant choice impact",
      "config": {}
    }
  ],
  "sample_size_recommendation": 100,
  "notes": "Consider counter-balancing condition order..."
}
```

---

## Usage Examples

### Example 1: Create a New Study

"Claude, I want to create a new study called 'Agent Behavior Analysis' in my 'Narrative Research' project. The study should test how different agent strategies (exploratory vs. goal-driven) explore the Jade Dragon Mystery story. Set up two conditions."

I would use:
1. `list_projects` - Find the project ID
2. `create_study` - Create the study with two conditions
3. `create_agent_definition` - Define the exploratory agent
4. `create_agent_definition` - Define the goal-driven agent
5. `create_batch_execution` - Queue 25 playthroughs per condition

### Example 2: Check Batch Progress

"Claude, how's that batch exploration going?"

I would use:
1. `get_batch_status` - Check the current progress

### Example 3: Add a New Condition

"Claude, add a 'curious' agent condition to the current study"

I would use:
1. `add_condition` - Add the new condition
2. `create_agent_definition` - Define the curious agent
3. `create_batch_execution` - Optionally queue playthroughs

---

## Study Types

| Type | Description | Use Case |
|------|-------------|----------|
| `SINGLE_PARTICIPANT` | Individual participants | Most agent-based studies |
| `PAIRED_COLLABORATIVE` | Two participants working together | Collaborative authoring studies |
| `MULTI_ROUND` | Multiple sessions per participant | Longitudinal studies |
| `CUSTOM` | Custom study design | Advanced experimental designs |

---

## Installation

```bash
cd ~/sherlock
pnpm install  # Installs @modelcontextprotocol/sdk
```

## Running the MCP Server

```bash
cd ~/sherlock/packages/api
pnpm mcp:start
```

Or via the configured MCP client (Claude Code will start it automatically).

---

## Integration with Story MCP Server

The Sherlock MCP Server works alongside the Story MCP Server:

```
┌──────────────────────┐
│  Claude (AI)         │
│                      │
└───┬──────────────┬───┘
    │              │
    │              │
    ↓              ↓
┌────────────┐  ┌────────────────┐
│ Sherlock   │  │ Story MCP      │
│ MCP Server │  │ Server         │
│            │  │                │
│ Study      │  │ Agent          │
│ Management │  │ Playthrough    │
└────────────┘  └────────────────┘
```

**Workflow**:
1. Use Sherlock MCP to design study and create conditions
2. Use Sherlock MCP to configure agents
3. Use Sherlock MCP to queue batch executions
4. Sherlock internally uses Story MCP client to run agents
5. Results stored in Sherlock database
6. Use Sherlock MCP to analyze results

---

## Database Schema

The MCP server uses Prisma with SQLite (dev) or PostgreSQL (production).

**Key Models**:
- `Project` - Research project container
- `Study` - Individual study with conditions
- `Condition` - Experimental condition configuration
- `AgentDefinition` - Agent strategy configuration
- `BatchExecution` - Batch playthrough job
- `StoryData` - Individual playthrough results

---

## Authentication

**Current**: No authentication (development mode)

**Production TODO**:
- Add JWT authentication
- Researcher ID from token
- Proper access control
- Rate limiting

---

## Example Conversation

**You**: "Claude, help me design a study to test if exploratory agents find more story branches than random agents"

**Me**: "Great research question! Let me help you set up that study. First, let me check your existing projects..."

*Uses `list_projects`*

**Me**: "I see you have 'Narrative Research 2025'. I'll create a new study there called 'Branch Coverage Comparison' with two conditions: exploratory and random. Let me set that up..."

*Uses `create_study` with conditions*

**Me**: "✓ Study created! Now let me create the agent definitions..."

*Uses `create_agent_definition` twice*

**Me**: "Perfect! Now I'll queue up 50 playthroughs for each condition..."

*Uses `create_batch_execution` twice*

**Me**: "All set! You now have 100 playthroughs queued. I'll monitor the progress and let you know when it's complete."

---

## Limitations & TODOs

**Current Limitations**:
- No authentication (uses placeholder researcher ID)
- No real LLM integration for `suggest_study_design` (returns template)
- Background worker queue not implemented (manual trigger needed)
- No real-time progress notifications

**Planned Features**:
- JWT authentication from Sherlock API
- LLM-powered study design suggestions
- BullMQ integration for background processing
- WebSocket for real-time progress updates
- Advanced analytics tools
- Export/import study configurations

---

## Related Documentation

- **Story MCP Server**: `~/story/main/docs/MCP_AGENT_EXTENSION.md`
- **MCP Integration Guide**: `~/sherlock/docs/MCP_INTEGRATION.md`
- **Sherlock API**: `~/sherlock/packages/api/README.md`

---

**Status**: ✅ Ready for use
**Next**: Connect via Claude Code and start designing studies!
