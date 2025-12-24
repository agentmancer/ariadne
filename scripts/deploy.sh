#!/bin/bash
#
# Sherlock Deployment Script
# Deploys to jtm.io/sherlock
#
# Usage: ./scripts/deploy.sh [--setup|--deploy|--full]
#   --setup   First-time server setup (requires manual sudo steps)
#   --deploy  Deploy application only
#   --full    Setup + Deploy
#

set -e

# Configuration
SERVER="jtm.io"
SERVER_USER="lucid"
DEPLOY_DIR="/home/lucid/sherlock"
API_PORT=3002
MOBILE_WEB_PATH="/sherlock"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[DEPLOY]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Check prerequisites locally
check_local() {
    log "Checking local prerequisites..."
    command -v pnpm >/dev/null || error "pnpm not found"
    command -v rsync >/dev/null || error "rsync not found"
    command -v ssh >/dev/null || error "ssh not found"
}

# Build locally
build_local() {
    log "Building packages locally..."
    cd "$(dirname "$0")/.."

    # Install dependencies
    pnpm install

    # Generate Prisma client
    pnpm --filter @sherlock/api prisma:generate

    # Build shared package first
    pnpm --filter @sherlock/shared build

    # Build API
    pnpm --filter @sherlock/api build

    # Build mobile-web (static files)
    pnpm --filter @sherlock/mobile-web build

    log "Build complete!"
}

# Sync files to server
sync_to_server() {
    log "Syncing files to server..."
    cd "$(dirname "$0")/.."

    # Create deployment package list
    rsync -avz --progress \
        --exclude 'node_modules' \
        --exclude '.git' \
        --exclude '*.db' \
        --exclude '.env' \
        --exclude 'dist' \
        --include 'packages/api/dist/***' \
        --include 'packages/shared/dist/***' \
        --include 'packages/mobile-web/dist/***' \
        --exclude 'packages/desktop' \
        --exclude 'packages/web' \
        --exclude 'packages/mcp-server' \
        ./ "${SERVER_USER}@${SERVER}:${DEPLOY_DIR}/"

    # Sync built dist folders explicitly
    rsync -avz --progress \
        packages/api/dist/ \
        "${SERVER_USER}@${SERVER}:${DEPLOY_DIR}/packages/api/dist/"

    rsync -avz --progress \
        packages/shared/dist/ \
        "${SERVER_USER}@${SERVER}:${DEPLOY_DIR}/packages/shared/dist/"

    rsync -avz --progress \
        packages/mobile-web/dist/ \
        "${SERVER_USER}@${SERVER}:${DEPLOY_DIR}/packages/mobile-web/dist/"

    log "Sync complete!"
}

# Install dependencies on server
install_server_deps() {
    log "Installing dependencies on server..."
    ssh "${SERVER_USER}@${SERVER}" << 'ENDSSH'
        export PATH=~/.local/bin:$PATH
        cd ~/sherlock

        # Install production dependencies only
        pnpm install --prod

        # Generate Prisma client on server
        cd packages/api
        npx prisma generate
ENDSSH
    log "Server dependencies installed!"
}

# Create/update .env on server
setup_env() {
    log "Setting up environment on server..."

    # Check if .env exists
    if ssh "${SERVER_USER}@${SERVER}" "test -f ${DEPLOY_DIR}/packages/api/.env"; then
        warn ".env already exists, skipping..."
        return
    fi

    ssh "${SERVER_USER}@${SERVER}" << ENDSSH
        cat > ${DEPLOY_DIR}/packages/api/.env << 'EOF'
# Environment
NODE_ENV=production

# Server
PORT=${API_PORT}

# Database - PostgreSQL
DATABASE_URL=postgresql://sherlock:sherlock@localhost:5432/sherlock

# JWT - CHANGE THESE IN PRODUCTION!
JWT_SECRET=$(openssl rand -hex 32)
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# CORS
CORS_ORIGINS=https://jtm.io,http://jtm.io

# AWS S3 (configure if needed)
AWS_REGION=us-east-1
AWS_S3_BUCKET=sherlock-data
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

# Email
EMAIL_PROVIDER=console
EMAIL_FROM=noreply@jtm.io
EOF
ENDSSH
    log "Environment file created!"
}

# Setup PM2 ecosystem
setup_pm2() {
    log "Setting up PM2..."
    ssh "${SERVER_USER}@${SERVER}" << ENDSSH
        cat > ${DEPLOY_DIR}/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'sherlock-api',
      cwd: './packages/api',
      script: 'dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: ${API_PORT}
      },
      error_file: '../../logs/api-error.log',
      out_file: '../../logs/api-out.log',
      log_file: '../../logs/api-combined.log',
      time: true
    }
  ]
};
EOF
        mkdir -p ${DEPLOY_DIR}/logs
