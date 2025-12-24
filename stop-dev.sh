#!/bin/bash

# Sherlock Platform - Stop Development Servers

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"
PID_FILE="$LOG_DIR/dev.pid"

echo "Stopping Sherlock dev servers..."

# Kill by PID file if exists
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if ps -p $PID > /dev/null 2>&1; then
        kill $PID 2>/dev/null
        echo "Sent SIGTERM to main process (PID: $PID)"
    fi
    rm -f "$PID_FILE"
fi

# Kill any remaining pnpm dev processes
pkill -f "pnpm.*dev" 2>/dev/null || true
pkill -f "tsx watch" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
pkill -f "electron" 2>/dev/null || true

sleep 1

# Verify
if pgrep -f "pnpm.*dev" > /dev/null; then
    echo "Warning: Some processes may still be running. Force killing..."
    pkill -9 -f "pnpm.*dev" 2>/dev/null || true
fi

echo "Dev servers stopped."
