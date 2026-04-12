// Shared types for Verdikt backend
// Order: enums → data structures → API shapes → WebSocket events

// === Enums ===

export type Verdict = 'VALID' | 'PARTIAL' | 'GUILTY';

export type TrustTier = 'UNTRUSTED' | 'STANDARD' | 'TRUSTED';

export type CheckName =
  | 'HTTP_STATUS'
  | 'HAS_BODY'
  | 'VALID_JSON'
  | 'SCHEMA_MATCH'
  | 'FIELDS_PRESENT'
  | 'VALUE_BOUNDS';

// === Service Contract (seller's published promise) ===

export interface SchemaField {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  enum?: string[];
  min?: number;
  max?: number;
}

export interface ServiceContract {
  endpoint: string;
  promised_schema: Record<string, SchemaField>;
  min_response_bytes: number;
}

// === Quality Gate ===

export interface CheckDetail {
  name: CheckName;
  passed: boolean;
  detail: string;
}

export interface CheckResult {
  checks: CheckDetail[];
  passed: number;
  total: number;
  verdict: Verdict;
}

// === Evidence (mirrors Soroban EvidenceData) ===

export interface EvidenceInput {
  tx_hash: string;
  request_hash: string;
  response_hash: string;
  buyer: string;
  seller: string;
}

// === Trust (mirrors Soroban TrustData) ===

export interface TrustData {
  score: number;
  total_tx: number;
  successful: number;
  disputes_lost: number;
  tier: TrustTier;
}

// === Transaction Result (Orchestrator output) ===

export interface TransactionResult {
  buyer: string;
  seller: string;
  amount: string;
  evidence_id: number;
  dispute_id: number;
  check_result: CheckResult;
  verdict: Verdict;
  narration: string;
  escrow_action: 'release' | 'refund' | 'split';
  escrow_tx_hash: string;
  escrow_simulated: boolean;
  seller_tx_hash?: string;
  trust_update: {
    seller: string;
    old_score: number;
    new_score: number;
    old_tier: TrustTier;
    new_tier: TrustTier;
  };
  stellar_explorer_url: string;
  timestamp: number;
}

// === WebSocket Events ===

export type WSEventType =
  | 'transaction_start'
  | 'payment_received'
  | 'seller_response'
  | 'quality_check'
  | 'verdict'
  | 'escrow_action'
  | 'trust_update'
  | 'narration'
  | 'transaction_complete'
  | 'mpp_transaction'
  | 'trust_unlock_complete'
  | 'x402_challenge'
  | 'x402_paying'
  | 'x402_confirmed';

// Discriminated union — full type safety for all WS events
export type WSEvent =
  | WSTransactionStart
  | WSPaymentReceived
  | WSSellerResponse
  | WSQualityCheck
  | WSVerdict
  | WSEscrowAction
  | WSTrustUpdate
  | WSNarration
  | WSTransactionComplete
  | WSMppTransaction
  | WSTrustUnlockComplete
  | WSX402Challenge
  | WSX402Paying
  | WSX402Confirmed;

export interface WSTransactionStart {
  type: 'transaction_start';
  data: {
    buyer: string;
    seller: string;
    amount: string;
    endpoint: string;
  };
  timestamp: number;
}

export interface WSPaymentReceived {
  type: 'payment_received';
  data: {
    tx_hash: string;
    amount: string;
    escrow_address: string;
  };
  timestamp: number;
}

export interface WSSellerResponse {
  type: 'seller_response';
  data: {
    status: number;
    body_preview: string;
    is_valid: boolean;
  };
  timestamp: number;
}

export interface WSQualityCheck {
  type: 'quality_check';
  data: CheckDetail;
  timestamp: number;
}

export interface WSVerdict {
  type: 'verdict';
  data: {
    verdict: Verdict;
    checks_passed: number;
    checks_total: number;
  };
  timestamp: number;
}

export interface WSEscrowAction {
  type: 'escrow_action';
  data: {
    action: 'release' | 'refund' | 'split';
    tx_hash: string;
    seller_tx_hash?: string;
    amount: string;
    recipient: string;
    simulated: boolean;
  };
  timestamp: number;
}

export interface WSTrustUpdate {
  type: 'trust_update';
  data: {
    seller: string;
    old_score: number;
    new_score: number;
    old_tier: TrustTier;
    new_tier: TrustTier;
  };
  timestamp: number;
}

export interface WSNarration {
  type: 'narration';
  data: {
    text: string;
  };
  timestamp: number;
}

export interface WSTransactionComplete {
  type: 'transaction_complete';
  data: TransactionResult;
  timestamp: number;
}

export interface WSMppTransaction {
  type: 'mpp_transaction';
  data: {
    seller: string;
    buyer: string;
    amount: string;
    trust_tier: TrustTier;
  };
  timestamp: number;
}

export interface WSTrustUnlockComplete {
  type: 'trust_unlock_complete';
  data: {
    total_tx: number;
    final_score: number;
    final_tier: TrustTier;
  };
  timestamp: number;
}

export interface WSX402Challenge {
  type: 'x402_challenge';
  timestamp: number;
  data: { buyer: string; amount: string; network: string; payTo: string };
}

export interface WSX402Paying {
  type: 'x402_paying';
  timestamp: number;
  data: { buyer: string };
}

export interface WSX402Confirmed {
  type: 'x402_confirmed';
  timestamp: number;
  data: { buyer: string; tx_hash: string };
}

// === Demo ===

export interface DemoRequest {
  type: 'good' | 'bad' | 'partial';
  buyer?: string;
  seller?: string;
}

export interface CustomDemoRequest {
  httpStatus: number;
  responseBody: string;
  buyer?: string;
  seller?: string;
}

export interface TrustLookupResponse {
  address: string;
  trust: TrustData;
  is_trusted: boolean;
}

// === Agent ===

export interface AgentRecord {
  address: string;
  secret: string; // only returned on onboard
  label: string;
  onboarded_at: number;
  role: 'buyer' | 'seller' | 'escrow' | 'agent';
}

// === Service Catalog ===

export interface ServiceCatalogEntry {
  endpoint: string;
  method: string;
  description: string;
  price_usdc: string;
  payment_protocol: 'x402' | 'mpp';
  schema: Record<string, unknown>;
  trust_requirement: { min_tier: TrustTier; min_score: number } | null;
}

// === Transaction Log ===

export interface TransactionLogEntry {
  id: string;
  buyer: string;
  seller: string;
  verdict: string;
  amount: string;
  evidence_id: number;
  dispute_id: number;
  escrow_action: string;
  escrow_tx_hash: string;
  escrow_simulated: boolean;
  trust_update: {
    seller: string;
    old_score: number;
    new_score: number;
    old_tier: TrustTier;
    new_tier: TrustTier;
  };
  timestamp: number;
}

// === Config ===

export interface VerdiktConfig {
  escrow_secret: string;
  escrow_public: string;
  buyer_secret: string;
  buyer_public: string;
  seller_secret: string;
  seller_public: string;
  evidence_registry_id: string;
  dispute_resolution_id: string;
  trust_ledger_id: string;
  usdc_sac: string;
  oz_facilitator_url: string;
  oz_api_key: string;
  anthropic_api_key: string;
  soroban_rpc: string;
  horizon_url: string;
  network_passphrase: string;
}
