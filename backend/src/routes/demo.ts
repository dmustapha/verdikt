import { Router } from 'express';
import type { Request, Response } from 'express';
import { Orchestrator } from '../services/orchestrator.js';
import { DemoRequest, CustomDemoRequest } from '../types.js';
import { SENTIMENT_CONTRACT } from '../shared/contracts.js';
import { x402Client, x402HTTPClient } from '@x402/core/client';
import { ExactStellarScheme, createEd25519Signer } from '@x402/stellar';

async function makeX402SentimentCall(
  buyer: string,
  url: string,
  httpClient: x402HTTPClient | null,
  orchestrator: Orchestrator,
): Promise<{ httpStatus: number; responseBody: string; paymentTxHash: string }> {
  const fallback = () => ({
    httpStatus: 0 as number,
    responseBody: '',
    paymentTxHash: `demo_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  });

  if (!httpClient) {
    try {
      const r = await fetch(url.replace('/api/sentiment', '/api/sentiment-good'));
      return { httpStatus: r.status, responseBody: await r.text(), paymentTxHash: `demo_${Date.now()}_${Math.random().toString(36).slice(2)}` };
    } catch { return fallback(); }
  }

  try {
    // Step 1: First request — expect 402
    const firstRes = await fetch(url, { headers: { 'x-buyer-address': buyer } });

    if (firstRes.status === 200) {
      // x402 middleware not active — use response directly
      return {
        httpStatus: firstRes.status,
        responseBody: await firstRes.text(),
        paymentTxHash: `x402_fallback_${Date.now()}`,
      };
    }

    if (firstRes.status !== 402) {
      throw new Error(`Unexpected status ${firstRes.status} from sentiment endpoint`);
    }

    // Step 2: Parse 402 and broadcast challenge event
    const paymentRequired = httpClient.getPaymentRequiredResponse(
      name => firstRes.headers.get(name),
    );
    if (!paymentRequired.accepts?.length) {
      throw new Error('Empty accepts in 402 response');
    }
    const amount = paymentRequired.accepts[0].amount ?? '0.01';
    const network = paymentRequired.accepts[0].network ?? 'stellar:testnet';
    const payTo = paymentRequired.accepts[0].payTo ?? '';
    orchestrator.broadcastX402Challenge(buyer, { amount: String(amount), network: String(network), payTo: String(payTo) });

    // Step 3: Create payload first, then broadcast paying (proves signing happened)
    const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
    orchestrator.broadcastX402Paying(buyer);
    const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);

    // Step 4: Retry with payment proof
    const paidRes = await fetch(url, {
      headers: { 'x-buyer-address': buyer, ...paymentHeaders },
    });

    // Step 5: Extract real tx hash from settlement
    let paymentTxHash = `x402_${Date.now()}`;
    try {
      const settle = httpClient.getPaymentSettleResponse(name => paidRes.headers.get(name));
      if (settle?.transaction) paymentTxHash = settle.transaction;
    } catch { /* header absent — use fallback hash */ }

    orchestrator.broadcastX402Confirmed(buyer, paymentTxHash);
    console.log(`[demo] x402 payment confirmed: ${paymentTxHash}`);

    return {
      httpStatus: paidRes.status,
      responseBody: await paidRes.text(),
      paymentTxHash,
    };
  } catch (err) {
    console.warn('[demo] x402 payment failed, falling back to mock:', err);
    try {
      const r = await fetch(url.replace('/api/sentiment', '/api/sentiment-good'));
      return {
        httpStatus: r.status,
        responseBody: await r.text(),
        paymentTxHash: `demo_fallback_${Date.now()}`,
      };
    } catch { return fallback(); }
  }
}

// Simulates x402 UI events for bad/partial demos WITHOUT hitting the sentiment pipeline.
// Calling /api/sentiment would run processTransaction internally (double pipeline → corrupts trust scores).
async function simulateX402Events(
  buyer: string,
  orchestrator: Orchestrator,
): Promise<string> {
  const txHash = `x402_sim_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  orchestrator.broadcastX402Challenge(buyer, { amount: '0.01', network: 'stellar:testnet', payTo: 'escrow' });
  await new Promise(r => setTimeout(r, 400));
  orchestrator.broadcastX402Paying(buyer);
  await new Promise(r => setTimeout(r, 600));
  orchestrator.broadcastX402Confirmed(buyer, txHash);
  return txHash;
}

export function createDemoRouter(
  orchestrator: Orchestrator,
  buyerPublic: string,
  buyerSecret: string,
  sellerPublic: string,
): Router {
  const router = Router();

  // x402 client — init once at startup, reused per request
  let httpClient: x402HTTPClient | null = null;
  try {
    const signer = createEd25519Signer(buyerSecret);
    const scheme = new ExactStellarScheme(signer, {
      url: process.env.SOROBAN_RPC || 'https://soroban-testnet.stellar.org',
    });
    const base = new x402Client();
    base.register('stellar:testnet', scheme);
    httpClient = new x402HTTPClient(base);
  } catch (err) {
    console.warn('[demo] x402 client init failed — will use mock hashes:', err);
  }

  router.post('/api/demo/run', async (req: Request, res: Response) => {
    const { type, buyer, seller } = req.body as DemoRequest;

    if (!type || !['good', 'bad', 'partial'].includes(type)) {
      res.status(400).json({ error: 'Invalid type. Must be "good", "bad", or "partial".' });
      return;
    }

    const activeBuyer = buyer || buyerPublic;
    const activeSeller = seller || sellerPublic;
    const PORT = process.env.PORT || 4000;
    const requestBody = JSON.stringify({ query: 'Analyze sentiment of this text' });
    let httpStatus: number;
    let responseBody: string;
    let paymentTxHash: string = `demo_${Date.now()}_init`;

    if (type === 'bad') {
      // Fraudulent Sale: x402 events simulate payment proof, seller returns garbage.
      // Uses simulateX402Events (not /api/sentiment) to avoid double-pipeline trust corruption.
      paymentTxHash = await simulateX402Events(activeBuyer, orchestrator);
      try {
        const badRes = await fetch(`http://localhost:${PORT}/api/sentiment-bad`);
        httpStatus = badRes.status;
        responseBody = await badRes.text();
      } catch {
        httpStatus = 500;
        responseBody = '';
      }
    } else if (type === 'partial') {
      // Ambiguous Delivery: x402 events simulate payment proof, seller returns partially valid data.
      // Missing confidence field + invalid label enum → 4/6 checks pass → PARTIAL → split 50/50.
      paymentTxHash = await simulateX402Events(activeBuyer, orchestrator);
      httpStatus = 200;
      responseBody = JSON.stringify({ score: 0.5, label: 'unknown', note: 'ambiguous signal detected' });
    } else {
      // Honest Sale: real x402 through the gated endpoint — full payment handshake, real tx hash
      const sentimentUrl = `http://localhost:${PORT}/api/sentiment?text=${encodeURIComponent('Analyze sentiment of this text')}`;
      const result = await makeX402SentimentCall(activeBuyer, sentimentUrl, httpClient, orchestrator);
      httpStatus = result.httpStatus;
      responseBody = result.responseBody;
      paymentTxHash = result.paymentTxHash;
    }

    try {
      const result = await orchestrator.processTransaction(
        activeBuyer,
        activeSeller,
        httpStatus,
        responseBody,
        requestBody,
        '0.01',
        paymentTxHash,
        SENTIMENT_CONTRACT,
      );
      res.json(result);
    } catch (error) {
      console.error('Demo transaction failed:', error);
      res.status(500).json({
        error: 'Transaction processing failed',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Custom demo — accepts arbitrary httpStatus and responseBody for stress testing
  router.post('/api/demo/custom', async (req: Request, res: Response) => {
    const { httpStatus, responseBody, buyer, seller } = req.body as CustomDemoRequest;

    if (typeof httpStatus !== 'number' || typeof responseBody !== 'string') {
      res.status(400).json({ error: 'Must provide httpStatus (number) and responseBody (string).' });
      return;
    }

    const activeBuyer = buyer || buyerPublic;
    const activeSeller = seller || sellerPublic;
    const requestBody = JSON.stringify({ query: 'Custom stress test' });
    const paymentTxHash = `custom_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    try {
      const result = await orchestrator.processTransaction(
        activeBuyer,
        activeSeller,
        httpStatus,
        responseBody,
        requestBody,
        '0.01',
        paymentTxHash,
        SENTIMENT_CONTRACT,
      );
      res.json(result);
    } catch (error) {
      console.error('Custom demo failed:', error);
      res.status(500).json({
        error: 'Transaction processing failed',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Trust tier unlock — streams results via WebSocket, responds immediately
  router.post('/api/demo/trust-unlock', async (req: Request, res: Response) => {
    const count = Math.min(req.body?.count || 10, 75);
    const activeBuyer = req.body?.buyer || buyerPublic;
    const activeSeller = req.body?.seller || sellerPublic;

    // Respond immediately — results stream via WebSocket
    res.json({ status: 'started', target_count: count });

    // Run transactions in background (not awaited)
    (async () => {
      let lastResult;
      let completedTx = 0;
      const PORT = process.env.PORT || 4000;
      try {
        for (let i = 0; i < count; i++) {
          try {
            const sellerResponse = await fetch(`http://localhost:${PORT}/api/sentiment-good`);
            const txHttpStatus = sellerResponse.status;
            const txResponseBody = await sellerResponse.text();

            lastResult = await orchestrator.processTransaction(
              activeBuyer,
              activeSeller,
              txHttpStatus,
              txResponseBody,
              JSON.stringify({ query: `Trust build tx #${i + 1}` }),
              '0.01',
              `trust_build_${Date.now()}_${i}`,
              SENTIMENT_CONTRACT,
            );
            completedTx++;

            if (lastResult.trust_update.new_tier === 'TRUSTED') {
              break;
            }
          } catch (error) {
            console.error(`Trust build tx #${i + 1} failed:`, error);
            break;
          }
        }
      } finally {
        orchestrator.broadcastTrustUnlockComplete({
          total_tx: completedTx,
          final_score: lastResult?.trust_update.new_score ?? 0,
          final_tier: lastResult?.trust_update.new_tier ?? 'UNTRUSTED',
        });
      }
    })();
  });

  return router;
}
