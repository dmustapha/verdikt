import { Router } from 'express';
import { ServiceCatalogEntry } from '../types.js';

export function createServiceRouter(): Router {
  const router = Router();

  const catalog: ServiceCatalogEntry[] = [
    {
      endpoint: '/api/sentiment',
      method: 'GET',
      description: 'AI sentiment analysis with escrow protection',
      price_usdc: '0.01',
      payment_protocol: 'x402',
      schema: {
        score: { type: 'number', min: -1, max: 1 },
        label: { type: 'string', enum: ['positive', 'negative', 'neutral'] },
        confidence: { type: 'number', min: 0, max: 1 },
      },
      trust_requirement: null,
    },
    {
      endpoint: '/api/mpp/sentiment',
      method: 'GET',
      description: 'Fast-lane sentiment analysis for trusted agents (no escrow)',
      price_usdc: '0.01',
      payment_protocol: 'mpp',
      schema: {
        score: { type: 'number', min: -1, max: 1 },
        label: { type: 'string', enum: ['positive', 'negative', 'neutral'] },
        confidence: { type: 'number', min: 0, max: 1 },
      },
      trust_requirement: { min_tier: 'TRUSTED' as const, min_score: 700 },
    },
  ];

  router.get('/api/services', (_req, res) => {
    res.json(catalog);
  });

  return router;
}
