import { WebSocket } from 'ws';
import { runQualityGate } from './quality-gate.js';
import { narrateVerdict } from './judge-agent.js';
import { EscrowManager } from './escrow-manager.js';
import { SorobanClient } from './soroban-client.js';
import { TransactionStore } from './transaction-store.js';
import {
  ServiceContract,
  TransactionResult,
  TransactionLogEntry,
  WSEvent,
  TrustTier,
  TrustData,
} from '../types.js';

export class Orchestrator {
  private escrowManager: EscrowManager;
  private sorobanClient: SorobanClient;
  private anthropicApiKey: string;
  private transactionStore: TransactionStore;
  // Map<ws, subscribedAddress | null>. null = receive all events (backward compatible).
  private wsClients: Map<WebSocket, string | null> = new Map();
  private explorerBaseUrl = 'https://stellar.expert/explorer/testnet/tx';
  // Local trust cache — fallback when Soroban RPC is unreachable (ephemeral, resets on restart)
  private localTrust = new Map<string, { score: number; tier: TrustTier }>();

  constructor(
    escrowManager: EscrowManager,
    sorobanClient: SorobanClient,
    anthropicApiKey: string,
    transactionStore: TransactionStore
  ) {
    this.escrowManager = escrowManager;
    this.sorobanClient = sorobanClient;
    this.anthropicApiKey = anthropicApiKey;
    this.transactionStore = transactionStore;
  }

