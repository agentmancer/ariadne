#!/bin/bash
# FDG Study Pilot - 10 playthroughs per condition (240 total)
# 2 (Team/Individual) × 4 (Models) × 3 (Templates) = 24 conditions

API_URL="http://localhost:3001/api/v1"

# Models to test
MODELS=("llama3.2:3b" "qwen2.5vl:7b" "gemma3:27b" "deepcoder:14b")

# Story templates
TEMPLATES=("jade_dragon_mystery" "romance_fantasy" "action_thriller")

# Collaboration modes
COLLAB_MODES=("individual" "team")

# Playthroughs per condition
ACTORS_PER_CONDITION=10

echo "=============================================="
echo "FDG STUDY PILOT"
echo "=============================================="
echo "Conditions: 2 × 4 × 3 = 24"
echo "Per condition: $ACTORS_PER_CONDITION playthroughs"
echo "Total: $((24 * ACTORS_PER_CONDITION)) playthroughs"
echo "=============================================="
echo ""

# 1. Authenticate
echo "1. Authenticating..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d '{
        "email": "team-test@example.com",
        "password": "TestPass123!"
    }')
TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.accessToken // .data.token // empty')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    echo "   Registering new researcher..."
    REG_RESPONSE=$(curl -s -X POST "$API_URL/auth/register" \
        -H "Content-Type: application/json" \
        -d '{
            "email": "team-test@example.com",
            "password": "TestPass123!",
            "name": "FDG Researcher",
            "institution": "Research University"
        }')
    TOKEN=$(echo "$REG_RESPONSE" | jq -r '.data.accessToken // .data.token // empty')
fi

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    echo "ERROR: Failed to authenticate"
    exit 1
fi
echo "   Authenticated ✓"

# 2. Create Project
echo ""
echo "2. Creating project..."
PROJECT_RESPONSE=$(curl -s -X POST "$API_URL/projects" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{
        "name": "FDG 2026 Pilot",
        "description": "Pilot study for Team vs Individual AI collaboration paper"
    }')
PROJECT_ID=$(echo "$PROJECT_RESPONSE" | jq -r '.data.id // empty')

if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "null" ]; then
    # Get existing project
    PROJECTS=$(curl -s "$API_URL/projects" -H "Authorization: Bearer $TOKEN")
    PROJECT_ID=$(echo "$PROJECTS" | jq -r '.data.projects[] | select(.name | contains("FDG")) | .id' | head -1)
    if [ -z "$PROJECT_ID" ]; then
        PROJECT_ID=$(echo "$PROJECTS" | jq -r '.data.projects[0].id // empty')
    fi
fi
echo "   Project ID: $PROJECT_ID"

# 3. Create Study
echo ""
echo "3. Creating study..."
STUDY_RESPONSE=$(curl -s -X POST "$API_URL/studies" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{
        \"projectId\": \"$PROJECT_ID\",
        \"name\": \"FDG Pilot - $(date +%Y%m%d-%H%M)\",
        \"description\": \"2×4×3 factorial: Team/Individual × 4 Models × 3 Templates\",
        \"status\": \"DRAFT\",
        \"type\": \"SINGLE_PARTICIPANT\"
    }")
STUDY_ID=$(echo "$STUDY_RESPONSE" | jq -r '.data.id // empty')

if [ -z "$STUDY_ID" ] || [ "$STUDY_ID" = "null" ]; then
    echo "ERROR: Failed to create study"
    echo "$STUDY_RESPONSE"
    exit 1
fi
echo "   Study ID: $STUDY_ID"

# 4. Create conditions and queue batches
echo ""
echo "4. Creating conditions and queuing batches..."
echo ""

BATCH_IDS=()
CONDITION_COUNT=0

for collab in "${COLLAB_MODES[@]}"; do
    for model in "${MODELS[@]}"; do
        for template in "${TEMPLATES[@]}"; do
            CONDITION_COUNT=$((CONDITION_COUNT + 1))
            CONDITION_NAME="${collab}_${model}_${template}"

            # Shorter display name
            SHORT_NAME=$(echo "$CONDITION_NAME" | sed 's/jade_dragon_mystery/jade/g; s/romance_fantasy/romance/g; s/action_thriller/action/g')

            echo "   [$CONDITION_COUNT/24] $SHORT_NAME"

            # Determine team mode
            if [ "$collab" = "team" ]; then
                TEAM_MODE="true"
            else
                TEAM_MODE="false"
            fi

            # Create batch execution
            BATCH_RESPONSE=$(curl -s -X POST "$API_URL/batch-executions" \
                -H "Content-Type: application/json" \
                -H "Authorization: Bearer $TOKEN" \
                -d "{
                    \"studyId\": \"$STUDY_ID\",
                    \"name\": \"$SHORT_NAME\",
                    \"description\": \"Collab: $collab, Model: $model, Template: $template\",
                    \"type\": \"SIMULATION\",
                    \"actorCount\": $ACTORS_PER_CONDITION,
                    \"role\": \"PLAYER\",
                    \"llmConfig\": {
                        \"provider\": \"ollama\",
                        \"model\": \"$model\",
                        \"temperature\": 0.7
                    },
                    \"taskConfig\": {
                        \"pluginType\": \"dynamic-story\",
                        \"storyTemplate\": \"$template\",
                        \"maxActions\": 15,
                        \"timeoutMs\": 300000,
                        \"teamMode\": $TEAM_MODE,
                        \"criticLlmConfig\": {
                            \"provider\": \"ollama\",
                            \"model\": \"$model\",
                            \"temperature\": 0.5
                        }
                    }
                }")

            BATCH_ID=$(echo "$BATCH_RESPONSE" | jq -r '.data.id // empty')

            if [ -n "$BATCH_ID" ] && [ "$BATCH_ID" != "null" ]; then
                BATCH_IDS+=("$BATCH_ID")
                echo "            Batch: $BATCH_ID"
            else
                echo "            ERROR: $(echo "$BATCH_RESPONSE" | jq -r '.error.message // "Unknown error"')"
            fi

            # Small delay to avoid overwhelming the queue
            sleep 0.5
        done
    done
