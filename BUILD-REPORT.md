# Build Report — Verdikt
Generated: 2026-04-06
Builder: hackathon-build skill

## Summary
| Phase | Steps | Status | Notes |
|-------|-------|--------|-------|
| 0 | 0.1-0.3 | In Progress | Scaffolding + toolchain |
| 1 | 1.1-1.4 | Pending | Evidence Registry + Trust Ledger |
| 2 | 2.1-2.3 | Pending | Dispute Resolution |
| 3 | 3.1-3.6 | Pending | Backend foundation |
| 4 | 4.1-4.7 | Pending | Backend pipeline |
| 5 | 5.1-5.5 | Pending | Frontend |
| 6 | 6.1-6.4 | Pending | MPP + polish |
| 7 | 7.1-7.4 | Pending | Demo + submission |

## Deviations from Architecture

| ID | Component | ARCHITECTURE Said | ACTUAL | Reason | Downstream Impact |
|----|-----------|-------------------|--------|--------|-------------------|
| DEV-001 | scripts/deploy-contracts.sh | WASM path `target/wasm32-unknown-unknown/release/...` | WASM path `target/wasm32v1-none/release/...` | stellar-cli 25.2.0 targets wasm32v1-none, not wasm32-unknown-unknown | Updated deploy-contracts.sh to use correct path. No other impact. |
| DEV-002 | contracts/Cargo.toml | `[profile.release]` in each crate's Cargo.toml | Moved to workspace root `contracts/Cargo.toml` | Cargo workspace ignores package-level profiles — must be in workspace root | Removed per-crate profile sections (still present but ignored). Build works correctly. |
| DEV-003 | contracts/dispute-resolution/src/lib.rs | `contractimport!` path `../trust-ledger/target/wasm32-unknown-unknown/release/verdikt_trust_ledger.wasm` | Path `../target/wasm32v1-none/release/verdikt_trust_ledger.wasm` | (1) Workspace uses shared target dir, not per-crate. (2) stellar-cli 25.2.0 uses wasm32v1-none. Path is relative to dispute-resolution crate dir. | None — correct path resolves successfully. contractimport! works. |

## Failed Attempts & Resolutions
| Step | Error | Attempts | Resolution |
|------|-------|----------|------------|

## Verification Results
| Phase | Command | Expected | Actual | Pass? |
|-------|---------|----------|--------|-------|
| 0 | `stellar --version` | stellar 25.2.0 | stellar 25.2.0 | ✅ |
| 0 | `rustup target list --installed \| grep wasm32` | wasm32-unknown-unknown | wasm32-unknown-unknown + wasm32v1-none | ✅ |
| 0 | `curl horizon buyer` | XLM balance | 10000 XLM | ✅ |
| 1 | `stellar contract build --package verdikt-evidence-registry` | Build Complete | 3544 bytes WASM | ✅ |
| 1 | `stellar contract build --package verdikt-trust-ledger` | Build Complete | 5926 bytes WASM | ✅ |
| 1 | `stellar contract invoke ... get_count` | 0 | 0 | ✅ |
| 1 | `stellar contract invoke ... get_trust seller` | score=0, tier=Untrusted | {"score":0,"tier":"Untrusted",...} | ✅ |

## Known Risks (for debug)

## Contract Addresses
| Contract | Network | Address | Tx Hash |
|----------|---------|---------|---------|
| Evidence Registry | Stellar Testnet | CD6LZ7ZKA5O4FOQFKO7UVYDRPFJG46GJ4GLKFARU26WWXHHZIYBTDCEU | e5d8ddc457e7d4298cff678422d45a057d52023192794fc8cae9951354d50cc6 |
| Trust Ledger | Stellar Testnet | CBGYLTBOARBXM4RORKQGCQJGVVMB3LEFR73AB74BYVZEHECXVO6SQBG5 | 699c0a9895b6aa8d81cf00b7241cdd4586f3766a798898a3c8807f1f84da6286 |

## Environment Variables Added
| Key | Source Step | Value/Description |
|-----|-----------|-------------------|
| EVIDENCE_REGISTRY_ID | 1.3 | CD6LZ7ZKA5O4FOQFKO7UVYDRPFJG46GJ4GLKFARU26WWXHHZIYBTDCEU |
| TRUST_LEDGER_ID | 1.3 | CBGYLTBOARBXM4RORKQGCQJGVVMB3LEFR73AB74BYVZEHECXVO6SQBG5 |
