#!/bin/bash

# Sherlock Platform - Development Server Starter
# Runs all dev servers in the background with nohup

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"

# Create logs directory
mkdir -p "$LOG_DIR"

# Check if already running
if pgrep -f "pnpm.*dev" > /dev/null; then
    echo "Dev servers appear to be already running. Kill them first with: ./stop-dev.sh"
    exit 1
fi

# Start Docker services if available
if command -v docker &> /dev/null; then
    echo "Starting Docker services (redis, minio)..."
    docker compose up -d redis minio 2>/dev/null || true
fi

# Start dev servers
echo "Starting Sherlock dev servers..."
cd "$SCRIPT_DIR"
nohup pnpm dev > "$LOG_DIR/dev.log" 2>&1 &
DEV_PID=$!

echo "$DEV_PID" > "$LOG_DIR/dev.pid"

sleep 3

# Check if started successfully
if ps -p $DEV_PID > /dev/null; then
    echo ""
    echo "Sherlock dev servers started successfully!"
    echo ""
    echo "Services:"
    echo "  API:        http://localhost:3002"
    echo "  API Docs:   http://localhost:3002/api/docs"
    echo "  Web:        http://localhost:5173"
    echo "  Mobile Web: http://localhost:5174"
    echo "  Desktop:    http://localhost:5175 (Electron)"
    echo ""
    echo "Logs: $LOG_DIR/dev.log"
    echo "PID:  $DEV_PID"
    echo ""
    echo "To stop: ./stop-dev.sh"
    echo "To view logs: tail -f $LOG_DIR/dev.log"
else
    echo "Failed to start dev servers. Check $LOG_DIR/dev.log for errors."
    exit 1
fi
