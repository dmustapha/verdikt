import { useReducer } from 'react';
import type { CheckDetail, TrustUpdate, TrustTier, TransactionEntry, Phase, WSEvent } from '../../types';

/** Full context of the current live transaction — populated from WS events */
export interface CurrentTx {
  buyer: string;
  seller: string;
  amount: string;
  endpoint: string;
  paymentHash: string;
  escrowAddress: string;
  httpStatus: number | null;
  bodyPreview: string;
  escrowTxHash: string;
  sellerTxHash: string | undefined;
  recipient: string;
  evidenceId: number;
  disputeId: number;
  escrowAction: 'release' | 'refund' | 'split' | null;
  escrowSimulated: boolean;
  stellarExplorerUrl: string;
}

const emptyTx: CurrentTx = {
  buyer: '', seller: '', amount: '', endpoint: '',
  paymentHash: '', escrowAddress: '',
  httpStatus: null, bodyPreview: '',
  escrowTxHash: '', sellerTxHash: undefined, recipient: '',
  evidenceId: 0, disputeId: 0,
  escrowAction: null, escrowSimulated: false,
  stellarExplorerUrl: '',
};

export interface CourtroomState {
  phase: Phase;
  checks: CheckDetail[];
  verdict: string | null;
  narration: string;
  trustUpdate: TrustUpdate | null;
  transactions: TransactionEntry[];
  escrowAction: string | null;
  escrowSimulated: boolean;
  buyerActive: boolean;
  sellerActive: boolean;
  sellerBad: boolean;
  isRunning: boolean;
  checksPassed: number;
  checksTotal: number;
  currentTx: CurrentTx;
  x402PaymentPhase: null | 'challenge' | 'paying' | 'confirmed';
}

export type CourtroomAction =
  | { type: 'WS_EVENT'; event: WSEvent; isBulkRunning: boolean }
  | { type: 'RESET_FOR_DEMO' }
  | { type: 'SET_RUNNING'; running: boolean }
  | { type: 'INIT_TRUST'; trust: TrustUpdate }
  | { type: 'CLEAR_ACTIVE_PANELS' }
  | { type: 'SET_TRANSACTIONS'; transactions: TransactionEntry[] };

const initialState: CourtroomState = {
  phase: 'idle',
  checks: [],
  verdict: null,
  narration: '',
  trustUpdate: null,
  transactions: [],
  escrowAction: null,
  escrowSimulated: false,
  buyerActive: false,
  sellerActive: false,
  sellerBad: false,
  isRunning: false,
  checksPassed: 0,
  checksTotal: 6,
  currentTx: { ...emptyTx },
  x402PaymentPhase: null,
};

function courtroomReducer(state: CourtroomState, action: CourtroomAction): CourtroomState {
  switch (action.type) {
    case 'RESET_FOR_DEMO':
      return {
        ...state,
        phase: 'idle',
        checks: [],
        verdict: null,
        narration: '',
        escrowAction: null,
        escrowSimulated: false,
        isRunning: true,
        sellerBad: false,
        currentTx: { ...emptyTx },
        x402PaymentPhase: null,
      };

    case 'SET_RUNNING':
      return { ...state, isRunning: action.running };

    case 'INIT_TRUST':
      return { ...state, trustUpdate: action.trust };

    case 'CLEAR_ACTIVE_PANELS':
      return { ...state, buyerActive: false, sellerActive: false };

    case 'SET_TRANSACTIONS':
      return { ...state, transactions: action.transactions };

    case 'WS_EVENT':
      return handleWSEvent(state, action.event, action.isBulkRunning);
  }
}