done

echo ""
echo "=============================================="
echo "PILOT QUEUED"
echo "=============================================="
echo "Study ID: $STUDY_ID"
echo "Batches created: ${#BATCH_IDS[@]}"
echo "Total playthroughs: $((${#BATCH_IDS[@]} * ACTORS_PER_CONDITION))"
echo "=============================================="
echo ""

# 5. Save batch IDs for monitoring
echo "${BATCH_IDS[@]}" > /tmp/fdg-pilot-batches.txt
echo "Batch IDs saved to /tmp/fdg-pilot-batches.txt"

# 6. Monitor progress
echo ""
echo "5. Monitoring progress (Ctrl+C to stop monitoring)..."
echo ""

while true; do
    COMPLETED=0
    RUNNING=0
    FAILED=0
    TOTAL_ACTORS=0
    COMPLETED_ACTORS=0

    for batch_id in "${BATCH_IDS[@]}"; do
        STATUS_RESPONSE=$(curl -s "$API_URL/batch-executions/$batch_id" \
            -H "Authorization: Bearer $TOKEN" 2>/dev/null)

        STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.data.status // "UNKNOWN"')
        ACTORS_CREATED=$(echo "$STATUS_RESPONSE" | jq -r '.data.actorsCreated // 0')
        ACTORS_DONE=$(echo "$STATUS_RESPONSE" | jq -r '.data.actorsCompleted // 0')

        TOTAL_ACTORS=$((TOTAL_ACTORS + ACTORS_CREATED))
        COMPLETED_ACTORS=$((COMPLETED_ACTORS + ACTORS_DONE))

        case "$STATUS" in
            "COMPLETE") COMPLETED=$((COMPLETED + 1)) ;;
            "RUNNING"|"QUEUED") RUNNING=$((RUNNING + 1)) ;;
            "FAILED") FAILED=$((FAILED + 1)) ;;
        esac
    done

    PERCENT=0
    if [ $TOTAL_ACTORS -gt 0 ]; then
        PERCENT=$((COMPLETED_ACTORS * 100 / TOTAL_ACTORS))
    fi

    printf "\r   Progress: %d/%d batches complete | %d/%d actors (%d%%) | Running: %d | Failed: %d    " \
        "$COMPLETED" "${#BATCH_IDS[@]}" "$COMPLETED_ACTORS" "$TOTAL_ACTORS" "$PERCENT" "$RUNNING" "$FAILED"

    if [ $COMPLETED -eq ${#BATCH_IDS[@]} ] || [ $((COMPLETED + FAILED)) -eq ${#BATCH_IDS[@]} ]; then
        echo ""
        echo ""
        echo "=============================================="
        echo "PILOT COMPLETE"
        echo "=============================================="
        echo "Completed batches: $COMPLETED"
        echo "Failed batches: $FAILED"
        echo "Total actors completed: $COMPLETED_ACTORS"
        echo "=============================================="
        break
    fi

    sleep 10
done

echo ""
echo "To analyze results, query the events table for study: $STUDY_ID"
