# Ariadne Platform

> **Interactive Storytelling Research Platform**

A modern, cloud-hybrid platform for conducting interactive storytelling research with support for multiple authoring tools, AI-driven synthetic participants, comprehensive data collection, and Prolific recruitment.

## Architecture Overview

Ariadne is built as a **pnpm monorepo** with the following components:

```
┌─────────────────────────────────────────────────────────────┐
│              Researcher Dashboard (React PWA)               │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │   Study     │  │  Participant │  │  Batch Execution │   │
│  │   Editor    │  │  Management  │  │  & Monitoring    │   │
│  └─────────────┘  └──────────────┘  └──────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↕ REST API
┌─────────────────────────────────────────────────────────────┐
│                 Cloud Backend (Node.js + Express)           │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │   API    │  │   BullMQ     │  │  Prolific          │    │
│  │  Server  │  │   Workers    │  │  Integration       │    │
│  └──────────┘  └──────────────┘  └────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
           ↕                          ↕                 ↕
┌─────────────────┐       ┌─────────────────┐   ┌───────────┐
│   PostgreSQL    │       │   S3 / MinIO    │   │  Prolific │
│   + Redis       │       │   (stories,     │   │   API     │
│                 │       │    exports)     │   │           │
└─────────────────┘       └─────────────────┘   └───────────┘
                                   ↕
┌─────────────────────────────────────────────────────────────┐
│              Participant Web Interface (React)              │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐    │
│  │   Story     │  │   Surveys    │  │   Consent &     │    │
│  │  Playback   │  │              │  │   Enrollment    │    │
│  └─────────────┘  └──────────────┘  └─────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Monorepo Structure

```
ariadne/
├── packages/
│   ├── api/          # Cloud backend API (Node.js + Express + Prisma)
│   ├── web/          # Participant web interface (React + Vite)
│   ├── mobile-web/   # Researcher dashboard PWA (React + Tailwind)
│   ├── shared/       # Shared types, utilities, validators (TypeScript)
│   ├── plugins/      # Story platform plugin system
│   └── modules/
│       └── twine/    # Twine interactive fiction plugin
├── docker-compose.yml
├── package.json
└── pnpm-workspace.yaml
```

## Key Features

### For Researchers

- **Study Editor**: Design studies with conditions, surveys, and consent forms
- **Survey Builder**: Create surveys with multiple question types (Likert, multiple choice, text, scale, etc.)
- **Enrollment Configuration**: Rich text consent forms with versioning
- **Condition Management**: Define experimental conditions with JSON configuration
- **Participant Management**: Track participant progress and status
- **Batch Executions**: Run synthetic participants with LLM-driven agents
- **Prolific Integration**: Automated participant recruitment and payment
- **Mobile-Optimized Dashboard**: Responsive PWA for monitoring studies on any device

### For Participants

- **Multiple Story Platforms**: Twine integration with plugin system for extensibility
- **Web-Based Interface**: No installation required, accessible from any browser
- **Survey Completion**: Clean, accessible survey interface
- **Consent Management**: Clear consent forms with version tracking

### Technical Features

- **Plugin Architecture**: Extensible system for adding new story authoring platforms
- **Background Jobs**: BullMQ workers for batch execution and data export
- **Cloud Storage**: S3/MinIO for stories and exports
- **PostgreSQL Database**: Relational database with Prisma ORM
- **TypeScript**: Type-safe codebase across all packages
- **Comprehensive Validation**: Zod schemas for all API inputs
- **Security**: JWT authentication, rate limiting, CORS, helmet headers

## Technology Stack

| Component | Technologies |
|-----------|-------------|
| **Researcher Dashboard** | React 18, TypeScript, Vite, Tailwind CSS, PWA |
| **Participant Web** | React 18, TypeScript, Vite |
| **Backend** | Node.js 20+, Express, Prisma, BullMQ |
| **Database** | PostgreSQL 14+, Redis |
| **Storage** | S3 or MinIO |
| **Auth** | JWT with bcrypt |
| **Package Manager** | pnpm 8+ |

## Prerequisites

- **Node.js**: 20.x or higher
- **pnpm**: 8.x or higher
- **Docker**: For local services (PostgreSQL, Redis, MinIO)
- **PostgreSQL**: 14.x or higher (or use Docker)
- **Redis**: 6.x or higher (or use Docker)

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/agentmancer/ariadne.git
cd ariadne
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Start Local Services

```bash
docker-compose up -d postgres redis minio
```

### 4. Set Up Environment Variables

```bash
cp packages/api/.env.example packages/api/.env
```

Edit `packages/api/.env` with your configuration:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/ariadne

# JWT
JWT_SECRET=your-secret-key-change-me-in-production

# S3/MinIO
AWS_REGION=us-east-1
AWS_S3_BUCKET=ariadne-data
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# Redis (for BullMQ)
REDIS_URL=redis://localhost:6379

# Optional: Prolific
PROLIFIC_API_KEY=your-prolific-api-key
```