ENDSSH
    log "PM2 ecosystem configured!"
}

# Start/restart application
start_app() {
    log "Starting application..."
    ssh "${SERVER_USER}@${SERVER}" << 'ENDSSH'
        export PATH=~/.local/bin:$PATH
        cd ~/sherlock

        # Stop existing if running
        pm2 delete sherlock-api 2>/dev/null || true

        # Start fresh
        pm2 start ecosystem.config.js

        # Save PM2 process list
        pm2 save

        # Show status
        pm2 status
ENDSSH
    log "Application started!"
}

# Print nginx configuration needed
print_nginx_config() {
    cat << 'EOF'

================================================================================
NGINX CONFIGURATION REQUIRED (run with sudo on server)
================================================================================

Add this to /etc/nginx/sites-available/jtm.io.conf inside the server block:

    # Sherlock API proxy
    location /sherlock/api/ {
        proxy_pass http://127.0.0.1:3002/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # Sherlock Mobile Web (static files)
    location /sherlock {
        alias /home/lucid/sherlock/packages/mobile-web/dist;
        try_files $uri $uri/ /sherlock/index.html;

        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

Then run:
    sudo nginx -t
    sudo systemctl reload nginx

================================================================================
EOF
}

# Print PostgreSQL setup instructions
print_postgres_setup() {
    cat << 'EOF'

================================================================================
POSTGRESQL SETUP REQUIRED (run with sudo on server)
================================================================================

1. Install PostgreSQL:
   sudo apt update
   sudo apt install -y postgresql postgresql-contrib

2. Start and enable PostgreSQL:
   sudo systemctl start postgresql
   sudo systemctl enable postgresql

3. Create database and user (replace with secure password):
   # Generate a secure password:
   #   openssl rand -base64 32
   # Then create the user (NEVER commit real passwords to version control):
   sudo -u postgres psql << SQL
   CREATE USER sherlock WITH PASSWORD '\${SHERLOCK_DB_PASSWORD}';
   CREATE DATABASE sherlock OWNER sherlock;
   ALTER USER sherlock CREATEDB;
   GRANT ALL PRIVILEGES ON DATABASE sherlock TO sherlock;
   SQL

   # Update your .env file with the DATABASE_URL:
   #   DATABASE_URL=postgresql://sherlock:\${SHERLOCK_DB_PASSWORD}@localhost:5432/sherlock

4. Then run the database migration:
   ssh jtm.io "cd ~/sherlock/packages/api && npx prisma db push"

================================================================================
EOF
}

# Check server status
check_server() {
    log "Checking server status..."
    ssh "${SERVER_USER}@${SERVER}" << 'ENDSSH'
        echo "=== Node Version ==="
        node --version

        echo -e "\n=== pnpm Version ==="
        export PATH=~/.local/bin:$PATH
        pnpm --version

        echo -e "\n=== PostgreSQL Status ==="
        systemctl is-active postgresql 2>/dev/null || echo "Not installed/running"

        echo -e "\n=== PM2 Status ==="
        pm2 list

        echo -e "\n=== Disk Space ==="
        df -h /home
ENDSSH
}

# Full setup (first time)
setup() {
    log "Starting first-time setup..."
    check_local
    print_postgres_setup
    print_nginx_config

    warn "Please run the PostgreSQL and nginx commands above with sudo on the server"
    warn "Then run: ./scripts/deploy.sh --deploy"
}

# Deploy only
deploy() {
    log "Starting deployment..."
    check_local
    build_local
    sync_to_server
    install_server_deps
    setup_env
    setup_pm2
    start_app

    log "Deployment complete!"
    log "API running at: https://jtm.io/sherlock/api/"
    log "Mobile Web at:  https://jtm.io/sherlock/"

    check_server
}

# Main
case "${1:-}" in
    --setup)
        setup
        ;;
    --deploy)
        deploy
        ;;
    --full)
        setup
        echo ""
        read -p "Have you completed the sudo steps above? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            deploy
        fi
        ;;
    --status)
        check_server
        ;;
    *)
        echo "Sherlock Deployment Script"
        echo ""
        echo "Usage: $0 [--setup|--deploy|--full|--status]"
        echo ""
        echo "  --setup   Show first-time setup instructions"
        echo "  --deploy  Build and deploy application"
        echo "  --full    Setup instructions + deploy"
        echo "  --status  Check server status"
        echo ""
        ;;
esac
