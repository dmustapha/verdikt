import { Router } from 'express';
import { AgentManager } from '../services/agent-manager.js';

export function createAgentRouter(
  agentManager: AgentManager,
  demoAgents: { address: string; role: string; label: string }[]
) {
  const router = Router();

  router.post('/api/agents/onboard', async (req, res) => {
    try {
      const { label } = req.body || {};
      const agent = await agentManager.onboard(label);
      res.json({
        address: agent.address,
        secret: agent.secret,
        label: agent.label,
        instructions: {
          x402: 'GET /api/sentiment?text=<query> with x402 payment header',
          mpp: 'GET /api/mpp/sentiment?text=<query> (requires trust score >= 700)',
          ws: 'Connect to /ws, send {"subscribe":"<your_address>"} for filtered events',
          services: 'GET /api/services for full catalog',
          history: 'GET /api/history/<your_address> for transaction history',
        },
      });
    } catch (error) {
      res.status(500).json({
        error: 'Agent onboarding failed',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.get('/api/agents', (_req, res) => {
    const onboarded = agentManager.listAgents().map((a) => ({
      address: a.address,
      role: a.role,
      label: a.label,
      onboarded_at: a.onboarded_at,
    }));
    res.json([...demoAgents, ...onboarded]);
  });

  return router;
}
