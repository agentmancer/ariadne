#!/bin/bash
# Create a worktree with isolated ports for parallel development
# Usage: ./scripts/create-worktree.sh <branch-name> [base-branch]
#
# Ports are allocated based on hash of branch name to avoid conflicts:
# - API: 3100-3199
# - Web: 5200-5299
# - Mobile-web: 5300-5399

set -e

BRANCH_NAME=$1
BASE_BRANCH=${2:-main}

if [ -z "$BRANCH_NAME" ]; then
    echo "Usage: $0 <branch-name> [base-branch]"
    echo "Example: $0 issue-91-tests main"
    exit 1
fi

WORKTREE_DIR=".worktrees/$BRANCH_NAME"

# Check if worktree already exists
if [ -d "$WORKTREE_DIR" ]; then
    echo "Worktree already exists: $WORKTREE_DIR"
    exit 1
fi

# Generate port offset from branch name hash (0-99)
PORT_OFFSET=$(echo -n "$BRANCH_NAME" | md5sum | tr -d -c '0-9' | head -c 2)
PORT_OFFSET=$((10#$PORT_OFFSET % 100))

API_PORT=$((3100 + PORT_OFFSET))
WEB_PORT=$((5200 + PORT_OFFSET))
MOBILE_PORT=$((5300 + PORT_OFFSET))

echo "Creating worktree: $WORKTREE_DIR"
echo "  API port:        $API_PORT"
echo "  Web port:        $WEB_PORT"
echo "  Mobile-web port: $MOBILE_PORT"
echo ""

# Create worktree
git worktree add "$WORKTREE_DIR" -b "$BRANCH_NAME" "$BASE_BRANCH" 2>/dev/null || \
git worktree add "$WORKTREE_DIR" "$BRANCH_NAME"

# Create .env.local for API
cat > "$WORKTREE_DIR/packages/api/.env.local" << EOF
# Auto-generated for worktree: $BRANCH_NAME
PORT=$API_PORT
EOF

# Create .env.local for web with VITE port
cat > "$WORKTREE_DIR/packages/web/.env.local" << EOF
# Auto-generated for worktree: $BRANCH_NAME
VITE_PORT=$WEB_PORT
EOF

# Create .env.local for mobile-web with VITE port
cat > "$WORKTREE_DIR/packages/mobile-web/.env.local" << EOF
# Auto-generated for worktree: $BRANCH_NAME
VITE_PORT=$MOBILE_PORT
EOF

# Create a .worktree-info file for reference
cat > "$WORKTREE_DIR/.worktree-info" << EOF
branch=$BRANCH_NAME
api_port=$API_PORT
web_port=$WEB_PORT
mobile_port=$MOBILE_PORT
created=$(date -Iseconds)
EOF

echo ""
echo "✓ Worktree created: $WORKTREE_DIR"
echo ""
echo "To use:"
echo "  cd $WORKTREE_DIR"
echo "  pnpm install  # if needed"
echo "  pnpm dev      # starts on allocated ports"
echo ""
echo "To remove:"
echo "  git worktree remove $WORKTREE_DIR"
