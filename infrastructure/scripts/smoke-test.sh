#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-https://vibe-drive.store}"
LOGIN_USER="${SMOKE_USER:-driver123}"
LOGIN_PASS="${SMOKE_PASS:-driver123}"

PASS=0
FAIL=0

ok() { echo "[PASS] $1"; PASS=$((PASS + 1)); }
fail() { echo "[FAIL] $1"; FAIL=$((FAIL + 1)); }

check_http() {
    local label="$1"
    local expected_code="$2"
    local url="$3"
    shift 3
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" "$@" "$url")
    if [ "$code" = "$expected_code" ]; then
        ok "$label (HTTP $code)"
    else
        fail "$label (expected $expected_code, got $code)"
    fi
}

echo ""
echo "Smoke-testing $BASE_URL"
echo "========================================"

# 1. Ping (Laravel health)
check_http "GET /api/ping" "200" "$BASE_URL/api/ping"

# 2. DB check (Laravel)
check_http "GET /api/db-check" "200" "$BASE_URL/api/db-check"

# 3. Login returns 200 with a token
LOGIN_RESP=$(curl -s -w "\n%{http_code}" \
    -X POST "$BASE_URL/api/login" \
    -H "Content-Type: application/json" \
    -d "{\"login\":\"$LOGIN_USER\",\"password\":\"$LOGIN_PASS\"}")
LOGIN_BODY=$(echo "$LOGIN_RESP" | sed '$d')
LOGIN_CODE=$(echo "$LOGIN_RESP" | tail -n1)

if [ "$LOGIN_CODE" = "200" ]; then
    ok "POST /api/login (HTTP 200)"
else
    fail "POST /api/login (expected 200, got $LOGIN_CODE)"
fi

# Extract token if present
TOKEN=$(echo "$LOGIN_BODY" | grep -o '"token":"[^"]*"' | cut -d'"' -f4 || true)

if [ -n "$TOKEN" ]; then
    ok "Login returned auth token"
else
    fail "Login did not return an auth token"
fi

# 4. Authenticated /api/user
if [ -n "$TOKEN" ]; then
    check_http "GET /api/user (authed)" "200" "$BASE_URL/api/user" \
        -H "Authorization: Bearer $TOKEN"
fi

# 5. SignalR negotiate
NEGOTIATE_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$BASE_URL/driverhub/negotiate?negotiateVersion=1")
if [ "$NEGOTIATE_CODE" = "200" ] || [ "$NEGOTIATE_CODE" = "400" ]; then
    ok "/driverhub/negotiate reachable (HTTP $NEGOTIATE_CODE)"
else
    fail "/driverhub/negotiate unreachable (HTTP $NEGOTIATE_CODE)"
fi

# 6. HTTPS redirect — plain HTTP should redirect to HTTPS
HTTP_BASE="http://$(echo "$BASE_URL" | sed 's|https://||')"
REDIRECT_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-redirs 0 "$HTTP_BASE/api/ping" || true)
if [ "$REDIRECT_CODE" = "301" ] || [ "$REDIRECT_CODE" = "302" ]; then
    ok "HTTP -> HTTPS redirect ($REDIRECT_CODE)"
else
    fail "HTTP -> HTTPS redirect not found (got $REDIRECT_CODE)"
fi

echo "========================================"
echo "Results: $PASS passed, $FAIL failed"
echo ""

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
