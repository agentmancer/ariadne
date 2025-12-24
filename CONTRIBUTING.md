# Contributing to Ariadne Platform

Thank you for your interest in contributing to Ariadne!

## Development Setup

1. **Prerequisites**:
   - Node.js 20+
   - pnpm 8+
   - PostgreSQL 14+
   - Docker (optional)

2. **Install dependencies**:
   ```bash
   pnpm install
   ```

3. **Set up environment**:
   ```bash
   cp packages/api/.env.example packages/api/.env
   # Edit .env with your configuration
   ```

4. **Start database** (using Docker):
   ```bash
   docker-compose up postgres
   ```

5. **Run migrations**:
   ```bash
   cd packages/api
   pnpm prisma:migrate
   ```

6. **Start development servers**:
   ```bash
   # Terminal 1: API
   cd packages/api && pnpm dev

   # Terminal 2: Desktop app
   cd packages/desktop && pnpm dev

   # Terminal 3: Web app
   cd packages/web && pnpm dev
   ```

## Code Style

- Use TypeScript for all new code
- Follow existing code patterns
- Run `pnpm lint` before committing
- Run `pnpm type-check` to verify types

## Commit Messages

Use conventional commit format:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `refactor:` - Code refactoring
- `test:` - Adding tests
- `chore:` - Maintenance tasks

Example:
```
feat(api): add participant filtering endpoint
fix(desktop): resolve timeline sync issue
docs: update plugin development guide
```

## Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Make your changes
4. Run tests and linting
5. Commit your changes
6. Push to your fork
7. Open a Pull Request

## Questions?

Open an issue for discussion before starting major work.
