import {
  Keypair,
  Horizon,
  Networks,
  TransactionBuilder,
  Operation,
  Asset,
} from '@stellar/stellar-sdk';
import { AgentRecord } from '../types.js';

const FRIENDBOT_URL = 'https://friendbot.stellar.org';
const USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const USDC = new Asset('USDC', USDC_ISSUER);

export class AgentManager {
  private agents = new Map<string, AgentRecord>();
  private horizon: Horizon.Server;

  constructor(horizonUrl: string) {
    this.horizon = new Horizon.Server(horizonUrl);
  }

  async onboard(label?: string): Promise<AgentRecord> {
    const keypair = Keypair.random();
    const address = keypair.publicKey();

    // Fund with Friendbot
    const res = await fetch(`${FRIENDBOT_URL}?addr=${address}`);
    if (!res.ok) {
      const text = await res.text();
      if (!text.includes('createAccountAlreadyExist')) {
        throw new Error(`Friendbot failed: ${text}`);
      }
    }

    // Add USDC trustline
    const account = await this.horizon.loadAccount(address);
    const fee = await this.horizon.fetchBaseFee();
    const tx = new TransactionBuilder(account, {
      fee: String(fee),
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(Operation.changeTrust({ asset: USDC }))
      .setTimeout(30)
      .build();
    tx.sign(keypair);
    await this.horizon.submitTransaction(tx);

    const secret = keypair.secret();
    const record: AgentRecord = {
      address,
      secret: '', // never stored — returned once on onboard only
      label: label || `Agent-${address.slice(0, 6)}`,
      onboarded_at: Date.now(),
      role: 'agent',
    };

    this.agents.set(address, record);
    return { ...record, secret }; // one-time return with secret
  }

  getAgent(address: string): AgentRecord | undefined {
    return this.agents.get(address);
  }

  listAgents(): AgentRecord[] {
    return Array.from(this.agents.values());
  }
}
