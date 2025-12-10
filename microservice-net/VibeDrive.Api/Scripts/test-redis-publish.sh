#!/bin/bash

USER_ID=${1:-driver123}
MESSAGE=${2:-"Test message from script"}
REDIS_HOST=${3:-localhost}
REDIS_PORT=${4:-6379}

echo "Publishing message to Redis..."
echo "User ID: $USER_ID"
echo "Message: $MESSAGE"

MESSAGE_JSON=$(cat <<EOF
{
  "userId": "$USER_ID",
  "type": "test",
  "data": "$MESSAGE",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
)

echo "$MESSAGE_JSON" | redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" PUBLISH driver_updates

echo "Message published!"
echo "JSON: $MESSAGE_JSON"

