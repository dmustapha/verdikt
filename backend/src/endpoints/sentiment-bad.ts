import { Router } from 'express';
import type { Request, Response } from 'express';

export function createBadSellerRouter(): Router {
  const router = Router();

  router.get('/api/sentiment-bad', (_req: Request, res: Response) => {
    // Garbage response — empty body, wrong content type
    res.status(200).send('');
  });

  return router;
}
