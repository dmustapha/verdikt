import { Router } from 'express';
import { TransactionStore } from '../services/transaction-store.js';

export function createHistoryRouter(store: TransactionStore): Router {
  const router = Router();

  router.get('/api/history/:address', (req, res) => {
    const entries = store.getByAddress(req.params.address);
    res.json(entries);
  });

  router.get('/api/history', (_req, res) => {
    res.json(store.getAll());
  });

  return router;
}
