#!/bin/bash
set -e

echo "=== Verdikt Contract Deployment ==="
echo "Network: Stellar Testnet"
echo ""

# Ensure we're in the contracts directory
cd "$(dirname "$0")/../contracts"

# Source account (escrow = arbiter)
SOURCE=${ESCROW_PUBLIC:-$(stellar keys address escrow 2>/dev/null)}
if [ -z "$SOURCE" ]; then
  echo "ERROR: Set ESCROW_PUBLIC env var or run: stellar keys generate escrow --network testnet"
  exit 1
fi

echo "Deployer/Arbiter: $SOURCE"
echo ""

# 1. Build all contracts
echo "--- Building contracts ---"
stellar contract build
echo "Build complete."
echo ""

# 2. Deploy Trust Ledger FIRST (Dispute Resolution depends on it)
echo "--- Deploying Trust Ledger ---"
TRUST_LEDGER_ID=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/verdikt_trust_ledger.wasm \
  --source-account escrow \
  --network testnet)
echo "Trust Ledger deployed: $TRUST_LEDGER_ID"

# Initialize Trust Ledger
stellar contract invoke \
  --id "$TRUST_LEDGER_ID" \
  --source-account escrow \
  --network testnet \
  -- init --admin "$SOURCE"
echo "Trust Ledger initialized."
echo ""

# 3. Deploy Evidence Registry
echo "--- Deploying Evidence Registry ---"
EVIDENCE_REGISTRY_ID=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/verdikt_evidence_registry.wasm \
  --source-account escrow \
  --network testnet)
echo "Evidence Registry deployed: $EVIDENCE_REGISTRY_ID"

# Initialize Evidence Registry
stellar contract invoke \
  --id "$EVIDENCE_REGISTRY_ID" \
  --source-account escrow \
  --network testnet \
  -- init --admin "$SOURCE"
echo "Evidence Registry initialized."
echo ""

# 4. Deploy Dispute Resolution (references Trust Ledger)
echo "--- Deploying Dispute Resolution ---"
DISPUTE_RESOLUTION_ID=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/verdikt_dispute_resolution.wasm \
  --source-account escrow \
  --network testnet)
echo "Dispute Resolution deployed: $DISPUTE_RESOLUTION_ID"

# Initialize with Trust Ledger reference
stellar contract invoke \
  --id "$DISPUTE_RESOLUTION_ID" \
  --source-account escrow \
  --network testnet \
  -- init --admin "$SOURCE" --trust_ledger_id "$TRUST_LEDGER_ID"
echo "Dispute Resolution initialized with Trust Ledger."
echo ""

# 5. Output results
echo "=== DEPLOYMENT COMPLETE ==="
echo ""
echo "Add these to your .env file:"
echo ""
echo "EVIDENCE_REGISTRY_ID=$EVIDENCE_REGISTRY_ID"
echo "DISPUTE_RESOLUTION_ID=$DISPUTE_RESOLUTION_ID"
echo "TRUST_LEDGER_ID=$TRUST_LEDGER_ID"
echo ""
echo "Arbiter (admin) for all contracts: $SOURCE"