### 5. Set Up Database

```bash
cd packages/api
pnpm prisma:generate
pnpm prisma:migrate
```

### 6. Start Development Servers

```bash
# From root directory - starts all packages
pnpm dev

# Or start individually:
cd packages/api && pnpm dev        # API on port 3002
cd packages/web && pnpm dev        # Participant UI on port 5173
cd packages/mobile-web && pnpm dev # Researcher dashboard on port 5174
```

## Deployment

### Docker Deployment

Build and run with Docker:

```bash
# Build images
docker build -t ariadne-api ./packages/api
docker build -t ariadne-web ./packages/web
docker build -t ariadne-mobile-web ./packages/mobile-web

# Or use docker-compose for full stack
docker-compose up -d
```

### Production Environment Variables

Ensure these are set in production:

- `NODE_ENV=production`
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `JWT_SECRET` - Strong random secret
- `CORS_ORIGINS` - Allowed frontend origins
- S3 credentials for file storage

### Database Migrations

```bash
cd packages/api
pnpm prisma:migrate deploy
```

## Development Commands

```bash
# Install dependencies
pnpm install

# Start all packages in dev mode
pnpm dev

# Build all packages
pnpm build

# Run tests
pnpm test

# Lint and type-check
pnpm lint
pnpm type-check

# Database commands
cd packages/api
pnpm prisma:generate  # Generate Prisma client
pnpm prisma:migrate   # Run migrations
pnpm prisma:studio    # Open Prisma Studio
```

## Plugin Development

Extend the platform with custom story authoring tools:

```typescript
import { BaseStoryPlugin, PluginMetadata, PluginCapability } from '@ariadne/plugins';

export class MyCustomPlugin extends BaseStoryPlugin {
  readonly metadata: PluginMetadata = {
    id: 'my-custom-plugin',
    name: 'My Custom Story Tool',
    version: '1.0.0',
    capabilities: [PluginCapability.CREATE, PluginCapability.PLAY]
  };

  protected async onRender(container: HTMLElement): Promise<void> {
    // Render your plugin UI
  }
}
```

## Security

- **Authentication**: JWT tokens with bcrypt password hashing
- **Authorization**: Role-based access (researchers vs. participants)
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **Input Validation**: Zod schemas for all API inputs
- **Security Headers**: Helmet middleware
- **CORS**: Configurable allowed origins
- **SQL Injection Protection**: Prisma ORM with parameterized queries

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

This means:
- You can use, modify, and distribute this software
- If you modify and deploy this software as a network service, you must make your source code available
- Any derivative works must also be licensed under AGPL-3.0

See the [LICENSE](LICENSE) file for full details.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Support

For issues, questions, or feature requests, please [open an issue](https://github.com/agentmancer/ariadne/issues) on GitHub.

---

**Repository**: https://github.com/agentmancer/ariadne
