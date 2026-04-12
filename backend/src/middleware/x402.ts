import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { ExactStellarScheme } from '@x402/stellar/exact/server';
import { HTTPFacilitatorClient } from '@x402/core/server';

export function createX402Middleware(
  escrowAddress: string,
  facilitatorUrl: string,
  facilitatorApiKey: string
) {
  const facilitatorClient = new HTTPFacilitatorClient({
    url: facilitatorUrl,
    createAuthHeaders: async () => ({
      verify: { Authorization: `Bearer ${facilitatorApiKey}` },
      settle: { Authorization: `Bearer ${facilitatorApiKey}` },
      supported: { Authorization: `Bearer ${facilitatorApiKey}` },
    }),
  });

  const x402Server = new x402ResourceServer(facilitatorClient).register(
    'stellar:testnet',
    new ExactStellarScheme()
  );

  const routes = {
    'GET /api/sentiment': {
      accepts: [
        {
          scheme: 'exact',
          price: '$0.01',
          network: 'stellar:testnet' as `${string}:${string}`,
          payTo: escrowAddress,
        },
      ],
      description: 'Sentiment analysis endpoint (x402 gated)',
    },
  };

  return paymentMiddleware(routes, x402Server);
}
