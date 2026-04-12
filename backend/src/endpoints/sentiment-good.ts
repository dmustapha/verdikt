import { Router } from 'express';
import type { Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';

const FALLBACK_RESPONSE = {
  score: 0.85,
  label: 'positive' as const,
  confidence: 0.92,
};

const SENTIMENT_PROMPT = `Analyze the sentiment of the following text. Respond ONLY with valid JSON matching this exact schema:
{"score": <number between -1 and 1>, "label": "<positive|negative|neutral>", "confidence": <number between 0 and 1>}

Rules:
- score: -1 (most negative) to 1 (most positive)
- label: must be exactly "positive", "negative", or "neutral"
- confidence: 0 (no confidence) to 1 (certain)
- Return ONLY the JSON object, no markdown, no explanation`;

export function createGoodSellerRouter(anthropicApiKey?: string): Router {
  const router = Router();
  let client: Anthropic | null = null;

  if (anthropicApiKey) {
    client = new Anthropic({ apiKey: anthropicApiKey, timeout: 8000 });
  }

  router.get('/api/sentiment-good', async (req: Request, res: Response) => {
    const text = (req.query.text as string) || 'The product works great and I love using it every day.';

    if (!client) {
      res.json(FALLBACK_RESPONSE);
      return;
    }

    try {
      const message = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: [{ role: 'user', content: `${SENTIMENT_PROMPT}\n\nText: "${text}"` }],
      });

      const content = message.content[0];
      if (content.type !== 'text') {
        res.json(FALLBACK_RESPONSE);
        return;
      }

      // Strip markdown code fences if present (e.g. ```json ... ```)
      const raw = content.text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      const parsed = JSON.parse(raw);

      // Validate schema matches contract
      if (
        typeof parsed.score !== 'number' ||
        typeof parsed.confidence !== 'number' ||
        !['positive', 'negative', 'neutral'].includes(parsed.label)
      ) {
        res.json(FALLBACK_RESPONSE);
        return;
      }

      // Clamp values to contract bounds
      parsed.score = Math.max(-1, Math.min(1, parsed.score));
      parsed.confidence = Math.max(0, Math.min(1, parsed.confidence));

      res.json(parsed);
    } catch (error) {
      console.warn('Claude sentiment analysis failed, using fallback:', error instanceof Error ? error.message : error);
      res.json(FALLBACK_RESPONSE);
    }
  });

  return router;
}
