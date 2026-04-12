import Anthropic from '@anthropic-ai/sdk';
import { CheckResult, Verdict } from '../types.js';

const SYSTEM_PROMPT = `You are the Verdikt Judge — a witty AI magistrate who explains data quality verdicts in plain English with dry humor. Your audience is non-technical humans.

Rules:
- STRICT max 50 words. No exceptions.
- Zero technical jargon. No HTTP, JSON, schema, bytes, API, payload, status codes, or field names.
- Use everyday analogies — like ordering food, receiving a package, or hiring someone.
- Mention what went right and wrong in human terms.
- End with the ruling in one punchy line.
- Personality: dry wit, fair but theatrical. Think TV court show judge.`;

const FALLBACK_TEMPLATES: Record<Verdict, string> = {
  GUILTY:
    'The seller promised a gourmet meal and delivered an empty plate. Five out of six quality checks failed — that\'s not a bad day, that\'s a no-show. Full refund to the buyer. Case dismissed.',
  VALID:
    'Everything checks out — the data arrived on time, in the right shape, with all the right pieces. Six for six. The seller earned this one fair and square. Payment released.',
  PARTIAL:
    'The seller showed up, but only half-dressed. Some things checked out, others didn\'t — like ordering a complete meal and getting just the sides. Payment split 50/50. Neither party walks away thrilled, but that\'s justice.',
};

let client: Anthropic | null = null;

function getClient(apiKey: string): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey });
  }
  return client;
}

export async function narrateVerdict(
  checkResult: CheckResult,
  apiKey: string
): Promise<string> {
  const FRIENDLY_NAMES: Record<string, string> = {
    HTTP_STATUS: 'Seller responded',
    HAS_BODY: 'Data was included',
    VALID_JSON: 'Data was readable',
    SCHEMA_MATCH: 'Data had the right structure',
    FIELDS_PRESENT: 'All required info present',
    VALUE_BOUNDS: 'Values made sense',
  };

  const checksDescription = checkResult.checks
    .map((c) => `${c.passed ? '✓' : '✗'} ${FRIENDLY_NAMES[c.name] || c.name}`)
    .join('\n');

  const verdictAction =
    checkResult.verdict === 'VALID' ? 'Payment released to seller'
    : checkResult.verdict === 'GUILTY' ? 'Full refund to buyer'
    : 'Payment split 50/50';

  const prompt = `Verdict: ${checkResult.verdict} (${checkResult.passed}/${checkResult.total} checks passed)

${checksDescription}

Ruling: ${verdictAction}

Explain this verdict to a non-technical audience in under 50 words. Be specific about what went right or wrong, using plain language. Make it entertaining.`;

  try {
    const anthropic = getClient(apiKey);
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    if (textBlock && textBlock.type === 'text') {
      return textBlock.text;
    }
    return FALLBACK_TEMPLATES[checkResult.verdict];
  } catch (error) {
    console.error('Judge Agent narration failed, using fallback:', error);
    return FALLBACK_TEMPLATES[checkResult.verdict];
  }
}
