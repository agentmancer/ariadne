# Sherlock Test Scripts

Scripts for running and testing the Sherlock collaborative study system.

## Prerequisites

1. **Start local services**:
   ```bash
   # From project root
   docker-compose up -d postgres redis minio
   ```

2. **Set up the database**:
   ```bash
   cd packages/api
   pnpm prisma:migrate
   ```

3. **Create MinIO bucket** (first time only):
   - Visit http://localhost:9001 (MinIO Console)
   - Login with `minioadmin` / `minioadmin`
   - Create a bucket named `sherlock-data`

4. **Configure environment**:
   Create `packages/api/.env.local`:
   ```bash
   # LLM Provider (choose one)
   ANTHROPIC_API_KEY=your-anthropic-key
   # OPENAI_API_KEY=your-openai-key

   # MinIO (local S3)
   S3_ENDPOINT=http://localhost:9000
   S3_FORCE_PATH_STYLE=true
   AWS_ACCESS_KEY_ID=minioadmin
   AWS_SECRET_ACCESS_KEY=minioadmin
   AWS_S3_BUCKET=sherlock-data
   ```

## Available Scripts

### 1. Synthetic Actor Study (AI-AI)

Two AI agents create stories, play each other's works, and provide feedback.

```bash
# Direct execution (no queue workers needed)
ROUNDS=3 pnpm tsx scripts/run-collaborative-session.ts

# Batch setup (requires workers)
pnpm tsx scripts/run-collaborative-batch.ts
```

### 2. Hybrid Human-AI Study

A human participant pairs with an AI partner. Human uses the browser-based Twine editor, AI uses headless tools/APIs.

```bash
# Set up the study
pnpm tsx scripts/setup-hybrid-study.ts

# Start workers (in separate terminal)
pnpm tsx scripts/start-workers.ts

# Start API server
pnpm dev
```

Then access the participant URL printed by the setup script.

### 3. Start All Workers

Starts all background queue workers for production-like testing:

```bash
pnpm tsx scripts/start-workers.ts
```

Workers started:
- Batch Creation Worker
- Synthetic Execution Worker
- Collaborative Batch Worker
- Collaborative Session Worker
- Hybrid Session Worker
- Data Export Worker

## Configuration Options

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `LLM_PROVIDER` | `anthropic` | LLM provider (`anthropic` or `openai`) |
| `LLM_MODEL` | `claude-sonnet-4-20250514` | Model name |
| `ROUNDS` | `2` (synthetic) / `3` (hybrid) | Number of collaborative rounds |
| `PAIR_COUNT` | `1` | Number of pairs (batch script only) |
| `ANTHROPIC_API_KEY` | - | Anthropic API key |
| `OPENAI_API_KEY` | - | OpenAI API key |

## Study Types

### Synthetic Actor Study (AI-AI)

Both participants are LLM-powered agents running headlessly:

```
Round 1:
  Agent A: AUTHOR → creates story
  Agent B: AUTHOR → creates story
  (parallel execution)

  Agent A: PLAY → plays B's story
  Agent B: PLAY → plays A's story
  (parallel execution)

  Agent A: REVIEW → feedback for B
  Agent B: REVIEW → feedback for A
  (parallel execution)

Round 2+: Same cycle, agents revise based on feedback
```

### Hybrid Human-AI Study

Human uses browser UI, AI uses headless APIs:

```
Round 1:
  Human: AUTHOR → creates story in Twine editor (browser)
  → Triggers AI partner to respond
  AI: AUTHOR → creates story via tools (headless)

  Human: PLAY → plays AI's story in browser
  AI: PLAY → navigates human's story (headless)

  Human: REVIEW → leaves comments in browser
  AI: REVIEW → generates feedback (headless)

Round 2+: Both revise based on partner feedback
```

## Understanding the Output

### AUTHOR Phase
- Creates/revises interactive story with passages and choices
- Stories saved to S3 and tracked in database

### PLAY Phase
- Navigates through partner's story
- Makes choices, records observations

### REVIEW Phase
- Provides structured feedback (strengths, improvements)
- Creates passage-level comments

## Troubleshooting

### "No API keys found"
Set either `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in your environment or `.env.local`.

### S3 upload errors
Ensure MinIO is running and the bucket exists:
```bash
docker-compose up -d minio
# Then create the bucket via the console at http://localhost:9001
```

### Database connection errors
```bash
docker-compose up -d postgres
```

### Redis connection errors (for workers)
```bash
docker-compose up -d redis
```

### Workers not processing jobs
Make sure to run `pnpm tsx scripts/start-workers.ts` in a separate terminal.
