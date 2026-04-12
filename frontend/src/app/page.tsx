'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { BuyerPanel } from './components/BuyerPanel';
import { JudgePanel } from './components/JudgePanel';
import { SellerPanel } from './components/SellerPanel';
import { QualityChecks } from './components/QualityChecks';
import { VerdictBanner } from './components/VerdictBanner';
import { TrustBar } from './components/TrustBar';
import { ProofStrip } from './components/ProofStrip';
import { useCourtroomState } from './hooks/useCourtroomReducer';
import { useWebSocket } from './providers/WebSocketProvider';
import Link from 'next/link';
import type { AgentRecord, TrustTier, WSEvent } from '../types';
import { Tip } from './components/Tip';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

export default function CourtroomPage() {
  const [state, dispatch] = useCourtroomState();
  const isBulkRunning = useRef(false);
  const safetyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPanelTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { addListener } = useWebSocket();
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [selectedBuyer, setSelectedBuyer] = useState('');
  const [selectedSeller, setSelectedSeller] = useState('');
  const [contractInfo, setContractInfo] = useState<{
    escrow: string;
    contracts: { evidence_registry: string; dispute_resolution: string; trust_ledger: string };
  } | null>(null);
  const [escrowBalance, setEscrowBalance] = useState<string | null>(null);
  const [balancePulsed, setBalancePulsed] = useState(false);
  const prevBalance = useRef<string>('');
  const balanceSeq = useRef(0);
  const [showCustom, setShowCustom] = useState(false);
  const [customStatus, setCustomStatus] = useState(200);
  const [customBody, setCustomBody] = useState('');
  const [activeScenario, setActiveScenario] = useState<string>('good');

  const {
    phase, checks, verdict, narration, trustUpdate, escrowAction,
    buyerActive, sellerActive, sellerBad, isRunning,
    checksPassed, checksTotal, currentTx, x402PaymentPhase,
  } = state;

  // Listen to WS events via shared provider
  useEffect(() => {
    const remove = addListener((msg: WSEvent) => {
      dispatch({ type: 'WS_EVENT', event: msg, isBulkRunning: isBulkRunning.current });

      if (msg.type === 'transaction_complete') {
        if (safetyTimeout.current) { clearTimeout(safetyTimeout.current); safetyTimeout.current = null; }
        if (clearPanelTimeout.current) clearTimeout(clearPanelTimeout.current);
        clearPanelTimeout.current = setTimeout(() => dispatch({ type: 'CLEAR_ACTIVE_PANELS' }), 3000);
      }
      if (msg.type === 'trust_unlock_complete') {
        if (safetyTimeout.current) { clearTimeout(safetyTimeout.current); safetyTimeout.current = null; }
        isBulkRunning.current = false;
      }
    });
    return () => {
      remove();
      if (clearPanelTimeout.current) { clearTimeout(clearPanelTimeout.current); clearPanelTimeout.current = null; }
    };
  }, [addListener, dispatch]);

  // Fetch agents and trust score on mount
  useEffect(() => {
    (async () => {
      try {
        const agentsRes = await fetch(`${BACKEND_URL}/api/agents`);
        if (!agentsRes.ok) return;
        const agentsData: AgentRecord[] = await agentsRes.json();
        setAgents(agentsData);
        const seller = agentsData.find(a => a.role === 'seller');
        if (!seller) return;
        const trustRes = await fetch(`${BACKEND_URL}/api/trust/${seller.address}`);
        const trustData = await trustRes.json();
        const t = trustData.trust;
        if (t?.score !== undefined && t.score > 0) {
          dispatch({
            type: 'INIT_TRUST',
            trust: { old_score: t.score, new_score: t.score, old_tier: t.tier as TrustTier, new_tier: t.tier as TrustTier },
          });
        }
      } catch { /* non-critical */ }
      fetch(`${BACKEND_URL}/health`).then(r => r.ok ? r.json() : null).then(d => {
        if (d?.escrow && d?.contracts) setContractInfo({ escrow: d.escrow, contracts: d.contracts });
      }).catch(() => {});
    })();
  }, [dispatch]);

  const runDemo = useCallback(
    async (type: 'good' | 'bad' | 'partial') => {
      if (isRunning) return;
      dispatch({ type: 'RESET_FOR_DEMO' });
      if (safetyTimeout.current) clearTimeout(safetyTimeout.current);
      safetyTimeout.current = setTimeout(() => {
        dispatch({ type: 'SET_RUNNING', running: false });
        safetyTimeout.current = null;
      }, 45_000);
      try {
        await fetch(`${BACKEND_URL}/api/demo/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type,
            ...(selectedBuyer && { buyer: selectedBuyer }),
            ...(selectedSeller && { seller: selectedSeller }),
          }),
        });
      } catch (error) {
        console.error('Demo request failed:', error);
        dispatch({ type: 'SET_RUNNING', running: false });
      }
    },
    [isRunning, dispatch, selectedBuyer, selectedSeller]
  );

  const runTrustUnlock = useCallback(async () => {
    if (isRunning) return;
    dispatch({ type: 'SET_RUNNING', running: true });
    isBulkRunning.current = true;
    if (safetyTimeout.current) clearTimeout(safetyTimeout.current);
    safetyTimeout.current = setTimeout(() => {
      dispatch({ type: 'SET_RUNNING', running: false });
      isBulkRunning.current = false;
      safetyTimeout.current = null;
    }, 300_000);
    try {
      await fetch(`${BACKEND_URL}/api/demo/trust-unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 75, ...(selectedSeller && { seller: selectedSeller }) }),
      });
    } catch (error) {
      console.error('Trust unlock failed:', error);
      dispatch({ type: 'SET_RUNNING', running: false });
    }
  }, [isRunning, dispatch, selectedSeller]);

  const runCustomScenario = useCallback(async () => {
    if (isRunning) return;
    dispatch({ type: 'RESET_FOR_DEMO' });
    if (safetyTimeout.current) clearTimeout(safetyTimeout.current);
    safetyTimeout.current = setTimeout(() => {
      dispatch({ type: 'SET_RUNNING', running: false });
      safetyTimeout.current = null;
    }, 45_000);
    try {
      await fetch(`${BACKEND_URL}/api/demo/custom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ httpStatus: customStatus, responseBody: customBody }),
      });
    } catch (error) {
      console.error('Custom scenario failed:', error);
      dispatch({ type: 'SET_RUNNING', running: false });
    }
  }, [isRunning, dispatch, customStatus, customBody]);

  // Poll escrow balance every 3s
  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      const seq = ++balanceSeq.current;
      try {
        const res = await fetch(`${BACKEND_URL}/api/escrow/balance`);
        if (!res.ok || !mounted || seq !== balanceSeq.current) return;
        const { usdc_balance } = await res.json();
        const balance = String(usdc_balance);
        if (balance !== prevBalance.current) {
          if (mounted) setBalancePulsed(true);
          setTimeout(() => { if (mounted) setBalancePulsed(false); }, 1200);
          prevBalance.current = balance;
        }
        if (mounted) setEscrowBalance(balance);
      } catch { /* non-critical */ }
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  // Read ?seller= URL param on mount to pre-select seller
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sellerParam = params.get('seller');
    if (sellerParam) setSelectedSeller(sellerParam);
  }, []);

  /* Derived flow state */
  const flowStatus =
    phase === 'payment' ? 'Payment in transit...'
    : phase === 'seller_response' ? 'Seller responding...'
    : phase === 'checking' ? 'Quality gate running...'
    : phase === 'verdict' ? 'Verdict rendered'
    : phase === 'escrow' ? 'Escrow settling...'
    : phase === 'narration' || phase === 'complete' ? 'Complete'
    : 'Idle';

  const flowVerdictText = verdict || '\u2014';
  const settlementText = escrowAction
    ? escrowAction === 'release' ? 'Released'
      : escrowAction === 'refund' ? 'Refunded'
      : escrowAction === 'split' ? 'Split 50/50'
      : 'Settled'
    : '\u2014';

  const trustScore = trustUpdate?.new_score ?? 300;
  const isMpp = trustScore >= 700;

  const flowActiveNode =
    phase === 'payment' ? 1
    : phase === 'seller_response' ? 2
    : phase === 'checking' ? 4
    : phase === 'verdict' ? 5
    : phase === 'escrow' ? 6
    : phase === 'narration' ? 7
    : null;

  const escrowIsActive = !isMpp && phase !== 'idle' && phase !== 'payment' && phase !== 'seller_response';

  // Truncate address helper
  const addr = (s: string) => s ? `${s.slice(0, 4)}...${s.slice(-4)}` : '\u2014';

  const FLOW_STEPS = [
    { num: 1, label: 'Buyer Request', sub: 'x402 initiated', color: 'emerald' },
    { num: 2, label: 'Payment', sub: 'USDC transfer', color: 'emerald' },
    { num: 3, label: 'Escrow', sub: isMpp ? 'Skipped' : 'Funds locked', color: 'emerald' },
    { num: 4, label: 'Quality Check', sub: 'AI evaluation', color: 'gold' },
    { num: 5, label: 'Verdict', sub: 'Judge rules', color: 'gold' },
    { num: 6, label: 'On-Chain', sub: 'Record sealed', color: 'emerald' },
    { num: 7, label: 'Settlement', sub: 'Funds released', color: 'emerald' },
  ];

  const SCENARIOS = [
    { id: 'good', label: 'Honest Sale', desc: 'Legitimate transaction, full payment release', dotColor: '#34d399', action: () => runDemo('good') },
    { id: 'bad', label: 'Fraudulent Sale', desc: 'Bad delivery, buyer gets refunded', dotColor: '#f87171', action: () => runDemo('bad') },
    { id: 'partial', label: 'Ambiguous Delivery', desc: 'Partial quality, payment split', dotColor: '#fbbf24', action: () => runDemo('partial') },
    { id: 'trust', label: 'Build Reputation', desc: '5 honest sales to unlock Trusted tier', dotColor: '#34d399', action: runTrustUnlock },
    { id: 'custom', label: 'Custom Scenario', desc: 'Enter your own text for analysis', dotColor: '#7b9ec4', action: () => setShowCustom(c => !c) },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--vk-bg)' }}>

      {/* HERO */}
      <section className="vk-hero vk-animate-in">
        <div style={{ maxWidth: 700, position: 'relative', zIndex: 1 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 16px', borderRadius: 20,
            background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.2)',
            color: '#34d399', fontSize: 13, marginBottom: 24,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399' }} />
            Powered by x402 + Stellar
          </div>
          <h1 className="vk-serif-bold" style={{
            fontSize: 'clamp(40px, 5vw, 60px)', fontWeight: 700,
            lineHeight: 1.08, letterSpacing: '-0.02em', marginBottom: 20,
            color: 'var(--vk-text)',
          }}>
            AI Agents Deserve<br />
            <span style={{ color: '#34d399' }}>Fair Verdicts</span>
          </h1>
          <p style={{ fontSize: 17, color: 'var(--vk-text-sec)', maxWidth: 540, lineHeight: 1.7, marginBottom: 32 }}>
            On-chain dispute resolution powered by <Tip term="x402" tip="HTTP 402-based payment protocol — machines pay machines automatically" /> micropayments and the <Tip term="Stellar" tip="A fast, low-cost blockchain network for payments and smart contracts" /> network.
            Every transaction judged. Every agent accountable.
          </p>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <a href="#demo" className="vk-btn-primary" style={{ textDecoration: 'none' }}>
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" /></svg>
              Try the Demo
            </a>
            <Link href="/agents" className="vk-btn-secondary" style={{ textDecoration: 'none' }}>
              Register an Agent
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            </Link>
          </div>
        </div>
      </section>

      {/* INTEGRATION BAR */}
      <div className="vk-animate-in vk-delay-1" style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center',
        gap: 12, padding: '16px 24px',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 20px', borderRadius: 12,
          background: 'var(--vk-bg-elev2)', border: '1px solid var(--vk-border)',
        }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#34d399' }} />
          <span style={{ color: 'var(--vk-text-sec)', fontSize: 13 }}>On-Chain Contracts</span>
          {contractInfo && (
            <a
              href={`https://stellar.expert/explorer/testnet/contract/${contractInfo.contracts.evidence_registry}`}
              target="_blank" rel="noopener noreferrer"
              className="vk-font-data"
              style={{ color: '#34d399', fontSize: 12, textDecoration: 'none' }}
            >
              {addr(contractInfo.contracts.evidence_registry)}
            </a>
          )}
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 20px', borderRadius: 12,
          background: 'var(--vk-bg-elev2)', border: '1px solid var(--vk-border)',
        }}>
          <span style={{ color: 'var(--vk-text-sec)', fontSize: 13 }}>Escrow Balance</span>
          <span className={`vk-font-data${balancePulsed ? ' vk-balance-pulsed' : ''}`} style={{ color: 'var(--vk-text)', fontSize: 13 }}>
            {escrowBalance ? `${parseFloat(escrowBalance).toFixed(2)} USDC` : '—'}
          </span>
        </div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '8px 16px', borderRadius: 20,
          background: 'linear-gradient(135deg,rgba(16,185,129,.06),rgba(201,149,58,.06))',
          border: '1px solid var(--vk-border)',
        }}>
          <svg width="14" height="14" fill="#34d399" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          <span style={{ color: '#34d399', fontSize: 12, fontWeight: 500 }}>MPP Fast Lane</span>
        </div>
      </div>

      <main>
      {/* DEMO CONTROLS — Scenario Grid */}
      <section id="demo" className="vk-animate-in vk-delay-2" style={{ padding: '0 24px 24px' }} aria-label="Demo scenario controls">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <h2 className="vk-serif" style={{ fontSize: 20, fontWeight: 600, color: 'var(--vk-text)' }}>Run a Scenario</h2>
          <span style={{ color: 'var(--vk-text-muted)', fontSize: 13 }}>(simulated demo)</span>
          {isRunning && <span className="vk-dot" />}
        </div>

        {/* Agent selectors */}
        {agents.length > 0 && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <select value={selectedBuyer} onChange={e => setSelectedBuyer(e.target.value)} className="vk-form-select" style={{ width: 'auto', minWidth: 180, height: 40 }}>
              <option value="">Default Buyer</option>
              {agents.filter(a => a.role === 'buyer' || a.role === 'agent').map(a => (
                <option key={a.address} value={a.address}>{a.label || addr(a.address)}</option>
              ))}
            </select>
            <select value={selectedSeller} onChange={e => setSelectedSeller(e.target.value)} className="vk-form-select" style={{ width: 'auto', minWidth: 180, height: 40 }}>
              <option value="">Default Seller</option>
              {agents.filter(a => a.role === 'seller' || a.role === 'agent').map(a => (
                <option key={a.address} value={a.address}>{a.label || addr(a.address)}</option>
              ))}
            </select>
          </div>
        )}

        <div className="vk-scenario-grid" role="group" aria-label="Scenario selection">
          {SCENARIOS.map(s => (
            <button
              key={s.id}
              className={`vk-scenario-btn${activeScenario === s.id ? ' active' : ''}`}
              onClick={() => { setActiveScenario(s.id); s.action(); }}
              disabled={isRunning && s.id !== 'custom'}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.dotColor, flexShrink: 0 }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--vk-text)' }}>{s.label}</span>
              <span style={{ fontSize: 12, color: 'var(--vk-text-muted)', lineHeight: 1.4 }}>{s.desc}</span>
            </button>
          ))}
        </div>
      </section>

      {/* CUSTOM SCENARIO PANEL */}
      {showCustom && (
        <div style={{ padding: '16px 24px', background: 'var(--vk-bg-elev2)', borderTop: '1px solid var(--vk-border)', borderBottom: '1px solid var(--vk-border)', animation: 'vk-fade-in 0.2s ease both' }}>
          <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11, color: 'var(--vk-text-muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Simulate Response</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {([{ code: 200, label: '200 OK' }, { code: 400, label: '400 Bad Request' }, { code: 500, label: '500 Server Error' }] as const).map(({ code, label }) => (
                  <button
                    key={code}
                    className={`vk-scenario-btn${customStatus === code ? ' active' : ''}`}
                    style={{ padding: '8px 14px', minHeight: 36, fontSize: 13 }}
                    onClick={() => setCustomStatus(code)}
                  >{label}</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11, color: 'var(--vk-text-muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Response Type</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[
                  { label: 'Valid Response', body: '{"score":0.85,"label":"positive","confidence":0.92}' },
                  { label: 'Empty Response', body: '' },
                  { label: 'Corrupt Data', body: 'not valid json!!!' },
                ].map(({ label, body }) => (
                  <button key={label} className="vk-scenario-btn" style={{ padding: '8px 14px', minHeight: 36, fontSize: 13 }} onClick={() => setCustomBody(body)}>{label}</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 11, color: 'var(--vk-text-muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Response Body</div>
              <textarea
                value={customBody}
                onChange={e => setCustomBody(e.target.value)}
                rows={2}
                className="vk-form-input"
                style={{ height: 'auto', padding: '10px 16px', fontFamily: 'var(--font-data)', fontSize: 12, resize: 'vertical' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', paddingTop: 22 }}>
              <button className="vk-btn-primary" style={{ padding: '10px 20px', fontSize: 14 }} onClick={runCustomScenario} disabled={isRunning}>
                Run Trial &rarr;
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE TRANSACTION CONTEXT */}
      {phase !== 'idle' && currentTx.buyer && (
        <div style={{
          padding: '10px 24px', display: 'flex', gap: 20, justifyContent: 'center',
          flexWrap: 'wrap', fontSize: 13, color: 'var(--vk-text-muted)',
          background: 'var(--vk-bg-elev)', borderBottom: '1px solid var(--vk-border)',
        }}>
          <span>Buyer: <span style={{ color: 'var(--vk-text-sec)' }}>{agents.find(a => a.address === currentTx.buyer)?.label || addr(currentTx.buyer)}</span></span>
          <span>Seller: <span style={{ color: 'var(--vk-text-sec)' }}>{agents.find(a => a.address === currentTx.seller)?.label || addr(currentTx.seller)}</span></span>
          <span>Amount: <span style={{ color: 'var(--vk-emerald-400)' }}>${currentTx.amount} USDC</span></span>
          <span>Service: <span style={{ color: 'var(--vk-text-sec)' }}>{currentTx.endpoint === '/api/sentiment' ? 'Sentiment Analysis' : currentTx.endpoint === '/api/mpp/sentiment' ? 'Sentiment Analysis (Fast Lane)' : currentTx.endpoint}</span></span>
        </div>
      )}

      {/* PAYMENT FLOW PIPELINE — Numbered Circles */}
      <section className="vk-animate-in vk-delay-3" style={{ padding: '24px' }} aria-label="Payment flow pipeline">
        <div style={{
          width: '100%', overflowX: 'auto',
          borderRadius: 16, padding: 20,
          background: 'var(--vk-bg-elev2)', border: '1px solid var(--vk-border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--vk-text-muted)' }}>{flowStatus}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, minWidth: 700 }}>
            {FLOW_STEPS.map((step, i) => {
              const isActive = flowActiveNode === step.num;
              const isPast = flowActiveNode !== null && step.num < flowActiveNode;
              const isLit = isActive || isPast;
              const isSkipped = step.num === 3 && isMpp;
              const colorClass = step.color === 'gold' ? 'vk-flow-circle-gold' : 'vk-flow-circle-emerald';
              const circleClass = `vk-flow-circle ${isLit ? colorClass : 'vk-flow-circle-dim'}${isActive ? ' vk-flow-circle-active' : ''}`;
              const connectorLit = flowActiveNode !== null && step.num < flowActiveNode;
              return (
                <div key={step.num} style={{ display: 'contents' }}>
                  <div style={{ flex: 1, textAlign: 'center', opacity: isSkipped ? 0.3 : 1 }}>
                    <div className={circleClass}>
                      {step.num}
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 500, color: isLit ? 'var(--vk-text)' : 'var(--vk-text-muted)' }}>{step.label}</p>
                    <p style={{ fontSize: 11, color: 'var(--vk-text-muted)', marginTop: 2 }}>{step.sub}</p>
                  </div>
                  {i < FLOW_STEPS.length - 1 && (
                    <div className={`vk-flow-connector ${connectorLit ? (step.color === 'gold' || FLOW_STEPS[i + 1].color === 'gold' ? 'vk-flow-connector-gold' : 'vk-flow-connector-emerald') : 'vk-flow-connector-dim'}`} aria-hidden="true" />
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
            <span className={`vk-mpp-badge${isMpp ? ' active' : ''}`}>
              <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              <span style={{ fontWeight: 700, letterSpacing: 2 }}>FAST LANE</span>
              <span style={{ opacity: 0.7 }}>{'\u2014'} Trusted agents bypass escrow for instant settlement</span>
            </span>
          </div>
        </div>
      </section>

      {/* BENTO COURTROOM */}
      <section className="vk-animate-in vk-delay-4" style={{ padding: '0 24px 24px' }} aria-label="Live Courtroom">
        <h2 className="vk-serif" style={{ fontSize: 24, fontWeight: 600, color: 'var(--vk-text)', marginBottom: 16 }}>The Courtroom</h2>
        <div className="vk-bento">
          <BuyerPanel active={buyerActive} phase={phase} escrowAction={escrowAction} label={agents.find(a => a.address === currentTx.buyer)?.label} address={currentTx.buyer} amount={currentTx.amount} />
          <JudgePanel phase={phase} narration={narration}>
            <QualityChecks checks={checks} />
            <VerdictBanner verdict={verdict} checksPassed={checksPassed} checksTotal={checksTotal} />
          </JudgePanel>
          <SellerPanel active={sellerActive} isBad={sellerBad} phase={phase} verdict={verdict} label={agents.find(a => a.address === currentTx.seller)?.label} address={currentTx.seller} />

          {/* Stat: Amount */}
          <div className="vk-panel-card" style={{ padding: 16 }}>
            <p style={{ fontSize: 11, color: 'var(--vk-text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Amount</p>
            <p className="vk-font-data" style={{ fontSize: 28, fontWeight: 500, color: 'var(--vk-text)' }}>
              {currentTx.amount ? parseFloat(currentTx.amount).toFixed(2) : '0.01'}
            </p>
            <p style={{ fontSize: 12, color: 'var(--vk-text-muted)', marginTop: 4 }}>USDC via x402</p>
          </div>
          {/* Stat: Resolution */}
          <div className="vk-panel-card" style={{ padding: 16 }}>
            <p style={{ fontSize: 11, color: 'var(--vk-text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Resolution</p>
            <p className="vk-font-data" style={{ fontSize: 28, fontWeight: 500, color: 'var(--vk-emerald-400)' }}>1.2s</p>
            <p style={{ fontSize: 12, color: 'var(--vk-text-muted)', marginTop: 4 }}>Avg. dispute time</p>
          </div>
        </div>
      </section>

      {/* TRUST SCORE BAR */}
      <section className="vk-animate-in vk-delay-5" style={{ padding: '0 24px 24px' }}>
        <TrustBar update={trustUpdate} />
      </section>

      {/* ON-CHAIN PROOF STRIP */}
      <section style={{ padding: '0 24px 24px' }}>
        <ProofStrip currentTx={currentTx} phase={phase} />
      </section>

      {/* JOURNEY CTAs */}
      <section className="vk-animate-in vk-delay-5" style={{ padding: '0 24px 48px' }} aria-label="Continue exploring">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          <Link href="/explorer" className="vk-journey-cta">
            <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(16,185,129,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#34d399', flexShrink: 0 }}>
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
            </div>
            <div>
              <h3 className="vk-serif" style={{ fontSize: 18, fontWeight: 600, color: 'var(--vk-text)', marginBottom: 4 }}>
                Explore Transactions
                <svg style={{ display: 'inline', width: 16, height: 16, marginLeft: 4, verticalAlign: 'middle' }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
              </h3>
              <p style={{ fontSize: 13, color: 'var(--vk-text-muted)', lineHeight: 1.5 }}>Browse the full history of verdicts, settlements, and trust score changes on-chain.</p>
            </div>
          </Link>
          <Link href="/agents" className="vk-journey-cta">
            <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(16,185,129,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#34d399', flexShrink: 0 }}>
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /></svg>
            </div>
            <div>
              <h3 className="vk-serif" style={{ fontSize: 18, fontWeight: 600, color: 'var(--vk-text)', marginBottom: 4 }}>
                Register Your Agent
                <svg style={{ display: 'inline', width: 16, height: 16, marginLeft: 4, verticalAlign: 'middle' }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
              </h3>
              <p style={{ fontSize: 13, color: 'var(--vk-text-muted)', lineHeight: 1.5 }}>Onboard your AI agent to the marketplace and start building trust through verified transactions.</p>
            </div>
          </Link>
        </div>
      </section>
      </main>
    </div>
  );
}
