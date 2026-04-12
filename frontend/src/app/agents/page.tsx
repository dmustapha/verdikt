'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useWebSocket } from '../providers/WebSocketProvider';
import type { AgentRecord, ServiceCatalogEntry, TrustTier, WSEvent } from '../../types';
import { getCachedTrust, invalidate } from '../../lib/trustCache';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

interface AgentWithTrust extends AgentRecord {
  score?: number;
  tier?: TrustTier;
  totalTx?: number;
}

interface LiveEvent {
  id: string;
  type: string;
  summary: string;
  timestamp: number;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentWithTrust[]>([]);
  const [services, setServices] = useState<ServiceCatalogEntry[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [onboarding, setOnboarding] = useState(false);
  const [onboardResult, setOnboardResult] = useState<{
    address: string;
    secret: string;
    instructions?: {
      x402: string;
      mpp: string;
      ws: string;
      services: string;
      history: string;
    };
  } | null>(null);
  const [onboardLabel, setOnboardLabel] = useState('');
  const [onboardRole, setOnboardRole] = useState<'buyer' | 'seller'>('buyer');
  const [onboardError, setOnboardError] = useState<string | null>(null);
  const [expandedService, setExpandedService] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [monitorTab, setMonitorTab] = useState<'live' | 'history'>('live');
  const [historyTx, setHistoryTx] = useState<{
    id: string; verdict: string; amount: string; timestamp: number; evidence_id: number;
  }[]>([]);
  const [demoRunning, setDemoRunning] = useState(false);
  const eventSeq = useRef(0);
  const { subscribe, addListener } = useWebSocket();

  const fetchAgents = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/agents`);
      if (!res.ok) return;
      const data: AgentRecord[] = await res.json();
      const enriched = await Promise.all(data.map(async (a) => {
        const trust = await getCachedTrust(a.address);
        if (!trust) return a as AgentWithTrust;
        return { ...a, score: trust.score, tier: trust.tier, totalTx: trust.total_tx } as AgentWithTrust;
      }));
      setAgents(enriched);
    } catch { /* non-critical */ } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchAgentHistory = useCallback(async (address: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/history/${address}`);
      if (res.ok) setHistoryTx(await res.json());
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => {
    fetchAgents();
    fetchServices();
  }, [fetchAgents]);

  const fetchServices = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/services`);
      if (!res.ok) return;
      setServices(await res.json());
    } catch { /* non-critical */ }
  };

  useEffect(() => {
    if (!selectedAgent) return;
    subscribe(selectedAgent);
    setLiveEvents([]);
    setMonitorTab('live');
    setHistoryTx([]);

    const remove = addListener((msg: WSEvent) => {
      if (msg.type === 'trust_update' && msg.data.seller !== selectedAgent) return;
      const summary = summarizeEvent(msg);
      if (!summary) return;
      setLiveEvents(prev => [{
        id: `evt-${++eventSeq.current}`,
        type: msg.type,
        summary,
        timestamp: Date.now(),
      }, ...prev].slice(0, 50));
    });

    return () => {
      remove();
      subscribe(null);
    };
  }, [selectedAgent, subscribe, addListener]);

  // Global trust_update listener
  useEffect(() => {
    return addListener((msg: WSEvent) => {
      if (msg.type !== 'trust_update') return;
      const { seller, new_score, new_tier } = msg.data;
      invalidate(seller);
      setAgents(prev => prev.map(a =>
        a.address === seller ? { ...a, score: new_score, tier: new_tier as TrustTier } : a
      ));
    });
  }, [addListener]);

  const handleOnboard = useCallback(async () => {
    setOnboarding(true);
    setOnboardResult(null);
    setOnboardError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/agents/onboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: onboardLabel || undefined, role: onboardRole }),
      });
      if (!res.ok) {
        const text = await res.text();
        setOnboardError(`Failed to create agent (${res.status}): ${text || 'server error'}`);
        return;
      }
      const data = await res.json();
      setShowSecret(false);
      setOnboardResult({ address: data.address, secret: data.secret, instructions: data.instructions });
      setOnboardLabel('');
      fetchAgents();
    } catch (err) {
      setOnboardError(err instanceof Error ? err.message : 'Network error — is the backend running?');
    } finally {
      setOnboarding(false);
    }
  }, [onboardLabel, fetchAgents]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };
  const addr = (s: string) => s ? `${s.slice(0, 6)}...${s.slice(-4)}` : '—';
  const tierColor = (t?: TrustTier) => t === 'TRUSTED' ? '#34d399' : t === 'STANDARD' ? '#c9953a' : 'var(--vk-text-muted)';

  return (
    <div style={{ minHeight: '100dvh' }}>
      {/* Header — left-aligned */}
      <header style={{ marginBottom: 40 }}>
        <h1 className="vk-serif" style={{ fontSize: 'clamp(36px,4vw,52px)', fontWeight: 700, color: '#eaeaf2', marginBottom: 8 }}>
          Agents
        </h1>
        <p style={{ fontSize: 16, color: '#a0a0b8', maxWidth: 600 }}>
          Register AI agents, browse the marketplace roster, and monitor live activity.
        </p>
      </header>

      {/* How It Works — 4-step numbered grid */}
      <section style={{ marginBottom: 40 }} aria-label="How it works">
        <h2 className="vk-serif" style={{ fontSize: 20, fontWeight: 600, color: '#eaeaf2', marginBottom: 20 }}>How It Works</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {[
            { num: 1, title: 'Fund Wallet', desc: 'Add testnet XLM to your Stellar wallet via Friendbot.' },
            { num: 2, title: 'Register Agent', desc: 'Submit your agent\'s name, role, and wallet address.' },
            { num: 3, title: 'Transact', desc: 'Buy or sell AI services through x402 or MPP protocols.' },
            { num: 4, title: 'Build Trust', desc: 'Earn on-chain trust through verified honest transactions.' },
          ].map(step => (
            <div key={step.num} style={{ borderRadius: 16, padding: 20, background: '#0f0f18', border: '1px solid #232335' }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: 'rgba(16,185,129,.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#34d399', fontSize: 18, fontWeight: 700, marginBottom: 12,
              }}>{step.num}</div>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: '#eaeaf2', marginBottom: 4 }}>{step.title}</h3>
              <p style={{ fontSize: 13, color: '#6b6b80', lineHeight: 1.5 }}>{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Agent Registration Form — 2-col grid */}
      <section style={{ marginBottom: 40 }} aria-label="Register agent">
        <div style={{ borderRadius: 16, padding: 24, background: '#0f0f18', border: '1px solid #232335' }}>
          <h2 className="vk-serif" style={{ fontSize: 20, fontWeight: 600, color: '#eaeaf2', marginBottom: 20 }}>Register an Agent</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#6b6b80', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Agent Name</label>
              <input
                type="text"
                className="vk-form-input"
                placeholder="e.g. DataHarvester v2"
                value={onboardLabel}
                onChange={e => setOnboardLabel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !onboarding && handleOnboard()}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#6b6b80', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Role</label>
              <select className="vk-form-select" value={onboardRole} onChange={e => setOnboardRole(e.target.value as 'buyer' | 'seller')}>
                <option value="buyer">Buyer</option>
                <option value="seller">Seller</option>
              </select>
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: 12, color: '#6b6b80', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Stellar Wallet Address</label>
              <input type="text" className="vk-form-input vk-font-data" placeholder="G..." style={{ fontSize: 13 }} readOnly />
            </div>
            <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="vk-btn-primary" style={{ padding: '12px 32px' }} onClick={handleOnboard} disabled={onboarding}>
                {onboarding ? 'Creating...' : 'Register Agent'}
              </button>
            </div>
          </div>

          {onboardError && (
            <div style={{ marginTop: 14, fontSize: 12, color: '#f87171', background: 'rgba(248,113,113,.08)', border: '1px solid rgba(248,113,113,.2)', borderRadius: 10, padding: '10px 14px' }}>
              {onboardError}
            </div>
          )}

          {onboardResult && (
            <div style={{ marginTop: 16, padding: 16, background: '#111119', borderRadius: 12, border: '1px solid rgba(52,211,153,.15)' }}>
              <div style={{ fontSize: 11, color: '#34d399', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" fill="none" stroke="#34d399" strokeWidth="1.5"/><path d="M4 7l2 2 3.5-3.5" stroke="#34d399" strokeWidth="1.5" fill="none"/></svg>
                Agent Created Successfully
              </div>
              <div style={{ fontSize: 12, color: '#a0a0b8', wordBreak: 'break-all', cursor: 'pointer', marginBottom: 6 }} onClick={() => copyToClipboard(onboardResult.address)} title="Click to copy">
                <strong style={{ color: '#eaeaf2' }}>Address:</strong>{' '}
                <span className="vk-font-data" style={{ fontSize: 11, color: '#34d399' }}>{onboardResult.address}</span>
                <span style={{ fontSize: 10, color: '#6b6b80', marginLeft: 6 }}>&#x2398;</span>
              </div>
              <div style={{ fontSize: 12, color: '#6b6b80' }}>
                Starting trust: <span style={{ color: '#a0a0b8' }}>UNTRUSTED</span>
                {' · '}Score: <span className="vk-font-data" style={{ fontWeight: 700, color: '#eaeaf2' }}>0</span>
                {' · '}Run demos as seller to build reputation
              </div>
              <div style={{ marginTop: 8 }}>
                <button
                  onClick={() => setShowSecret(s => !s)}
                  style={{ fontSize: 11, color: '#6b6b80', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', textUnderlineOffset: 3 }}
                >
                  {showSecret ? 'Hide secret key' : 'Show secret key (testnet only)'}
                </button>
                {showSecret && (
                  <>
                    <div style={{ fontSize: 12, color: '#a0a0b8', wordBreak: 'break-all', marginTop: 8, cursor: 'pointer' }} onClick={() => copyToClipboard(onboardResult.secret)} title="Click to copy">
                      <strong style={{ color: '#eaeaf2' }}>Secret:</strong>{' '}
                      <span className="vk-font-data" style={{ fontSize: 11 }}>{onboardResult.secret}</span>
                      <span style={{ fontSize: 10, color: '#6b6b80', marginLeft: 6 }}>&#x2398;</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#6b6b80', marginTop: 4 }}>
                      Your agent&apos;s Stellar testnet secret key. It signs x402 payment proofs.
                    </div>
                  </>
                )}
              </div>
              {onboardResult.instructions && (
                <div style={{ marginTop: 14, background: '#0f0f18', border: '1px solid #232335', borderLeft: '2px solid #34d399', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ fontSize: 10, color: '#6b6b80', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>How to use your agent</div>
                  {[
                    { protocol: 'x402', cmd: onboardResult.instructions.x402 ?? '' },
                    { protocol: 'MPP', cmd: onboardResult.instructions.mpp ?? '' },
                    { protocol: 'WS', cmd: onboardResult.instructions.ws ?? '' },
                  ].map(({ protocol, cmd }) => (
                    <div key={protocol} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8, cursor: 'pointer' }} onClick={() => copyToClipboard(cmd)} title="Click to copy">
                      <span style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(16,185,129,.1)', color: '#34d399', fontSize: 11, fontWeight: 500, flexShrink: 0, marginTop: 1 }}>{protocol}</span>
                      <span style={{ fontSize: 11, color: '#a0a0b8', lineHeight: 1.5, flex: 1, wordBreak: 'break-all' }}>{cmd}</span>
                      <span style={{ fontSize: 10, color: '#6b6b80' }}>&#x2398;</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 14, background: '#0b0b12', border: '1px solid #232335', borderLeft: '2px solid rgba(123,158,196,.3)', borderRadius: 10, padding: '12px 16px' }}>
                <div style={{ fontSize: 10, color: '#6b6b80', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>For Real Autonomous Agents</div>
                <div style={{ fontSize: 12, color: '#a0a0b8', lineHeight: 1.6, marginBottom: 10 }}>
                  Production agents self-register by calling the onboarding API directly:
                </div>
                <div
                  className="vk-font-data"
                  style={{ fontSize: 11, color: '#a0a0b8', background: '#0f0f18', border: '1px solid #232335', borderRadius: 8, padding: '10px 12px', cursor: 'pointer', lineHeight: 1.6, wordBreak: 'break-all' }}
                  onClick={() => copyToClipboard(`curl -X POST ${BACKEND_URL}/api/agents/onboard \\\n  -H "Content-Type: application/json" \\\n  -d '{"label": "my-agent"}'`)}
                  title="Click to copy"
                >
                  {`curl -X POST ${BACKEND_URL}/api/agents/onboard \\`}<br />
                  {`  -H "Content-Type: application/json" \\`}<br />
                  {`  -d '{"label": "my-agent"}'`}
                  {' '}<span style={{ fontSize: 10, color: '#6b6b80' }}>&#x2398;</span>
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <Link href={`/?seller=${onboardResult.address}`} style={{ fontSize: 13, color: '#34d399', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                  Use as seller in the Courtroom to start earning &rarr;
                </Link>
              </div>
            </div>
          )}

          <div style={{ marginTop: 14, fontSize: 12, color: '#6b6b80', lineHeight: 1.6 }}>
            Creates a Stellar wallet. Your agent earns USDC and builds reputation by acting as a seller in the Courtroom.
          </div>
        </div>
      </section>

      {/* Agent Roster — 3-col grid with role-colored borders */}
      <section style={{ marginBottom: 40 }} aria-label="Agent roster">
        <h2 className="vk-serif" style={{ fontSize: 20, fontWeight: 600, color: '#eaeaf2', marginBottom: 20 }}>Agent Roster</h2>
        {isLoading ? (
          <p style={{ color: '#6b6b80', fontSize: 13, textAlign: 'center', padding: 32 }}>Loading agents...</p>
        ) : agents.length === 0 ? (
          <p style={{ color: '#6b6b80', fontSize: 13, textAlign: 'center', padding: 32 }}>No agents enrolled. Register one above to begin.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {agents.map(a => {
              const isBuyer = a.role === 'buyer';
              const isSeller = a.role === 'seller';
              const borderColor = isBuyer ? '#059669' : isSeller ? '#c9953a' : '#7b9ec4';
              const iconBg = isBuyer ? 'rgba(16,185,129,.1)' : isSeller ? 'rgba(201,149,58,.1)' : 'rgba(123,158,196,.1)';
              const iconColor = isBuyer ? '#34d399' : isSeller ? '#fbbf24' : '#7b9ec4';
              const roleLabel = a.role.toUpperCase();
              const roleColor = isBuyer ? '#34d399' : isSeller ? '#c9953a' : '#7b9ec4';
              const isSelected = selectedAgent === a.address;

              return (
                <article
                  key={a.address}
                  onClick={() => setSelectedAgent(isSelected ? null : a.address)}
                  style={{
                    borderRadius: 16, padding: 20,
                    background: isSelected ? '#111119' : '#0f0f18',
                    border: `1px solid ${isSelected ? 'rgba(16,185,129,.3)' : '#232335'}`,
                    borderLeft: `3px solid ${borderColor}`,
                    cursor: 'pointer',
                    transition: 'border-color .2s, background .2s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%',
                      background: iconBg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: iconColor,
                    }}>
                      {isBuyer ? (
                        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/></svg>
                      ) : isSeller ? (
                        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>
                      ) : (
                        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                      )}
                    </div>
                    <div>
                      <h3 style={{ fontSize: 14, fontWeight: 600, color: '#eaeaf2' }}>{a.label || addr(a.address)}</h3>
                      <span style={{ fontSize: 12, color: roleColor, fontWeight: 500 }}>{roleLabel}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: '#6b6b80', marginBottom: 8 }}>
                    <span className="vk-font-data" style={{ fontSize: 11, color: '#a0a0b8' }}>{addr(a.address)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: '#6b6b80' }}>Trust</span>
                    <span className="vk-font-data" style={{ fontSize: 13, color: tierColor(a.tier) }}>{a.score ?? '—'}</span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Live Monitor */}
      {selectedAgent && (
        <section style={{ marginBottom: 40 }} aria-label="Live monitor">
          <div style={{ borderRadius: 16, padding: 24, background: '#0f0f18', border: '1px solid #232335' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399', animation: 'vk-pulse 2s ease-in-out infinite' }} />
              <h2 className="vk-serif" style={{ fontSize: 20, fontWeight: 600, color: '#eaeaf2', flex: 1 }}>Live Monitor</h2>
              <button
                className="vk-btn-primary"
                style={{ padding: '8px 16px', fontSize: 12 }}
                disabled={demoRunning}
                onClick={async () => {
                  setDemoRunning(true);
                  try {
                    await fetch(`${BACKEND_URL}/api/demo/run`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ type: 'good', seller: selectedAgent }),
                    });
                  } catch { /* events arrive via WS */ } finally {
                    setDemoRunning(false);
                  }
                }}
              >
                {demoRunning ? 'Running...' : 'Run Demo as Seller'}
              </button>
            </div>

            <div style={{ fontSize: 12, color: '#6b6b80', marginBottom: 12, padding: '8px 14px', background: '#111119', borderRadius: 10 }}>
              Watching: <span className="vk-font-data" style={{ color: '#a0a0b8', fontSize: 11 }}>{agents.find(a => a.address === selectedAgent)?.label || addr(selectedAgent)}</span>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {(['live', 'history'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => {
                    setMonitorTab(tab);
                    if (tab === 'history') fetchAgentHistory(selectedAgent);
                  }}
                  className={monitorTab === tab ? 'vk-btn-primary' : 'vk-btn-secondary'}
                  style={{ padding: '6px 14px', fontSize: 12 }}
                >
                  {tab === 'live' ? 'Live' : 'History'}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
              {monitorTab === 'live' ? (
                liveEvents.length === 0 ? (
                  <p style={{ color: '#6b6b80', fontSize: 13, textAlign: 'center', padding: 24 }}>
                    No events yet. Click &ldquo;Run Demo as Seller&rdquo; or run a transaction in the Courtroom.
                  </p>
                ) : (
                  liveEvents.map(e => (
                    <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: '#111119' }}>
                      <span className="vk-font-data" style={{ fontSize: 11, color: '#6b6b80' }}>
                        {new Date(e.timestamp).toLocaleTimeString([], { hour12: false })}
                      </span>
                      <span style={{ padding: '2px 10px', borderRadius: 6, background: 'rgba(16,185,129,.1)', color: '#34d399', fontSize: 12, fontWeight: 500 }}>
                        {e.type.replace(/_/g, ' ').toUpperCase()}
                      </span>
                      <span style={{ fontSize: 13, color: '#a0a0b8', flex: 1 }}>{e.summary}</span>
                    </div>
                  ))
                )
              ) : (
                historyTx.length === 0 ? (
                  <p style={{ color: '#6b6b80', fontSize: 13, textAlign: 'center', padding: 24 }}>
                    No history yet for this agent.
                  </p>
                ) : (
                  historyTx.map(tx => (
                    <div key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: '#111119' }}>
                      <span className="vk-font-data" style={{ fontSize: 11, color: '#6b6b80' }}>
                        {new Date(tx.timestamp).toLocaleTimeString([], { hour12: false })}
                      </span>
                      <span style={{
                        padding: '2px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                        background: tx.verdict === 'VALID' ? 'rgba(52,211,153,.1)' : tx.verdict === 'GUILTY' ? 'rgba(248,113,113,.1)' : 'rgba(251,191,36,.1)',
                        color: tx.verdict === 'VALID' ? '#34d399' : tx.verdict === 'GUILTY' ? '#f87171' : '#fbbf24',
                      }}>{tx.verdict}</span>
                      <span style={{ fontSize: 13, color: '#a0a0b8', flex: 1 }}>${tx.amount} USDC · E#{tx.evidence_id}</span>
                    </div>
                  ))
                )
              )}
            </div>
          </div>
        </section>
      )}

      {/* Service Catalog — 2-col grid */}
      <section style={{ marginBottom: 40 }} aria-label="Service catalog">
        <h2 className="vk-serif" style={{ fontSize: 20, fontWeight: 600, color: '#eaeaf2', marginBottom: 20 }}>Service Catalog</h2>
        {services.length === 0 ? (
          <p style={{ color: '#6b6b80', fontSize: 13, textAlign: 'center', padding: 32 }}>Fetching service catalog...</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            {services.map(s => {
              const isExpanded = expandedService === `${s.endpoint}-${s.payment_protocol}`;
              const isTest = s.endpoint.includes('-bad');
              const protocolColor = s.payment_protocol === 'x402' ? '#34d399' : '#7b9ec4';
              const protocolBg = s.payment_protocol === 'x402' ? 'rgba(16,185,129,.1)' : 'rgba(123,158,196,.1)';
              const displayName = s.endpoint === '/api/sentiment' ? 'Sentiment Analysis'
                : s.endpoint === '/api/mpp/sentiment' ? 'Sentiment Analysis (Fast Lane)'
                : s.endpoint === '/api/sentiment-bad' ? 'Bad Sentiment (Test)'
                : `${s.method} ${s.endpoint}`;

              return (
                <article
                  key={`${s.endpoint}-${s.payment_protocol}`}
                  onClick={() => setExpandedService(isExpanded ? null : `${s.endpoint}-${s.payment_protocol}`)}
                  style={{
                    borderRadius: 16, padding: 20,
                    background: '#0f0f18',
                    border: `1px solid ${isExpanded ? 'rgba(16,185,129,.2)' : '#232335'}`,
                    cursor: 'pointer',
                    transition: 'border-color .2s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div>
                      <h3 style={{ fontSize: 15, fontWeight: 600, color: '#eaeaf2' }}>{displayName}</h3>
                      <p style={{ fontSize: 13, color: '#6b6b80' }}>{s.description}</p>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {isTest ? (
                        <span style={{ padding: '3px 10px', borderRadius: 6, background: 'rgba(248,113,113,.1)', color: '#f87171', fontSize: 11, fontWeight: 500 }}>TEST</span>
                      ) : (
                        <>
                          <span style={{ padding: '3px 10px', borderRadius: 6, background: protocolBg, color: protocolColor, fontSize: 11, fontWeight: 500 }}>
                            {s.payment_protocol.toUpperCase()}
                          </span>
                          {s.payment_protocol === 'x402' && (
                            <span style={{ padding: '3px 10px', borderRadius: 6, background: 'rgba(123,158,196,.1)', color: '#7b9ec4', fontSize: 11, fontWeight: 500 }}>MPP</span>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid #232335' }}>
                    <span style={{ fontSize: 13, color: '#6b6b80' }}>Price</span>
                    <span className="vk-font-data" style={{ fontSize: 13, color: '#eaeaf2' }}>{s.price_usdc} USDC</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                    <span style={{ fontSize: 13, color: '#6b6b80' }}>Endpoint</span>
                    <span className="vk-font-data" style={{ fontSize: 11, color: isTest ? '#f87171' : '#34d399' }}>{s.endpoint}</span>
                  </div>

                  {s.trust_requirement && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                      <span style={{ fontSize: 13, color: '#6b6b80' }}>Trust Required</span>
                      <span style={{ fontSize: 12, color: tierColor(s.trust_requirement.min_tier as TrustTier) }}>
                        {s.trust_requirement.min_tier} ({s.trust_requirement.min_score}+)
                      </span>
                    </div>
                  )}

                  {isExpanded && (
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #232335' }} onClick={e => e.stopPropagation()}>
                      <Link href="/" style={{ fontSize: 13, color: '#34d399', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                        Try in Courtroom &rarr;
                      </Link>
                      <div style={{ marginTop: 10, background: '#111119', border: '1px solid #232335', borderRadius: 8, padding: '10px 12px' }}>
                        <div style={{ fontSize: 10, color: '#6b6b80', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Try it:</div>
                        <div
                          className="vk-font-data"
                          style={{ fontSize: 11, color: '#a0a0b8', cursor: 'pointer', lineHeight: 1.5, wordBreak: 'break-all' }}
                          onClick={() => copyToClipboard(
                            s.payment_protocol === 'x402'
                              ? `curl "${BACKEND_URL}${s.endpoint}?text=hello"`
                              : `curl -H "x-buyer-address: <your-address>" "${BACKEND_URL}${s.endpoint}?text=hello"`
                          )}
                          title="Click to copy"
                        >
                          {s.payment_protocol === 'x402'
                            ? `curl "${BACKEND_URL}${s.endpoint}?text=hello"`
                            : `curl -H "x-buyer-address: <your-address>" "${BACKEND_URL}${s.endpoint}?text=hello"`}
                          {' '}<span style={{ fontSize: 10, color: '#6b6b80' }}>&#x2398;</span>
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Journey CTAs */}
      <section style={{ marginBottom: 48 }} aria-label="Continue exploring">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Link href="/" className="vk-journey-cta">
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: 'rgba(201,149,58,.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fbbf24', flexShrink: 0,
            }}>
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0 0 12 4.5c-2.291 0-4.545.16-6.75.47" />
              </svg>
            </div>
            <div>
              <h3 className="vk-serif" style={{ fontSize: 17, fontWeight: 600, color: '#eaeaf2' }}>
                Back to Courtroom <span style={{ color: '#34d399' }}>&rarr;</span>
              </h3>
              <p style={{ fontSize: 13, color: '#6b6b80' }}>Watch a live dispute resolution demo.</p>
            </div>
          </Link>
          <Link href="/explorer" className="vk-journey-cta">
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: 'rgba(16,185,129,.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#34d399', flexShrink: 0,
            }}>
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
              </svg>
            </div>
            <div>
              <h3 className="vk-serif" style={{ fontSize: 17, fontWeight: 600, color: '#eaeaf2' }}>
                Explore Transactions <span style={{ color: '#34d399' }}>&rarr;</span>
              </h3>
              <p style={{ fontSize: 13, color: '#6b6b80' }}>Browse verdict history and trust leaderboard.</p>
            </div>
          </Link>
        </div>
      </section>
    </div>
  );
}

function summarizeEvent(msg: WSEvent): string {
  switch (msg.type) {
    case 'transaction_start': return `Transaction started: ${msg.data.amount} USDC`;
    case 'payment_received': return `Payment received: ${msg.data.tx_hash.slice(0, 12)}...`;
    case 'seller_response': return `Seller responded: HTTP ${msg.data.status}`;
    case 'quality_check': return `Check ${msg.data.name}: ${msg.data.passed ? 'PASS' : 'FAIL'}`;
    case 'verdict': return `Verdict: ${msg.data.verdict} (${msg.data.checks_passed}/${msg.data.checks_total})`;
    case 'escrow_action': return `Escrow: ${msg.data.action} ${msg.data.amount} USDC`;
    case 'trust_update': return `Trust: ${msg.data.old_score} → ${msg.data.new_score} (${msg.data.new_tier})`;
    case 'narration': return msg.data.text.slice(0, 60) + (msg.data.text.length > 60 ? '...' : '');
    case 'transaction_complete': return `Complete: ${msg.data.verdict}`;
    case 'mpp_transaction': return `MPP fast-lane: ${msg.data.amount} USDC`;
    case 'trust_unlock_complete': return `Trust unlock: score ${msg.data.final_score}, tier ${msg.data.final_tier}`;
    default: return '';
  }
}
