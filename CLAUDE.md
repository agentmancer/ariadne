# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Install dependencies (from root) - also initializes git submodules
pnpm install

# Start all packages in parallel dev mode
pnpm dev

# Build all packages
pnpm build

# Build vendor Twine (required once for web package)
pnpm build:twine

# Run all tests
pnpm test

# Lint and type-check
pnpm lint
pnpm type-check

# Clean all build artifacts
pnpm clean
```

### Package-Specific Commands

**API (packages/api)**:
```bash
pnpm dev              # Start with hot reload on port 3002
pnpm build            # Compile TypeScript
pnpm test             # Run tests once
pnpm test -- --watch  # Run tests in watch mode
pnpm prisma:generate  # Generate Prisma client after schema changes
pnpm prisma:migrate   # Run database migrations
pnpm prisma:studio    # Open Prisma Studio UI
```

**Web (packages/web)** - Participant interface:
```bash
pnpm dev      # Vite dev server on port 5173
pnpm build    # Production build
```

**Mobile-Web (packages/mobile-web)** - Researcher dashboard:
```bash
pnpm dev      # Vite dev server on port 5174
pnpm build    # Production build
```

**MCP Server (packages/mcp-server)**:
```bash
pnpm dev              # Start with hot reload
pnpm test:connection  # Test MCP connection
```

### Running Tests

```bash
# Run all tests across packages
pnpm test

# Run tests in a specific package
cd packages/api && pnpm test

# Run a single test file
cd packages/api && pnpm test -- src/__tests__/routes/studies.test.ts

# Watch mode for development
cd packages/api && pnpm test -- --watch
```

### Local Services (Docker)

```bash
docker-compose up -d postgres redis minio  # Start PostgreSQL, Redis, MinIO
```

### First-Time Setup

```bash
pnpm install
docker-compose up -d postgres redis minio
cd packages/api
cp .env.example .env  # Edit with your config
pnpm prisma:generate
pnpm prisma:migrate
cd ../..
pnpm build:twine  # Build vendor Twine for web package
pnpm dev
```

## Parallel Development with Worktrees

For working on multiple features simultaneously with isolated ports:

```bash
# Create a worktree (auto-assigns unique ports)
./scripts/create-worktree.sh issue-123-feature

# Ports allocated: API 3100-3199, Web 5200-5299, Mobile 5300-5399
# Uses shared PostgreSQL and Redis

# Remove when done
git worktree remove .worktrees/issue-123-feature
```

## Architecture Overview

Ariadne is a **pnpm monorepo** for interactive storytelling research:

```
packages/
├── api/          # Express backend (Prisma, JWT auth, S3, BullMQ)
├── web/          # Vite + React (participant interface)
├── mobile-web/   # PWA + React + Tailwind (researcher dashboard)
├── shared/       # TypeScript types, Zod validators, utilities
├── plugins/      # Base plugin system (BaseStoryPlugin, registry)
├── modules/
│   └── twine/    # Twine interactive fiction plugin
└── mcp-server/   # MCP (Model Context Protocol) integration
vendor/
└── twinejs/      # Twine editor (git submodule)
```

### Package Dependencies

- All packages import from `@ariadne/shared` for types and validators
- `@ariadne/api` depends on `@ariadne/plugins`, `@ariadne/module-twine`, `@ariadne/shared`
- Frontend packages (web, mobile-web) depend on `@ariadne/shared`

### API Structure

The API follows a routes → services → database pattern:

**Routes** (`src/routes/`):
- **Auth & Users**: auth, researchers, enrollment
- **Study Management**: projects, studies, conditions, participants, sessions
- **Data Collection**: surveys, events, story-data
- **Synthetic Actors**: agent-definitions, batch-executions, llm-providers, architecture-configs
- **Integrations**: prolific, evaluation, participant-session

**Services** (`src/services/`): Queue management (BullMQ), S3 integration, collaborative orchestration

**Middleware**: Helmet, CORS, rate limiting (100 req/15min), JWT auth (`authenticateResearcher`, `authenticateParticipant`)

### Plugin System

Story platforms are added via the plugin architecture:

- Extend `BaseStoryPlugin` from `@ariadne/plugins`
- Register with `pluginRegistry`
- Plugins support headless mode and role-based LLM adapters

### Job Queue (BullMQ + Redis)

Background workers in `src/services/queue/workers/`:
- Batch story creation
- Synthetic execution (collaborative, hybrid)
- Data export

## Key Files

- `packages/api/prisma/schema.prisma` - Database schema
- `packages/api/.env.example` - Required environment variables
- `packages/shared/src/types.ts` - Core type definitions (SessionStage, StudyType, etc.)
- `packages/shared/src/validators.ts` - Zod schemas for API validation

## Testing Patterns

Reference: `packages/api/src/__tests__/routes/prolific.test.ts`

Tests use:
- `vitest` for test runner
- `supertest` for HTTP assertions (no port binding)
- `createApp()` from `../../app` for isolated Express instance
- `beforeEach` cleanup for test isolation
- Fixtures pattern for test data setup

## Commit Convention

```
type(scope): message
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

Examples:
- `feat(api): add participant filtering endpoint`
- `fix(mobile-web): resolve responsive layout issue`
