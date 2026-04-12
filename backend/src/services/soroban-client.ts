import {
  Contract,
  Keypair,
  TransactionBuilder,
  Networks,
  rpc,
  xdr,
  Address,
  nativeToScVal,
  scValToNative,
} from '@stellar/stellar-sdk';
import { EvidenceInput, Verdict, TrustData, TrustTier } from '../types.js';
import crypto from 'node:crypto';

export class SorobanClient {
  private keypair: Keypair;
  private rpc: rpc.Server;
  private networkPassphrase = Networks.TESTNET;
  private evidenceRegistryId: string;
  private disputeResolutionId: string;
  private trustLedgerId: string;

  // Sequential transaction lock — prevents concurrent getAccount() from returning
  // the same sequence number, which causes tx_bad_seq on Soroban.
  private txLock: Promise<void> = Promise.resolve();

  private async withTxLock<T>(fn: () => Promise<T>): Promise<T> {
    let release: () => void = () => {};
    const next = new Promise<void>((r) => { release = r; });
    const prev = this.txLock;
    this.txLock = next;
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  constructor(
    arbiterSecret: string,
    sorobanRpcUrl: string,
    evidenceRegistryId: string,
    disputeResolutionId: string,
    trustLedgerId: string
  ) {
    this.keypair = Keypair.fromSecret(arbiterSecret);
    this.rpc = new rpc.Server(sorobanRpcUrl);
    this.evidenceRegistryId = evidenceRegistryId;
    this.disputeResolutionId = disputeResolutionId;
    this.trustLedgerId = trustLedgerId;
  }

  get publicKey(): string {
    return this.keypair.publicKey();
  }

  async storeEvidence(evidence: EvidenceInput): Promise<number> {
    const args = [
      new Address(this.keypair.publicKey()).toScVal(), // caller
      nativeToScVal(Buffer.from(evidence.tx_hash, 'hex'), { type: 'bytes' }), // tx_hash: BytesN<32>
      nativeToScVal(Buffer.from(evidence.request_hash, 'hex'), { type: 'bytes' }), // request_hash: BytesN<32>
      nativeToScVal(Buffer.from(evidence.response_hash, 'hex'), { type: 'bytes' }), // response_hash: BytesN<32>
      new Address(evidence.buyer).toScVal(), // buyer
      new Address(evidence.seller).toScVal(), // seller
    ];

    const result = await this.invokeContract(
      this.evidenceRegistryId,
      'store_evidence',
      args
    );
    return Number(scValToNative(result));
  }

  async recordVerdict(
    evidenceId: number,
    seller: string,
    checksPassed: number,
    checksTotal: number,
    verdict: Verdict
  ): Promise<number> {
    // Soroban contracttype unit-variant enums encode as ScvVec([ScvSymbol(name)])
    const verdictName = verdict === 'VALID' ? 'Valid' : verdict === 'PARTIAL' ? 'Partial' : 'Guilty';
    const verdictScVal = xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(verdictName)]);

    const args = [
      new Address(this.keypair.publicKey()).toScVal(), // arbiter
      nativeToScVal(evidenceId, { type: 'u64' }), // evidence_id
      new Address(seller).toScVal(), // seller
      nativeToScVal(checksPassed, { type: 'u32' }), // checks_passed
      nativeToScVal(checksTotal, { type: 'u32' }), // checks_total
      verdictScVal, // verdict
    ];

    const result = await this.invokeContract(
      this.disputeResolutionId,
      'record_verdict',
      args
    );
    return Number(scValToNative(result));
  }

  async getTrust(agentAddress: string): Promise<TrustData> {
    const args = [new Address(agentAddress).toScVal()];

    const result = await this.invokeContract(
      this.trustLedgerId,
      'get_trust',
      args,
      true // simulate only — read-only call
    );

    const raw = scValToNative(result) as {
      score: bigint;
      total_tx: bigint;
      successful: bigint;
      disputes_lost: bigint;
      tier: { toString(): string };
    };

    const score = Number(raw.score);
    let tier: TrustTier = 'UNTRUSTED';
    if (score >= 700) tier = 'TRUSTED';
    else if (score >= 300) tier = 'STANDARD';

    return {
      score,
      total_tx: Number(raw.total_tx),
      successful: Number(raw.successful),
      disputes_lost: Number(raw.disputes_lost),
      tier,
    };
  }

  private async invokeContract(
    contractId: string,
    method: string,
    args: xdr.ScVal[],
    simulateOnly = false
  ): Promise<xdr.ScVal> {
    // Read-only calls (simulateOnly) don't need the lock — they don't submit transactions
    if (simulateOnly) {
      return this.withRetry(() => this.invokeContractInner(contractId, method, args, true));
    }
    // Write calls are serialized to prevent sequence number collisions
    return this.withTxLock(() => this.withRetry(() => this.invokeContractInner(contractId, method, args, false)));
  }

  private async withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        const isRetryable = /timeout|ETIMEDOUT|ECONNREFUSED|503|fetch failed/i.test(msg);
        if (!isRetryable || attempt === maxAttempts) throw error;
        const delay = Math.pow(2, attempt - 1) * 1000;
        console.warn(`Soroban RPC retry ${attempt}/${maxAttempts} in ${delay}ms: ${msg}`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw new Error('withRetry: unreachable');
  }

  private async invokeContractInner(
    contractId: string,
    method: string,
    args: xdr.ScVal[],
    simulateOnly: boolean
  ): Promise<xdr.ScVal> {
    const account = await this.rpc.getAccount(this.keypair.publicKey());
    const contract = new Contract(contractId);

    const tx = new TransactionBuilder(account, {
      fee: '100000', // Initial estimate — refined by simulation
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(30)
      .build();

    const simulated = await this.rpc.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(simulated)) {
      throw new Error(`Simulation failed: ${simulated.error}`);
    }

    if (simulateOnly) {
      const successSim = simulated as rpc.Api.SimulateTransactionSuccessResponse;
      if (successSim.result) {
        return successSim.result.retval;
      }
      throw new Error('No result from simulation');
    }

    // assembleTransaction uses simulation-derived fee (includes resource costs)
    const prepared = rpc.assembleTransaction(tx, simulated).build();
    prepared.sign(this.keypair);

    const sendResult = await this.rpc.sendTransaction(prepared);

    if (sendResult.status === 'ERROR') {
      throw new Error(`Transaction send failed: ${sendResult.status}`);
    }

    // Poll for confirmation with timeout (max 30 retries = ~30s)
    let getResult = await this.rpc.getTransaction(sendResult.hash);
    let pollAttempts = 0;
    const maxPollAttempts = 30;
    while (getResult.status === 'NOT_FOUND') {
      if (++pollAttempts >= maxPollAttempts) {
        throw new Error(`Transaction ${sendResult.hash} timed out after ${maxPollAttempts}s`);
      }
      await new Promise((r) => setTimeout(r, 1000));
      getResult = await this.rpc.getTransaction(sendResult.hash);
    }

    if (getResult.status === 'SUCCESS' && getResult.returnValue) {
      return getResult.returnValue;
    }

    throw new Error(`Transaction failed: ${getResult.status}`);
  }

  // Utility: hash a string to hex for evidence
  static hashString(input: string): string {
    return crypto.createHash('sha256').update(input).digest('hex');
  }
}
