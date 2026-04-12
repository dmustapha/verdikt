import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { createX402Middleware } from './middleware/x402.js';
import { EscrowManager } from './services/escrow-manager.js';
import { SorobanClient } from './services/soroban-client.js';
import { Orchestrator } from './services/orchestrator.js';
import { createDemoRouter } from './routes/demo.js';
import { createTrustRouter } from './routes/trust.js';
import { createGoodSellerRouter } from './endpoints/sentiment-good.js';
import { createBadSellerRouter } from './endpoints/sentiment-bad.js';
import { createMppRouter } from './services/mpp-endpoint.js';
import { AgentManager } from './services/agent-manager.js';
import { TransactionStore } from './services/transaction-store.js';
import { createAgentRouter } from './routes/agents.js';
import { createServiceRouter } from './routes/services.js';
import { createHistoryRouter } from './routes/history.js';
import { VerdiktConfig } from './types.js';
import { SENTIMENT_CONTRACT } from './shared/contracts.js';
import dotenv from 'dotenv';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load .env from project root (one level up from backend/)
dotenv.config({ path: path.resolve(__dirname, '../..', '.env') });
// Also try backend/.env as fallback
dotenv.config();

function loadConfig(): VerdiktConfig {
  const required = [
    'ESCROW_SECRET',
    'ESCROW_PUBLIC',
    'BUYER_SECRET',
    'BUYER_PUBLIC',
    'SELLER_SECRET',
    'SELLER_PUBLIC',
    'EVIDENCE_REGISTRY_ID',
    'DISPUTE_RESOLUTION_ID',
    'TRUST_LEDGER_ID',
  ];

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required env var: ${key}`);
    }
  }

  const optional = ['OZ_API_KEY', 'ANTHROPIC_API_KEY'];
  for (const key of optional) {
    if (!process.env[key]) {
      console.warn(`Optional env var ${key} not set — feature will use fallback`);
    }
  }

  return {
    escrow_secret: process.env.ESCROW_SECRET!,
    escrow_public: process.env.ESCROW_PUBLIC!,
    buyer_secret: process.env.BUYER_SECRET!,
    buyer_public: process.env.BUYER_PUBLIC!,
    seller_secret: process.env.SELLER_SECRET!,
    seller_public: process.env.SELLER_PUBLIC!,
    evidence_registry_id: process.env.EVIDENCE_REGISTRY_ID!,
    dispute_resolution_id: process.env.DISPUTE_RESOLUTION_ID!,
    trust_ledger_id: process.env.TRUST_LEDGER_ID!,
    usdc_sac: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
    oz_facilitator_url:
      process.env.OZ_FACILITATOR_URL ||
      'https://channels.openzeppelin.com/x402/testnet',
    oz_api_key: process.env.OZ_API_KEY || '',
    anthropic_api_key: process.env.ANTHROPIC_API_KEY || '',
    soroban_rpc:
      process.env.SOROBAN_RPC || 'https://soroban-testnet.stellar.org',
    horizon_url:
      process.env.HORIZON_URL || 'https://horizon-testnet.stellar.org',
    network_passphrase: 'Test SDF Network ; September 2015',
  };
}

async function main() {
  const config = loadConfig();
  const app = express();
  const server = createServer(app);

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Initialize services
  const escrowManager = new EscrowManager(config.escrow_secret, config.horizon_url);
  const sorobanClient = new SorobanClient(
    config.escrow_secret, // Escrow account IS the arbiter
    config.soroban_rpc,
    config.evidence_registry_id,
    config.dispute_resolution_id,
    config.trust_ledger_id
  );
  const transactionStore = new TransactionStore(
    path.join(process.cwd(), 'data', 'transactions.json')
  );
  const agentManager = new AgentManager(config.horizon_url);
  const orchestrator = new Orchestrator(
    escrowManager,
    sorobanClient,
    config.anthropic_api_key,
    transactionStore
  );

  // WebSocket server
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws) => {
    console.log('WebSocket client connected');
    orchestrator.addWSClient(ws);
  });

  // x402 middleware (gates /api/sentiment)
  if (config.oz_api_key) {
    try {
      const x402Middleware = createX402Middleware(
        config.escrow_public,
        config.oz_facilitator_url,
        config.oz_api_key
      );
      app.use(x402Middleware);
      console.log('x402 middleware enabled');
    } catch (error) {
      console.warn('x402 middleware failed to initialize:', error);
      console.warn('Continuing without x402 gating — demo routes still work');
    }
  } else {
    console.warn('x402 disabled — OZ_API_KEY not set');
  }

  // x402-gated sentiment endpoint — full pipeline after payment clears
  // x402 middleware already verified payment and settled USDC into escrow.
  // Now: call real seller → quality gate → on-chain evidence → verdict → escrow action.
  // Dashboard sees everything via WebSocket.
  app.get('/api/sentiment', async (req, res) => {
    const buyerAddress = (req.headers['x-buyer-address'] as string) || config.buyer_public;
    const text = (req.query.text as string) || 'The product works great and I love using it every day.';

    // Call real seller endpoint (Claude Haiku sentiment analysis)
    let sellerResponse: globalThis.Response;
    try {
      sellerResponse = await fetch(
        `http://localhost:${process.env.PORT || 4000}/api/sentiment-good?text=${encodeURIComponent(text)}`
      );
    } catch (error) {
      res.status(502).json({ error: 'Failed to reach seller endpoint' });
      return;
    }

    const httpStatus = sellerResponse.status;
    const responseBody = await sellerResponse.text();
    const requestBody = JSON.stringify({ query: text, source: 'x402' });

    // Derive payment reference from x402 header (real Stellar tx settled by facilitator)
    const paymentHeader = (req.headers['payment-signature'] || req.headers['x-payment']) as string | undefined;
    const paymentTxHash = paymentHeader
      ? `x402_${Buffer.from(paymentHeader.slice(0, 32)).toString('hex')}_${Date.now()}`
      : `x402_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    try {
      const result = await orchestrator.processTransaction(
        buyerAddress,
        config.seller_public,
        httpStatus,
        responseBody,
        requestBody,
        '0.01',
        paymentTxHash,
        SENTIMENT_CONTRACT
      );

      res.json(result);
    } catch (error) {
      console.error('x402 pipeline failed:', error);
      res.status(500).json({
        error: 'Transaction processing failed',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Seller endpoints
  app.use(createGoodSellerRouter(config.anthropic_api_key || undefined));
  app.use(createBadSellerRouter());

  // Demo routes
  const port = parseInt(process.env.PORT || '4000', 10);
  app.use(createDemoRouter(orchestrator, config.buyer_public, config.buyer_secret, config.seller_public));

  // Trust lookup (with local fallback when Soroban is unreachable)
  app.use(createTrustRouter(sorobanClient, orchestrator));

  // MPP endpoint
  try {
    app.use(
      createMppRouter(config.seller_secret, config.seller_public, sorobanClient, orchestrator)
    );
    console.log('MPP endpoint enabled');
  } catch (error) {
    console.warn('MPP endpoint failed to initialize:', error);
    console.warn('Continuing without MPP fast lane — demo routes still work');
  }

  // Agent routes (onboard + list, merging demo + onboarded agents)
  const demoAgents = [
    { address: config.buyer_public, role: 'buyer', label: 'Demo Buyer' },
    { address: config.seller_public, role: 'seller', label: 'Demo Seller' },
    { address: config.escrow_public, role: 'escrow', label: 'Escrow / Arbiter' },
  ];
  app.use(createAgentRouter(agentManager, demoAgents));

  // Service catalog
  app.use(createServiceRouter());

  // Transaction history
  app.use(createHistoryRouter(transactionStore));

  // Escrow balance
  app.get('/api/escrow/balance', async (_req, res) => {
    try {
      const balance = await escrowManager.getBalance();
      res.json({ address: config.escrow_public, usdc_balance: balance });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch escrow balance' });
    }
  });

  // Health check
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      escrow: config.escrow_public,
      contracts: {
        evidence_registry: config.evidence_registry_id,
        dispute_resolution: config.dispute_resolution_id,
        trust_ledger: config.trust_ledger_id,
      },
    });
  });

  const PORT = process.env.PORT || 4000;
  server.listen(PORT, () => {
    console.log(`Verdikt backend running on port ${PORT}`);
    console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
    console.log(`Escrow account: ${config.escrow_public}`);
  });
}

main().catch(console.error);
