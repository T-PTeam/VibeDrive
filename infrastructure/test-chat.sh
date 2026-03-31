#!/usr/bin/env bash
set -e
BASE="${1:-http://localhost:8080}"

echo "=== 1. Login ==="
LOGIN_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/login" \
  -H "Content-Type: application/json" \
  -d '{"login":"test@driver.com","password":"password"}')
HTTP_BODY=$(echo "$LOGIN_RESP" | sed '$d')
HTTP_CODE=$(echo "$LOGIN_RESP" | tail -n 1)
echo "HTTP $HTTP_CODE"
echo "$HTTP_BODY" | jq . 2>/dev/null || echo "$HTTP_BODY"

TOKEN=$(echo "$HTTP_BODY" | jq -r '.data.token // empty')
if [ -z "$TOKEN" ]; then
  echo "No token. Check login response above."
  exit 1
fi
echo "Token: ${TOKEN:0:20}..."

echo ""
echo "=== 2. Chat (first message) ==="
CHAT1=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/chat" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"Hi, who are you?"}')
BODY1=$(echo "$CHAT1" | sed '$d')
CODE1=$(echo "$CHAT1" | tail -n 1)
echo "HTTP $CODE1"
echo "$BODY1" | jq . 2>/dev/null || echo "$BODY1"

SESSION_ID=$(echo "$BODY1" | jq -r '.data.session_id // empty')
if [ -z "$SESSION_ID" ]; then
  STATUS1=$(echo "$BODY1" | jq -r '.status // empty')
  if [ "$STATUS1" = "error" ]; then
    echo "Chat returned an error (e.g. OpenAI rate limit). Step 3 skipped."
    echo "When OpenAI responds OK, you'll get session_id and the memory step will run."
    exit 0
  fi
  echo "No session_id. Check response above."
  exit 1
fi
echo "Session ID: $SESSION_ID"

echo ""
echo "=== 3. Chat (memory: same session) ==="
CHAT2=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/chat" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"What did I just ask you?\",\"session_id\":$SESSION_ID}")
BODY2=$(echo "$CHAT2" | sed '$d')
CODE2=$(echo "$CHAT2" | tail -n 1)
echo "HTTP $CODE2"
echo "$BODY2" | jq . 2>/dev/null || echo "$BODY2"

echo ""
echo "Done. First reply and second (memory) reply above."