  addWSClient(ws: WebSocket) {
    this.wsClients.set(ws, null); // default: receive all
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if ('subscribe' in msg) {
          const addr = msg.subscribe;
          this.wsClients.set(ws, typeof addr === 'string' && addr.length > 0 ? addr : null);
        }
      } catch { /* ignore non-JSON */ }
    });
    ws.on('close', () => this.wsClients.delete(ws));
  }

  private broadcast(event: WSEvent) {
    this.broadcastWithFallback(event);
  }

  private extractAddresses(event: WSEvent): Set<string> {
    const addrs = new Set<string>();
    const d = event.data as Record<string, unknown>;
    if (typeof d.buyer === 'string') addrs.add(d.buyer);
    if (typeof d.seller === 'string') addrs.add(d.seller);
    if (typeof d.recipient === 'string') addrs.add(d.recipient);
    // transaction_complete nests addresses in trust_update
    if (d.trust_update && typeof (d.trust_update as Record<string, unknown>).seller === 'string') {
      addrs.add((d.trust_update as Record<string, unknown>).seller as string);
    }
    // narration/quality_check/verdict have no addresses — broadcast to all subscribers
    // who were already subscribed to a matching transaction_start
    if (addrs.size === 0) {
      // Events without addresses (narration, quality_check, verdict, payment_received)
      // should reach anyone watching the current transaction. Return empty = no match
      // against any filter, so these go to null-subscribers only.
      // Fix: broadcast these to ALL subscribers (they're part of an active transaction).
      return addrs; // Will be handled by broadcast fallback below
    }
    return addrs;
  }

  // Track active transaction participants so mid-flow events reach the right subscribers
  private activeTransactionAddresses = new Set<string>();

  private broadcastWithFallback(event: WSEvent) {
    // Track active transaction participants
    if (event.type === 'transaction_start') {
      this.activeTransactionAddresses.clear();
      const d = event.data as { buyer: string; seller: string };
      this.activeTransactionAddresses.add(d.buyer);
      this.activeTransactionAddresses.add(d.seller);
    }

    const data = JSON.stringify(event);
    const eventAddresses = this.extractAddresses(event);
    // For events without addresses (mid-flow: quality_check, verdict, narration, etc.),
    // use the active transaction participants
    const matchAddresses = eventAddresses.size > 0 ? eventAddresses : this.activeTransactionAddresses;

    for (const [client, filter] of this.wsClients) {
      if (client.readyState !== WebSocket.OPEN) continue;
      if (filter === null || matchAddresses.has(filter)) {
        client.send(data);
      }
    }

    if (event.type === 'transaction_complete') {
      this.activeTransactionAddresses.clear();
    }
  }

  /** Broadcast an MPP fast-lane transaction event */
  broadcastMpp(data: { seller: string; buyer: string; amount: string; trust_tier: TrustTier }) {
    this.broadcast({ type: 'mpp_transaction', data, timestamp: Date.now() });
  }

  /** Broadcast trust-unlock batch completion */
  broadcastTrustUnlockComplete(data: { total_tx: number; final_score: number; final_tier: TrustTier }) {
    this.broadcast({ type: 'trust_unlock_complete', data, timestamp: Date.now() });
  }

  broadcastX402Challenge(buyer: string, data: { amount: string; network: string; payTo: string }) {
    this.broadcast({ type: 'x402_challenge', data: { buyer, ...data }, timestamp: Date.now() });
  }

  broadcastX402Paying(buyer: string) {
    this.broadcast({ type: 'x402_paying', data: { buyer }, timestamp: Date.now() });
  }

  broadcastX402Confirmed(buyer: string, txHash: string) {
    this.broadcast({ type: 'x402_confirmed', data: { buyer, tx_hash: txHash }, timestamp: Date.now() });
  }

  async processTransaction(
    buyerAddress: string,
    sellerAddress: string,
    httpStatus: number,
    responseBody: string,
    requestBody: string,
    paymentAmount: string,
    paymentTxHash: string,
    serviceContract: ServiceContract
  ): Promise<TransactionResult> {
    const now = Date.now();

    // 1. Broadcast: transaction start
    this.broadcast({
      type: 'transaction_start',
      data: {
        buyer: buyerAddress,
        seller: sellerAddress,
        amount: paymentAmount,
        endpoint: serviceContract.endpoint,
      },
      timestamp: now,
    });

    // Small delay for animation pacing
    await this.delay(500);

    // 2. Broadcast: payment received
    this.broadcast({
      type: 'payment_received',
      data: {
        tx_hash: paymentTxHash,
        amount: paymentAmount,
        escrow_address: this.escrowManager.publicKey,
      },
      timestamp: Date.now(),
    });

    await this.delay(500);

    // 3. Broadcast: seller response
    this.broadcast({
      type: 'seller_response',
      data: {
        status: httpStatus,
        body_preview: responseBody.slice(0, 200),
        is_valid: httpStatus === 200,
      },
      timestamp: Date.now(),
    });

    await this.delay(500);

    // 4. Run Quality Gate
    const checkResult = runQualityGate(httpStatus, responseBody, serviceContract);

    // 5. Broadcast each check one by one (animation pacing)
    for (const check of checkResult.checks) {
      this.broadcast({
        type: 'quality_check',
        data: check,
        timestamp: Date.now(),
      });
      await this.delay(600); // Deliberation feel — each check ticks in
    }

    // 6. Broadcast verdict
    this.broadcast({
      type: 'verdict',
      data: {
        verdict: checkResult.verdict,
        checks_passed: checkResult.passed,
        checks_total: checkResult.total,
      },
      timestamp: Date.now(),
    });

    await this.delay(500);

    // Determine escrow action from verdict BEFORE on-chain calls
    const escrowAction: 'release' | 'refund' | 'split' =
      checkResult.verdict === 'VALID' ? 'release'
      : checkResult.verdict === 'GUILTY' ? 'refund'
      : 'split';

    let evidenceId = 0;
    let disputeId = 0;
    let escrowTxHash = '';
    let sellerTxHash: string | undefined;
    // Seed from local trust cache (survives Soroban failures across demos).
    // New sellers start at 300 (STANDARD) so demos show visible movement in both directions.
    const cached = this.localTrust.get(sellerAddress);
    let oldScore = cached?.score ?? 300;
    let oldTier: TrustTier = cached?.tier ?? 'STANDARD';
    let newScore = 0;
    let newTier: TrustTier = 'UNTRUSTED';
    let narration = '';
    let onChainFailed = false;

    let onChainStep = '';
    try {
      // 7. Read trust BEFORE verdict (so we have accurate old score for animation)
      onChainStep = 'read_trust';
      const oldTrustData = await this.sorobanClient.getTrust(sellerAddress);
      // Only use Soroban's score if it's non-zero — a zero score from a contract whose
      // cross-contract update_trust never persists is meaningless stale data.
      if (oldTrustData.score > 0) {
        oldScore = oldTrustData.score;
        oldTier = oldTrustData.tier;
      }

      // 8. Store evidence on-chain
      onChainStep = 'store_evidence';
      evidenceId = await this.sorobanClient.storeEvidence({
        tx_hash: SorobanClient.hashString(paymentTxHash),
        request_hash: SorobanClient.hashString(requestBody),
        response_hash: SorobanClient.hashString(responseBody),
        buyer: buyerAddress,
        seller: sellerAddress,
      });

      // 9. Record verdict on-chain (triggers trust update via cross-contract call)
      onChainStep = 'record_verdict';
      disputeId = await this.sorobanClient.recordVerdict(
        evidenceId,
        sellerAddress,
        checkResult.passed,
        checkResult.total,
        checkResult.verdict
      );

      // 10. Execute escrow action
      onChainStep = 'escrow';
      if (escrowAction === 'release') {
        escrowTxHash = await this.escrowManager.releaseToSeller(
          sellerAddress,
          paymentAmount
        );
      } else if (escrowAction === 'refund') {
        escrowTxHash = await this.escrowManager.refundToBuyer(
          buyerAddress,
          paymentAmount
        );
      } else {
        const splitResult = await this.escrowManager.splitPayment(
          buyerAddress,
          sellerAddress,
          paymentAmount
        );
        escrowTxHash = splitResult.buyerTxHash;
        sellerTxHash = splitResult.sellerTxHash;
      }

      // 11. Get updated trust data (after cross-contract call updated it)
      onChainStep = 'read_updated_trust';
      const newTrustData = await this.sorobanClient.getTrust(sellerAddress);
      // Only trust on-chain score if non-zero (contract never persists updates)
      if (newTrustData.score > 0) {
        newScore = newTrustData.score;
        newTier = newTrustData.tier;
      }
    } catch (error) {
      console.error(`On-chain sequence failed at step [${onChainStep}]:`, error);
      onChainFailed = true;
    }

    // Always compute trust locally (mirrors Soroban contract scoring rules).
    // The on-chain contract's cross-contract update_trust never persists,
    // so local computation is the authoritative source for trust scores.
    const expectedDelta = checkResult.verdict === 'VALID' ? 10
      : checkResult.verdict === 'GUILTY' ? -50
      : 0;

    if (newScore === 0 || onChainFailed) {
      newScore = Math.max(0, Math.min(800, oldScore + expectedDelta));
      newTier = this.computeTier(newScore);
    }

    // Always update local trust cache (real or computed)
    console.log(`[Trust] ${checkResult.verdict}: ${oldScore} → ${newScore} (delta ${expectedDelta}, tier ${newTier}, cached: ${cached?.score ?? 'none'})`);
    this.localTrust.set(sellerAddress, { score: newScore, tier: newTier });

    // 12. Broadcast escrow action (always — simulated flag when on-chain failed)
    this.broadcast({
      type: 'escrow_action',
      data: {
        action: escrowAction,
        tx_hash: escrowTxHash || `sim_${Date.now()}`,
        seller_tx_hash: sellerTxHash,
        amount: paymentAmount,
        recipient:
          escrowAction === 'release'
            ? sellerAddress
            : escrowAction === 'refund'
              ? buyerAddress
              : 'split',
        simulated: onChainFailed || !escrowTxHash || escrowTxHash.startsWith('sim_'),
      },
      timestamp: Date.now(),
    });

    await this.delay(500);

    // 13. Broadcast trust update (always — uses real or locally computed values)
    this.broadcast({
      type: 'trust_update',
      data: {
        seller: sellerAddress,
        old_score: oldScore,
        new_score: newScore,
        old_tier: oldTier,
        new_tier: newTier,
      },
      timestamp: Date.now(),
    });

    await this.delay(500);

    // 14. Generate narration (always — even if on-chain failed)
    if (!narration) {
      narration = await narrateVerdict(checkResult, this.anthropicApiKey);
    }

    // 15. Broadcast narration (single broadcast — never duplicated)
    this.broadcast({
      type: 'narration',
      data: { text: narration },
      timestamp: Date.now(),
    });

    // 16. Build result
    const result: TransactionResult = {
      buyer: buyerAddress,
      seller: sellerAddress,
      amount: paymentAmount,
      evidence_id: evidenceId,
      dispute_id: disputeId,
      check_result: checkResult,
      verdict: checkResult.verdict,
      narration,
      escrow_action: escrowAction,
      escrow_tx_hash: escrowTxHash,
      escrow_simulated: escrowTxHash.startsWith('sim_'),
      seller_tx_hash: sellerTxHash,
      trust_update: {
        seller: sellerAddress,
        old_score: oldScore,
        new_score: newScore,
        old_tier: oldTier,
        new_tier: newTier,
      },
      stellar_explorer_url: escrowTxHash && !escrowTxHash.startsWith('sim_')
        ? `${this.explorerBaseUrl}/${escrowTxHash}`
        : '',
      timestamp: Date.now(),
    };

    // 17. Broadcast complete
    this.broadcast({
      type: 'transaction_complete',
      data: result,
      timestamp: Date.now(),
    });

    // 18. Persist to transaction store
    const logEntry: TransactionLogEntry = {
      id: `tx-${result.timestamp}-${evidenceId}`,
      buyer: buyerAddress,
      seller: sellerAddress,
      verdict: result.verdict,
      amount: paymentAmount,
      evidence_id: evidenceId,
      dispute_id: disputeId,
      escrow_action: escrowAction,
      escrow_tx_hash: escrowTxHash,
      escrow_simulated: escrowTxHash.startsWith('sim_'),
      trust_update: result.trust_update,
      timestamp: result.timestamp,
    };
    this.transactionStore.append(logEntry);

    return result;
  }

  private computeTier(score: number): TrustTier {
    if (score >= 700) return 'TRUSTED';
    if (score >= 300) return 'STANDARD';
    return 'UNTRUSTED';
  }

  getLocalTrust(address: string): { score: number; tier: TrustTier } | undefined {
    return this.localTrust.get(address);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
