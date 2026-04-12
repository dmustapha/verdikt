import { Router } from 'express';
import type { Request, Response } from 'express';
import { SorobanClient } from '../services/soroban-client.js';
import { Orchestrator } from '../services/orchestrator.js';
import { TrustLookupResponse } from '../types.js';

export function createTrustRouter(sorobanClient: SorobanClient, orchestrator: Orchestrator): Router {
  const router = Router();

  router.get('/api/trust/:address', async (req: Request, res: Response) => {
    const address = req.params['address'] as string;

    try {
      const trust = await sorobanClient.getTrust(address);

      // If Soroban returns 0 but we have a local cache with a real score,
      // prefer the local value — the contract's cross-contract update_trust
      // doesn't persist, so on-chain 0 is stale.
      const local = orchestrator.getLocalTrust(address);
      if (trust.score === 0 && local && local.score > 0) {
        const response: TrustLookupResponse = {
          address,
          trust: { ...local, total_tx: trust.total_tx, successful: trust.successful, disputes_lost: trust.disputes_lost },
          is_trusted: local.tier === 'TRUSTED',
        };
        res.json(response);
        return;
      }

      const response: TrustLookupResponse = {
        address,
        trust,
        is_trusted: trust.tier === 'TRUSTED',
      };
      res.json(response);
    } catch (error) {
      // Fallback to local trust cache when Soroban is unreachable
      const local = orchestrator.getLocalTrust(address);
      if (local) {
        const response: TrustLookupResponse = {
          address,
          trust: { ...local, total_tx: 0, successful: 0, disputes_lost: 0 },
          is_trusted: local.tier === 'TRUSTED',
        };
        res.json(response);
        return;
      }
      res.status(500).json({
        error: 'Failed to lookup trust',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
