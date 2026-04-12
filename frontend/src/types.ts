// Frontend types — mirrors backend/src/types.ts for shared interfaces.
// Keep in sync with backend source of truth.

export type Verdict = 'VALID' | 'PARTIAL' | 'GUILTY';
export type TrustTier = 'UNTRUSTED' | 'STANDARD' | 'TRUSTED';

export type Phase =
  | 'idle'
  | 'payment'
  | 'seller_response'
  | 'checking'
  | 'verdict'
  | 'escrow'
  | 'narration'
  | 'complete';

export interface CheckDetail {
  name: string;
  passed: boolean;
  detail: string;
}

export interface TrustUpdate {
  seller?: string;
  old_score: number;
  new_score: number;
  old_tier: TrustTier;
  new_tier: TrustTier;
}

export interface TransactionEntry {
  id: string;
  verdict: string;
  tx_hash?: string;
  explorer_url?: string;
  simulated?: boolean;
  timestamp: number;
  buyer?: string;
  seller?: string;
}

// === Agent (mirrors backend AgentRecord without secret) ===

export interface AgentRecord {
  address: string;
  role: 'buyer' | 'seller' | 'escrow' | 'agent';
  label: string;
  onboarded_at?: number;
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

// === WebSocket Event Types (mirrors backend WSEvent union) ===

export type WSEvent =
  | { type: 'transaction_start'; data: { buyer: string; seller: string; amount: string; endpoint: string } }
  | { type: 'payment_received'; data: { tx_hash: string; amount: string; escrow_address: string } }
  | { type: 'seller_response'; data: { status: number; body_preview: string; is_valid: boolean } }
  | { type: 'quality_check'; data: CheckDetail }
  | { type: 'verdict'; data: { verdict: Verdict; checks_passed: number; checks_total: number } }
  | { type: 'escrow_action'; data: { action: string; tx_hash: string; seller_tx_hash?: string; amount: string; recipient: string; simulated: boolean } }
  | { type: 'trust_update'; data: TrustUpdate & { seller: string } }
  | { type: 'narration'; data: { text: string } }
  | { type: 'transaction_complete'; data: { buyer: string; seller: string; amount: string; evidence_id: number; dispute_id: number; verdict: string; narration: string; escrow_action: string; escrow_tx_hash: string; escrow_simulated: boolean; seller_tx_hash?: string; check_result: { checks: CheckDetail[]; passed: number; total: number; verdict: string }; trust_update: TrustUpdate & { seller: string }; stellar_explorer_url: string; timestamp: number } }
  | { type: 'mpp_transaction'; data: { seller: string; buyer: string; amount: string; trust_tier: TrustTier } }
  | { type: 'trust_unlock_complete'; data: { total_tx: number; final_score: number; final_tier: TrustTier } }
  | { type: 'x402_challenge'; data: { buyer: string; amount: string; network: string; payTo: string } }
  | { type: 'x402_paying'; data: { buyer: string } }
  | { type: 'x402_confirmed'; data: { buyer: string; tx_hash: string } };
