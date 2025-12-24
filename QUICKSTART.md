# Ariadne Quick Start Guide

Get your first study running in 15 minutes!

## Step 1: Install & Setup (5 min)

```bash
# Clone repository
git clone https://github.com/my-symbiotic-ai/ariadne.git
cd ariadne

# Install dependencies
pnpm install

# Set up environment
cp packages/api/.env.example packages/api/.env
# Edit .env with your database and S3 credentials
```

## Step 2: Start Local Services (2 min)

```bash
# Start PostgreSQL and MinIO (S3-compatible)
docker-compose up -d postgres minio

# Run database migrations
cd packages/api
pnpm prisma:migrate
cd ../..
```

## Step 3: Start Development Servers (2 min)

```bash
# Terminal 1: API Server
cd packages/api && pnpm dev

# Terminal 2: Desktop App (in new terminal)
cd packages/desktop && pnpm dev
```

## Step 4: Create Your First Study (6 min)

1. **Register an account**:
   - Open the desktop app
   - Click "Register"
   - Enter your email and password

2. **Create a project**:
   - Click "New Project"
   - Name: "My First Study"
   - Description: "Testing Ariadne"

3. **Create a study**:
   - Open your project
   - Click "New Study"
   - Name: "Story Authoring Test"
   - Type: "Single Participant"
   - Plugin: "Twine"

4. **Add a survey**:
   - Click "Add Survey"
   - Timing: "Exit"
   - Add questions (demographics, experience, etc.)

5. **Launch study**:
   - Review configuration
   - Click "Activate Study"
   - Copy participant link

6. **Test as participant**:
   - Open participant link in browser
   - Complete the study
   - Check data in desktop app

## Next Steps

- **Add Prolific integration**: Set `PROLIFIC_API_KEY` in `.env`
- **Configure S3**: Update AWS credentials for production storage
- **Customize plugins**: Add AI generation or custom story tools
- **Deploy**: Use Docker to deploy to Railway/AWS/Azure

## Troubleshooting

**Database connection failed?**
```bash
# Check PostgreSQL is running
docker-compose ps
# Verify DATABASE_URL in .env
```

**Prisma errors?**
```bash
cd packages/api
pnpm prisma:generate
pnpm prisma:migrate
```

**Port already in use?**
```bash
# Change PORT in packages/api/.env
# Update CORS_ORIGINS to match new port
```

## Need Help?

- Check [README.md](README.md) for detailed documentation
- Review [CONTRIBUTING.md](CONTRIBUTING.md) for development setup
- Open an issue on GitHub
