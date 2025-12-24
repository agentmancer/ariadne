#!/bin/bash
#
# Install MCP servers for Claude Code
#
# This script configures Claude Code to connect to:
# 1. story-game - Interactive story MCP server (Python)
# 2. sherlock-platform - Sherlock research platform MCP server (Node/TypeScript)
#
# Usage:
#   ./scripts/install-mcp.sh [--scope user|project]
#
# Environment Variables:
#   STORY_ROOT - Path to the story project (default: $HOME/story)
#
# Scopes:
#   user    - Install to ~/.claude/.mcp.json (available in all projects)
#   project - Install to .claude/.mcp.json (shared via git with team)
#   local   - Install to .claude/settings.local.json (personal, not tracked)
#
# Default: user scope

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHERLOCK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STORY_ROOT="${STORY_ROOT:-$HOME/story}"

# Parse arguments
SCOPE="${1:-user}"
SCOPE="${SCOPE#--scope=}"
SCOPE="${SCOPE#--scope }"

echo "Installing MCP servers for Claude Code..."
echo "  Scope: $SCOPE"
echo "  Sherlock root: $SHERLOCK_ROOT"
echo "  Story root: $STORY_ROOT"

# Validate story server exists
if [ ! -f "$STORY_ROOT/main/src/servers/story_mcp_server.py" ]; then
    echo "Warning: story-game server not found at $STORY_ROOT/main/src/servers/story_mcp_server.py"
    echo "  The story-game MCP server will not work until the story project is set up."
fi

# Validate Python venv exists
if [ ! -f "$STORY_ROOT/main/venv/bin/python" ]; then
    echo "Warning: Python venv not found at $STORY_ROOT/main/venv"
    echo "  Run 'cd $STORY_ROOT/main && python -m venv venv && pip install -r requirements.txt'"
fi

# Function to add MCP server using claude CLI
add_server() {
    local name="$1"
    local scope="$2"
    shift 2

    echo "Adding $name server (scope: $scope)..."

    # Remove existing server first (ignore errors if doesn't exist)
    claude mcp remove "$name" -s "$scope" 2>/dev/null || true

    # Add the server
    claude mcp add "$name" -s "$scope" -- "$@"
}

case "$SCOPE" in
    user)
        # Story game server (Python)
        add_server "story-game" "user" \
            "$STORY_ROOT/main/venv/bin/python" \
            "$STORY_ROOT/main/src/servers/story_mcp_server.py"

        # Sherlock platform server (TypeScript via tsx)
        add_server "sherlock-platform" "user" \
            "tsx" \
            "$SHERLOCK_ROOT/packages/api/src/mcp-server.ts"
        ;;

    project)
        # Create .claude directory if needed
        mkdir -p "$SHERLOCK_ROOT/.claude"

        # Write project-level .mcp.json using jq for proper JSON escaping
        if command -v jq &> /dev/null; then
            jq -n \
                --arg story_python "$STORY_ROOT/main/venv/bin/python" \
                --arg story_server "$STORY_ROOT/main/src/servers/story_mcp_server.py" \
                --arg story_pythonpath "$STORY_ROOT/main" \
                --arg sherlock_server "$SHERLOCK_ROOT/packages/api/src/mcp-server.ts" \
                '{
                    mcpServers: {
                        "story-game": {
                            command: $story_python,
                            args: [$story_server],
                            env: { PYTHONPATH: $story_pythonpath }
                        },
                        "sherlock-platform": {
                            command: "tsx",
                            args: [$sherlock_server],
                            env: {}
                        }
                    }
                }' > "$SHERLOCK_ROOT/.claude/.mcp.json"
        else
            echo "Warning: jq not found, using heredoc (paths with special chars may break JSON)"
            cat > "$SHERLOCK_ROOT/.claude/.mcp.json" << EOF
{
  "mcpServers": {
    "story-game": {
      "command": "$STORY_ROOT/main/venv/bin/python",
      "args": ["$STORY_ROOT/main/src/servers/story_mcp_server.py"],
      "env": {
        "PYTHONPATH": "$STORY_ROOT/main"
      }
    },
    "sherlock-platform": {
      "command": "tsx",
      "args": ["$SHERLOCK_ROOT/packages/api/src/mcp-server.ts"],
      "env": {}
    }
  }
}
EOF
        fi
        echo "Created $SHERLOCK_ROOT/.claude/.mcp.json"
        echo "Note: This file should be added to .gitignore if paths are machine-specific"
        ;;

    local)
        # Create .claude directory if needed
        mkdir -p "$SHERLOCK_ROOT/.claude"

        # Write local settings using jq for proper JSON escaping (not tracked in git)
        if command -v jq &> /dev/null; then
            jq -n \
                --arg story_python "$STORY_ROOT/main/venv/bin/python" \
                --arg story_server "$STORY_ROOT/main/src/servers/story_mcp_server.py" \
                --arg story_pythonpath "$STORY_ROOT/main" \
                --arg sherlock_server "$SHERLOCK_ROOT/packages/api/src/mcp-server.ts" \
                '{
                    mcpServers: {
                        "story-game": {
                            command: $story_python,
                            args: [$story_server],
                            env: { PYTHONPATH: $story_pythonpath }
                        },
                        "sherlock-platform": {
                            command: "tsx",
                            args: [$sherlock_server],
                            env: {}
                        }
                    }
                }' > "$SHERLOCK_ROOT/.claude/settings.local.json"
        else
            echo "Warning: jq not found, using heredoc (paths with special chars may break JSON)"
            cat > "$SHERLOCK_ROOT/.claude/settings.local.json" << EOF
{
  "mcpServers": {
    "story-game": {
      "command": "$STORY_ROOT/main/venv/bin/python",
      "args": ["$STORY_ROOT/main/src/servers/story_mcp_server.py"],
      "env": {
        "PYTHONPATH": "$STORY_ROOT/main"
      }
    },
    "sherlock-platform": {
      "command": "tsx",
      "args": ["$SHERLOCK_ROOT/packages/api/src/mcp-server.ts"],
      "env": {}
    }
  }
}
EOF
        fi
        echo "Created $SHERLOCK_ROOT/.claude/settings.local.json"
        ;;

    *)
        echo "Error: Unknown scope '$SCOPE'"
        echo "Valid scopes: user, project, local"
        exit 1
        ;;
esac

echo ""
echo "MCP server installation complete!"
echo ""
echo "Verify with: claude mcp list"
echo "Or in Claude Code: /mcp"
echo ""
echo "To manually add the story-game server:"
echo "  claude mcp add story-game -s user -- $STORY_ROOT/main/venv/bin/python $STORY_ROOT/main/src/servers/story_mcp_server.py"
