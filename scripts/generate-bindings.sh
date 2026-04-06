#!/bin/bash
set -e

echo "=== Generating TypeScript Bindings ==="

if [ -z "$EVIDENCE_REGISTRY_ID" ] || [ -z "$TRUST_LEDGER_ID" ]; then
  echo "ERROR: Set contract ID env vars first. See deploy-contracts.sh output."
  exit 1
fi

cd "$(dirname "$0")/.."

# Generate bindings for each deployed contract
for contract in evidence-registry trust-ledger; do
  VAR_NAME=$(echo "$contract" | tr '-' '_' | tr '[:lower:]' '[:upper:]')_ID
  CONTRACT_ID=${!VAR_NAME}

  if [ -z "$CONTRACT_ID" ]; then
    echo "Skipping $contract — ID not set"
    continue
  fi

  echo "Generating bindings for $contract ($CONTRACT_ID)..."
  stellar contract bindings typescript \
    --network testnet \
    --id "$CONTRACT_ID" \
    --output-dir "bindings/$contract" \
    --overwrite
done

# Dispute Resolution (optional — only if deployed)
if [ -n "$DISPUTE_RESOLUTION_ID" ]; then
  echo "Generating bindings for dispute-resolution ($DISPUTE_RESOLUTION_ID)..."
  stellar contract bindings typescript \
    --network testnet \
    --id "$DISPUTE_RESOLUTION_ID" \
    --output-dir "bindings/dispute-resolution" \
    --overwrite
fi

echo ""
echo "Bindings generated in bindings/ directory."
echo "Note: Bindings are optional — backend uses direct Soroban invocation via soroban-client.ts"
