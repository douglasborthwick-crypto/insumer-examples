#!/bin/bash
# InsumerAPI Quickstart — get a key and verify a wallet in two commands.
# Usage: INSUMER_EMAIL=you@example.com bash quickstart.sh

set -euo pipefail

API="https://us-central1-insumer-merchant.cloudfunctions.net/insumerApi"
KEY_URL="https://us-central1-insumer-merchant.cloudfunctions.net/createDeveloperApiKey"

EMAIL="${INSUMER_EMAIL:-you@example.com}"
APP_NAME="${INSUMER_APP_NAME:-quickstart-demo}"

# --- Step 1: Get a free API key ---
echo "Getting API key for ${EMAIL}..."

KEY_RESPONSE=$(curl -s -X POST "$KEY_URL" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"${EMAIL}\", \"appName\": \"${APP_NAME}\", \"tier\": \"free\"}")

API_KEY=$(echo "$KEY_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('key',''))" 2>/dev/null)

if [ -z "$API_KEY" ]; then
  echo "Key creation response: $KEY_RESPONSE"
  echo ""
  echo "If you already have a key, set it: INSUMER_API_KEY=insr_live_... bash quickstart.sh"
  API_KEY="${INSUMER_API_KEY:-}"
  if [ -z "$API_KEY" ]; then
    exit 1
  fi
else
  echo "Got key: ${API_KEY:0:20}..."
fi

# --- Step 2: Verify a wallet holds SHIB on Ethereum ---
echo ""
echo "Verifying wallet holds SHIB on Ethereum..."

ATTEST_RESPONSE=$(curl -s -X POST "$API/v1/attest" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "wallet": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    "conditions": [
      {
        "type": "token_balance",
        "contractAddress": "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE",
        "chainId": 1,
        "threshold": 1000000,
        "label": "SHIB holder"
      }
    ]
  }')

echo "$ATTEST_RESPONSE" | python3 -m json.tool

# --- Step 3: Check credit balance ---
echo ""
echo "Checking remaining credits..."

CREDITS_RESPONSE=$(curl -s "$API/v1/credits" \
  -H "X-API-Key: $API_KEY")

echo "$CREDITS_RESPONSE" | python3 -m json.tool

# --- Step 4: Verify XRPL wallet holds XRP ---
echo ""
echo "Verifying XRPL wallet holds XRP..."

XRPL_RESPONSE=$(curl -s -X POST "$API/v1/attest" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "xrplWallet": "rG1QQv2nh2gr7RCZ1P8YYcBUKCCN633jCn",
    "conditions": [
      {
        "type": "token_balance",
        "contractAddress": "native",
        "chainId": "xrpl",
        "threshold": 100,
        "label": "XRP >= 100"
      }
    ]
  }')

echo "$XRPL_RESPONSE" | python3 -m json.tool
