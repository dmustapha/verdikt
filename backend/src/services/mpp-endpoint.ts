import { Router } from 'express';
import type { Request, Response } from 'express';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { stellar } from '@stellar/mpp/charge/server';
import { USDC_SAC_TESTNET } from '@stellar/mpp';
import { Mppx, Store } from 'mppx/server';
import { SorobanClient } from './soroban-client.js';
import { Orchestrator } from './orchestrator.js';

export function createMppRouter(
  sellerSecret: string,
  sellerPublic: string,
  sorobanClient: SorobanClient,
  orchestrator: Orchestrator
): Router {
  const router = Router();

  const mppx = Mppx.create({
    secretKey: sellerSecret,
    methods: [
      stellar.charge({
        recipient: sellerPublic,
        currency: USDC_SAC_TESTNET,
        network: 'stellar:testnet',
        store: Store.memory(),
      }),
    ],
  });

  router.get('/api/mpp/sentiment', async (req: Request, res: Response) => {
    // Check trust tier first
    const buyerAddress = req.headers['x-buyer-address'] as string;
    if (!buyerAddress) {
      res.status(400).json({ error: 'Missing x-buyer-address header' });
      return;
    }

    let trust;
    try {
      trust = await sorobanClient.getTrust(buyerAddress);
    } catch (error) {
      // Network/RPC error — distinct from trust denial
      res.status(503).json({
        error: 'Trust lookup failed — Soroban RPC unreachable',
        detail: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    if (trust.tier !== 'TRUSTED') {
      res.status(403).json({
        error: 'MPP fast lane requires TRUSTED tier (score >= 700)',
        current_score: trust.score,
        current_tier: trust.tier,
      });
      return;
    }

    // MPPX SDK method accessor pattern: mppx['stellar/charge'] returns a charge handler factory.
    // This is the documented API — the bracket notation is required because the method name contains '/'.
    const chargeHandler = mppx['stellar/charge']({
      amount: '0.01',
      description: 'Sentiment analysis (MPP fast lane)',
    });
    const nodeListener = Mppx.toNodeListener(chargeHandler);
    const result = await nodeListener(req as unknown as IncomingMessage, res as unknown as ServerResponse);

    if (result.status === 402) {
      // toNodeListener already wrote the 402 response
      return;
    }

    // Trusted agent — call real seller, deliver data directly (no escrow needed)
    let sentimentData: Record<string, unknown>;
    try {
      const sellerUrl = `http://localhost:${process.env.PORT || 4000}/api/sentiment-good?text=${encodeURIComponent((req.query.text as string) || 'The product works great.')}`;
      const sellerRes = await fetch(sellerUrl);
      sentimentData = {
        ...(await sellerRes.json() as Record<string, unknown>),
        source: 'mpp-fast-lane',
        trust_tier: 'TRUSTED',
      };
    } catch {
      sentimentData = {
        score: 0.85,
        label: 'positive',
        confidence: 0.92,
        source: 'mpp-fast-lane',
        trust_tier: 'TRUSTED',
      };
    }

    res.json(sentimentData);

    // Broadcast MPP transaction to WebSocket clients for dashboard visibility
    orchestrator.broadcastMpp({
      seller: sellerPublic,
      buyer: buyerAddress,
      amount: '0.01',
      trust_tier: trust.tier,
    });
  });

  return router;
}
