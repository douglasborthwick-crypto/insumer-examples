#!/bin/bash
# InsumerAPI Quickstart — generates a key and verifies a wallet.
# Just run: bash quickstart.sh

set -euo pipefail

API="https://api.insumermodel.com"

# --- Step 1: Get a free API key ---
if [ -n "${INSUMER_API_KEY:-}" ]; then
  API_KEY="$INSUMER_API_KEY"
  echo "Using existing key: ${API_KEY:0:20}..."
else
  echo ""
  read -p "Email (for your free API key): " EMAIL
  if [ -z "$EMAIL" ]; then
    echo "Email required. Or set INSUMER_API_KEY= to skip."
    exit 1
  fi

  APP_NAME="${INSUMER_APP_NAME:-quickstart-demo}"
  echo "Creating key for ${EMAIL}..."

  KEY_RESPONSE=$(curl -s -X POST "$API/v1/keys/create" \
    -H "Content-Type: application/json" \
    -d "{\"email\": \"${EMAIL}\", \"appName\": \"${APP_NAME}\", \"tier\": \"free\"}")

  API_KEY=$(echo "$KEY_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('key',''))" 2>/dev/null)

  if [ -z "$API_KEY" ]; then
    echo "Error: $KEY_RESPONSE"
    exit 1
  fi

  echo ""
  echo "Your API key: $API_KEY"
  echo "Save this — you won't see it again."
  echo ""
fi

# --- Step 2: Verify Vitalik's wallet holds USDC on Ethereum ---
echo "Verifying wallet holds USDC on Ethereum..."
echo ""

curl -s -X POST "$API/v1/attest" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "wallet": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    "conditions": [
      {
        "type": "token_balance",
        "contractAddress": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "chainId": 1,
        "threshold": 100,
        "decimals": 6,
        "label": "USDC >= 100 on Ethereum"
      }
    ]
  }' | python3 -m json.tool

# --- Step 3: Check remaining credits ---
echo ""
echo "Credits remaining:"
curl -s "$API/v1/credits" \
  -H "X-API-Key: $API_KEY" | python3 -m json.tool
