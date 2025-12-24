#!/bin/bash
# Test Team Mode (Critique + Revise) implementation

API_URL="http://localhost:3001/api/v1"
STORY_SERVER="http://localhost:5000"

echo "=== Testing Team Mode (Critique + Revise) ==="
echo ""

# 1. Check story server is running
echo "1. Checking story server..."
if ! curl -s "$STORY_SERVER/" > /dev/null 2>&1; then
    echo "ERROR: Story server not running at $STORY_SERVER"
    exit 1
fi
echo "   Story server OK"

# 2. Register a test researcher
echo ""
echo "2. Registering test researcher..."
REGISTER_RESPONSE=$(curl -s -X POST "$API_URL/auth/register" \
    -H "Content-Type: application/json" \
    -d '{
        "email": "team-test@example.com",
        "password": "TestPass123!",
        "name": "Team Mode Tester",
        "institution": "Test University"
    }')

# Check if already exists, then login
if echo "$REGISTER_RESPONSE" | grep -qi "already"; then
    echo "   Researcher exists, logging in..."
    LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
        -H "Content-Type: application/json" \
        -d '{
            "email": "team-test@example.com",
            "password": "TestPass123!"
        }')
    TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.accessToken // .data.token // empty')
    if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
        echo "   Login failed, full response: $LOGIN_RESPONSE"
    fi
else
    TOKEN=$(echo "$REGISTER_RESPONSE" | jq -r '.data.accessToken // .data.token // empty')
fi

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    echo "   ERROR: Failed to get auth token"
    echo "   Response: $REGISTER_RESPONSE"
    echo "   Login Response: $LOGIN_RESPONSE"
    exit 1
fi
echo "   Got auth token"

# 3. Create a project
echo ""
echo "3. Creating project..."
PROJECT_RESPONSE=$(curl -s -X POST "$API_URL/projects" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{
        "name": "Team Mode Test Project",
        "description": "Testing Critique + Revise team mode"
    }')
PROJECT_ID=$(echo "$PROJECT_RESPONSE" | jq -r '.data.id // empty')

if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "null" ]; then
    # Try to get existing project
    echo "   Looking for existing project..."
    PROJECTS=$(curl -s "$API_URL/projects" -H "Authorization: Bearer $TOKEN")
    PROJECT_ID=$(echo "$PROJECTS" | jq -r '.data.projects[0].id // .data[0].id // empty')
fi

if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "null" ]; then
    echo "   ERROR: Failed to get project ID"
    exit 1
fi
echo "   Project ID: $PROJECT_ID"

# 4. Create a study
echo ""
echo "4. Creating study..."
STUDY_RESPONSE=$(curl -s -X POST "$API_URL/studies" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{
        \"projectId\": \"$PROJECT_ID\",
        \"name\": \"Team Mode Pilot Test\",
        \"description\": \"Testing Critique + Revise team collaboration\",
        \"status\": \"DRAFT\",
        \"type\": \"SINGLE_PARTICIPANT\"
    }")
STUDY_ID=$(echo "$STUDY_RESPONSE" | jq -r '.data.id // empty')

if [ -z "$STUDY_ID" ] || [ "$STUDY_ID" = "null" ]; then
    # Use existing study
    echo "   Looking for existing study..."
    STUDIES=$(curl -s "$API_URL/studies?projectId=$PROJECT_ID" -H "Authorization: Bearer $TOKEN")
    STUDY_ID=$(echo "$STUDIES" | jq -r '.data.studies[0].id // empty')
    if [ -z "$STUDY_ID" ] || [ "$STUDY_ID" = "null" ]; then
        STUDY_ID=$(echo "$STUDIES" | jq -r '.data[0].id // empty')
    fi
fi

if [ -z "$STUDY_ID" ] || [ "$STUDY_ID" = "null" ]; then
    echo "   ERROR: Failed to get study ID"
    echo "   Response: $STUDY_RESPONSE"
    exit 1
fi
echo "   Study ID: $STUDY_ID"

# 5. Create team mode batch execution
echo ""
echo "5. Creating team mode batch execution..."
echo "   Mode: Critique + Revise"
echo "   Proposer: llama3.2:3b"
echo "   Critic: llama3.2:3b"
echo "   Max Actions: 3"

BATCH_RESPONSE=$(curl -s -X POST "$API_URL/batch-executions" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{
        \"studyId\": \"$STUDY_ID\",
        \"name\": \"Team Mode Pilot - $(date +%H%M%S)\",
        \"description\": \"Testing Critique + Revise flow\",
        \"type\": \"SIMULATION\",
        \"actorCount\": 1,
        \"role\": \"PLAYER\",
        \"llmConfig\": {
            \"provider\": \"ollama\",
            \"model\": \"llama3.2:3b\",
            \"temperature\": 0.7
        },
        \"taskConfig\": {
            \"pluginType\": \"dynamic-story\",
            \"maxActions\": 3,
            \"timeoutMs\": 180000,
            \"teamMode\": true,
            \"criticLlmConfig\": {
                \"provider\": \"ollama\",
                \"model\": \"llama3.2:3b\",
                \"temperature\": 0.5
            }
        }
    }")

echo "$BATCH_RESPONSE" | jq '.'

BATCH_ID=$(echo "$BATCH_RESPONSE" | jq -r '.data.id // empty')

if [ -z "$BATCH_ID" ] || [ "$BATCH_ID" = "null" ]; then
    echo "ERROR: Failed to create batch"
    exit 1
fi

echo ""
echo "   Batch ID: $BATCH_ID"

# 6. Monitor batch progress
echo ""
echo "6. Monitoring batch progress..."
for i in {1..30}; do
    sleep 3
    STATUS_RESPONSE=$(curl -s "$API_URL/batch-executions/$BATCH_ID" \
        -H "Authorization: Bearer $TOKEN")

    STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.data.status')
    PROGRESS=$(echo "$STATUS_RESPONSE" | jq -r '.data.progress.percentage // 0')
    COMPLETED=$(echo "$STATUS_RESPONSE" | jq -r '.data.actorsCompleted // 0')

    echo "   [$i] Status: $STATUS, Progress: ${PROGRESS}%, Completed: $COMPLETED"

    if [ "$STATUS" = "COMPLETED" ] || [ "$STATUS" = "FAILED" ]; then
        break
    fi
done

echo ""
echo "=== Final Status ==="
echo "$STATUS_RESPONSE" | jq '.data | {status, actorsCreated, actorsCompleted, error}'

# 7. Check logs for team mode events
echo ""
echo "=== Checking API logs for TEAM_ACTION events ==="
grep -i "team\|proposer\|critic" /tmp/sherlock-api.log | tail -20 || echo "No team mode logs found"

echo ""
echo "Done!"