function handleWSEvent(state: CourtroomState, event: WSEvent, isBulkRunning: boolean): CourtroomState {
  switch (event.type) {
    case 'transaction_start':
      return {
        ...state,
        phase: 'payment',
        buyerActive: true,
        sellerActive: false,
        sellerBad: false,
        checks: [],
        verdict: null,
        checksPassed: 0,
        checksTotal: 6,
        narration: '',
        escrowAction: null,
        escrowSimulated: false,
        x402PaymentPhase: null,
        currentTx: {
          ...emptyTx,
          buyer: event.data.buyer,
          seller: event.data.seller,
          amount: event.data.amount,
          endpoint: event.data.endpoint,
        },
      };

    case 'x402_challenge':
      return { ...state, x402PaymentPhase: 'challenge' };

    case 'x402_paying':
      return { ...state, x402PaymentPhase: 'paying' };

    case 'x402_confirmed':
      return { ...state, x402PaymentPhase: 'confirmed' };

    case 'payment_received':
      return {
        ...state,
        phase: 'payment',
        currentTx: {
          ...state.currentTx,
          paymentHash: event.data.tx_hash,
          escrowAddress: event.data.escrow_address,
        },
      };

    case 'seller_response':
      return {
        ...state,
        phase: 'seller_response',
        sellerActive: true,
        sellerBad: !event.data.is_valid,
        currentTx: {
          ...state.currentTx,
          httpStatus: event.data.status,
          bodyPreview: event.data.body_preview,
        },
      };

    case 'quality_check':
      return {
        ...state,
        phase: 'checking',
        checks: [...state.checks, event.data],
      };

    case 'verdict':
      return {
        ...state,
        phase: 'verdict',
        verdict: event.data.verdict,
        checksPassed: event.data.checks_passed,
        checksTotal: event.data.checks_total,
      };

    case 'escrow_action':
      return {
        ...state,
        phase: 'escrow',
        escrowAction: event.data.action,
        escrowSimulated: event.data.simulated,
        currentTx: {
          ...state.currentTx,
          escrowAction: event.data.action as 'release' | 'refund' | 'split',
          escrowTxHash: event.data.tx_hash,
          sellerTxHash: event.data.seller_tx_hash,
          recipient: event.data.recipient,
          escrowSimulated: event.data.simulated,
        },
      };

    case 'trust_update':
      return { ...state, trustUpdate: event.data };

    case 'narration':
      return {
        ...state,
        phase: 'narration',
        narration: event.data.text,
      };

    case 'mpp_transaction':
      return {
        ...state,
        transactions: [
          {
            id: `mpp-${event.data.seller}-${event.data.buyer}-${Date.now()}`,
            verdict: 'VALID',
            timestamp: Date.now(),
            seller: event.data.seller,
            buyer: event.data.buyer,
          },
          ...state.transactions,
        ],
      };

    case 'trust_unlock_complete':
      return {
        ...state,
        isRunning: false,
        trustUpdate: event.data.final_score !== undefined
          ? {
              old_score: state.trustUpdate?.new_score ?? 300,
              new_score: event.data.final_score,
              old_tier: (state.trustUpdate?.new_tier ?? 'UNTRUSTED') as TrustTier,
              new_tier: event.data.final_tier as TrustTier,
            }
          : state.trustUpdate,
      };

    case 'transaction_complete':
      return {
        ...state,
        phase: 'complete',
        isRunning: isBulkRunning ? state.isRunning : false,
        currentTx: {
          ...state.currentTx,
          buyer: event.data.buyer || state.currentTx.buyer,
          seller: event.data.seller || state.currentTx.seller,
          amount: event.data.amount || state.currentTx.amount,
          evidenceId: event.data.evidence_id,
          disputeId: event.data.dispute_id,
          escrowTxHash: event.data.escrow_tx_hash || state.currentTx.escrowTxHash,
          escrowSimulated: event.data.escrow_simulated,
          stellarExplorerUrl: event.data.stellar_explorer_url,
        },
        transactions: [
          {
            id: event.data.evidence_id > 0 ? `tx-${event.data.evidence_id}` : `tx-${Date.now()}`,
            verdict: event.data.verdict,
            tx_hash: event.data.escrow_tx_hash,
            explorer_url: event.data.stellar_explorer_url,
            simulated: event.data.escrow_simulated,
            timestamp: Date.now(),
            buyer: event.data.buyer || state.currentTx.buyer,
            seller: event.data.trust_update?.seller || event.data.seller || state.currentTx.seller,
          },
          ...state.transactions,
        ],
      };

    default:
      return state;
  }
}

export function useCourtroomState() {
  return useReducer(courtroomReducer, initialState);
}
