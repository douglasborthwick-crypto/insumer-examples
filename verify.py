"""
InsumerAPI — Python example

Demonstrates:
1. Getting a free API key
2. Verifying token holdings (POST /v1/attest)
3. Checking NFT ownership
4. Multi-condition verification across chains
5. Listing merchants and checking discounts
6. XRPL native XRP verification
7. XRPL trust line token (RLUSD) verification

Usage:
    pip install httpx
    INSUMER_API_KEY=insr_live_... python verify.py

Or get a new key automatically:
    INSUMER_EMAIL=you@example.com python verify.py
"""

import os
import sys
import json
import httpx

API = "https://us-central1-insumer-merchant.cloudfunctions.net/insumerApi"
KEY_URL = "https://us-central1-insumer-merchant.cloudfunctions.net/createDeveloperApiKey"

# Vitalik's public wallet (for demo purposes)
DEMO_WALLET = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"

# SHIB on Ethereum
SHIB_CONTRACT = "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE"

# BAYC on Ethereum
BAYC_CONTRACT = "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D"


def get_api_key() -> str:
    """Get API key from env or create a new free one."""
    key = os.environ.get("INSUMER_API_KEY")
    if key:
        return key

    email = os.environ.get("INSUMER_EMAIL")
    if not email:
        print("Set INSUMER_API_KEY or INSUMER_EMAIL environment variable")
        sys.exit(1)

    print(f"Creating free API key for {email}...")
    resp = httpx.post(KEY_URL, json={
        "email": email,
        "appName": "python-example",
        "tier": "free",
    })
    data = resp.json()

    if not data.get("success"):
        print(f"Failed to create key: {data}")
        sys.exit(1)

    key = data["key"]
    print(f"Got key: {key[:20]}...")
    print(f"Credits: {data.get('apiKeyCredits', 'N/A')}")
    print(f"Daily limit: {data.get('dailyLimit', 'N/A')}")
    print()
    return key


def verify_token(client: httpx.Client, wallet: str, contract: str,
                 chain_id: int, threshold: int, label: str) -> dict:
    """Verify a single token balance condition."""
    resp = client.post(f"{API}/v1/attest", json={
        "wallet": wallet,
        "conditions": [{
            "type": "token_balance",
            "contractAddress": contract,
            "chainId": chain_id,
            "threshold": threshold,
            "label": label,
        }],
    })
    return resp.json()


def verify_nft(client: httpx.Client, wallet: str, contract: str,
               chain_id: int, label: str) -> dict:
    """Verify NFT ownership."""
    resp = client.post(f"{API}/v1/attest", json={
        "wallet": wallet,
        "conditions": [{
            "type": "nft_ownership",
            "contractAddress": contract,
            "chainId": chain_id,
            "label": label,
        }],
    })
    return resp.json()


def multi_verify(client: httpx.Client, wallet: str,
                 conditions: list) -> dict:
    """Verify multiple conditions in a single call (up to 10)."""
    resp = client.post(f"{API}/v1/attest", json={
        "wallet": wallet,
        "conditions": conditions,
    })
    return resp.json()


def check_discount(client: httpx.Client, wallet: str,
                   merchant: str) -> dict:
    """Check what discount a wallet qualifies for at a merchant."""
    resp = client.get(f"{API}/v1/discount/check", params={
        "wallet": wallet,
        "merchant": merchant,
    })
    return resp.json()


def list_merchants(client: httpx.Client) -> dict:
    """List available merchants."""
    resp = client.get(f"{API}/v1/merchants")
    return resp.json()


def check_credits(client: httpx.Client) -> dict:
    """Check remaining verification credits."""
    resp = client.get(f"{API}/v1/credits")
    return resp.json()


def main():
    api_key = get_api_key()
    client = httpx.Client(headers={
        "Content-Type": "application/json",
        "X-API-Key": api_key,
    })

    # --- 1. Verify SHIB holdings on Ethereum ---
    print("=" * 60)
    print("1. Verify SHIB holdings on Ethereum")
    print("=" * 60)
    result = verify_token(
        client, DEMO_WALLET, SHIB_CONTRACT,
        chain_id=1, threshold=1_000_000, label="SHIB holder"
    )
    print(json.dumps(result, indent=2))
    print()

    # --- 2. Verify BAYC NFT ownership ---
    print("=" * 60)
    print("2. Verify BAYC NFT ownership")
    print("=" * 60)
    result = verify_nft(
        client, DEMO_WALLET, BAYC_CONTRACT,
        chain_id=1, label="BAYC owner"
    )
    print(json.dumps(result, indent=2))
    print()

    # --- 3. Multi-condition verification ---
    print("=" * 60)
    print("3. Multi-condition: SHIB + BAYC in one call")
    print("=" * 60)
    result = multi_verify(client, DEMO_WALLET, [
        {
            "type": "token_balance",
            "contractAddress": SHIB_CONTRACT,
            "chainId": 1,
            "threshold": 1_000_000,
            "label": "SHIB holder",
        },
        {
            "type": "nft_ownership",
            "contractAddress": BAYC_CONTRACT,
            "chainId": 1,
            "label": "BAYC owner",
        },
    ])
    print(json.dumps(result, indent=2))

    if result.get("ok"):
        attestation = result["data"]["attestation"]
        print(f"\nOverall pass: {attestation['pass']}")
        for r in attestation["results"]:
            print(f"  {r['label']}: {'PASS' if r['met'] else 'FAIL'}")
        print(f"Signature: {result['data']['sig'][:40]}...")
    print()

    # --- 4. List merchants ---
    print("=" * 60)
    print("4. List merchants")
    print("=" * 60)
    result = list_merchants(client)
    if result.get("ok"):
        merchants = result["data"] if isinstance(result["data"], list) else []
        print(f"Found {len(merchants)} merchant(s)")
        for m in merchants[:5]:
            print(f"  {m.get('id', 'N/A')}: {m.get('companyName', 'N/A')}")
    else:
        print(json.dumps(result, indent=2))
    print()

    # --- 5. Check credits ---
    print("=" * 60)
    print("5. Check remaining credits")
    print("=" * 60)
    result = check_credits(client)
    print(json.dumps(result, indent=2))
    print()

    # --- 6. XRPL — native XRP balance ---
    print("=" * 60)
    print("6. XRPL — Verify native XRP balance")
    print("=" * 60)
    resp = client.post(f"{API}/v1/attest", json={
        "xrplWallet": "rG1QQv2nh2gr7RCZ1P8YYcBUKCCN633jCn",
        "conditions": [{
            "type": "token_balance",
            "contractAddress": "native",
            "chainId": "xrpl",
            "threshold": 100,
            "label": "XRP >= 100",
        }],
    })
    print(json.dumps(resp.json(), indent=2))
    print()

    # --- 7. XRPL — RLUSD trust line token ---
    print("=" * 60)
    print("7. XRPL — Verify RLUSD trust line balance")
    print("=" * 60)
    resp = client.post(f"{API}/v1/attest", json={
        "xrplWallet": "rG1QQv2nh2gr7RCZ1P8YYcBUKCCN633jCn",
        "conditions": [{
            "type": "token_balance",
            "contractAddress": "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De",
            "chainId": "xrpl",
            "currency": "RLUSD",
            "threshold": 10,
            "label": "RLUSD >= 10 on XRPL",
        }],
    })
    print(json.dumps(resp.json(), indent=2))

    client.close()


if __name__ == "__main__":
    main()
