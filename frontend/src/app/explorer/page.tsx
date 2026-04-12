'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useWebSocket } from '../providers/WebSocketProvider';
import type { TrustTier, WSEvent } from '../../types';
import { getCachedTrust, invalidate } from '../../lib/trustCache';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

interface TxLog {
  id: string;
  buyer: string;
  seller: string;
  verdict: string;
  amount: string;
  evidence_id: number;
  dispute_id: number;
  escrow_action: string;
  escrow_tx_hash: string;
  escrow_simulated: boolean;
  trust_update: { seller: string; old_score: number; new_score: number; old_tier: string; new_tier: string };
  timestamp: number;
}

interface AgentTrust {
  address: string;
  label: string;
  role: string;
  score: number;
  tier: TrustTier;
  totalTx: number;
}

export default function ExplorerPage() {
  const [transactions, setTransactions] = useState<TxLog[]>([]);
  const [leaderboard, setLeaderboard] = useState<AgentTrust[]>([]);
  const [filter, setFilter] = useState<'all' | 'VALID' | 'PARTIAL' | 'GUILTY'>('all');
  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const [expandedTx, setExpandedTx] = useState<string | null>(null);
  const { addListener } = useWebSocket();

  useEffect(() => {
    fetchTransactions();
    fetchLeaderboard();
    const params = new URLSearchParams(window.location.search);
    const agentParam = params.get('agent');
    if (agentParam) setAgentFilter(agentParam);
    return () => {
      if (leaderboardTimer.current) clearTimeout(leaderboardTimer.current);
    };
  }, []);

  const leaderboardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedFetchLeaderboard = useCallback(() => {
    if (leaderboardTimer.current) clearTimeout(leaderboardTimer.current);
    leaderboardTimer.current = setTimeout(() => fetchLeaderboard(), 2000);
  }, []);

  useEffect(() => {
    return addListener((msg: WSEvent) => {
      if (msg.type === 'transaction_complete') {
        const d = msg.data;
        const tu = d.trust_update ?? { seller: '', old_score: 0, new_score: 0, old_tier: '—', new_tier: '—' };
        const entry: TxLog = {
          id: `tx-${d.timestamp}-${d.evidence_id}`,
          buyer: d.buyer || '',
          seller: d.seller || tu.seller || '',
          verdict: d.verdict,
          amount: d.amount || '0.01',
          evidence_id: d.evidence_id,
          dispute_id: d.dispute_id,
          escrow_action: d.escrow_action,
          escrow_tx_hash: d.escrow_tx_hash,
          escrow_simulated: d.escrow_simulated,
          trust_update: tu,
          timestamp: d.timestamp || Date.now(),
        };
        setTransactions(prev => {
          if (entry.evidence_id > 0 && prev.some(t => t.evidence_id === entry.evidence_id)) return prev;
          return [entry, ...prev];
        });
        debouncedFetchLeaderboard();
      } else if (msg.type === 'trust_update') {
        const { seller, new_score, new_tier } = msg.data;
        invalidate(seller);
        setLeaderboard(prev =>
          prev
            .map(a => a.address === seller ? { ...a, score: new_score, tier: new_tier as TrustTier } : a)
            .sort((a, b) => b.score - a.score)
        );
      }
    });
  }, [addListener, debouncedFetchLeaderboard]);

  const fetchTransactions = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/history`);
      if (res.ok) setTransactions(await res.json());
    } catch { /* non-critical */ }
  };

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/agents`);
      if (!res.ok) return;
      const agents = await res.json();
      const enriched = await Promise.all(agents.map(async (a: { address: string; label: string; role: string }) => {
        const trust = await getCachedTrust(a.address);
        return {
          address: a.address, label: a.label, role: a.role,
          score: trust?.score ?? 300,
          tier: (trust?.tier ?? 'UNTRUSTED') as TrustTier,
          totalTx: trust?.total_tx ?? 0,
        } as AgentTrust;
      }));
      enriched.sort((a, b) => b.score - a.score);
      setLeaderboard(enriched);
    } catch { /* non-critical */ }
  };

  const addr = (s: string) => s ? `${s.slice(0, 6)}...${s.slice(-4)}` : '—';
  const tierColor = (t: string) => t === 'TRUSTED' ? '#34d399' : t === 'STANDARD' ? '#c9953a' : '#6b6b80';
  const verdictColor = (v: string) => v === 'VALID' ? '#34d399' : v === 'GUILTY' ? '#f87171' : '#fbbf24';
  const verdictBg = (v: string) => v === 'VALID' ? 'rgba(52,211,153,.1)' : v === 'GUILTY' ? 'rgba(248,113,113,.1)' : 'rgba(251,191,36,.1)';
  const escrowLabel = (a: string) => a === 'release' ? 'Released' : a === 'refund' ? 'Refunded' : a === 'split' ? 'Split' : a;
  const escrowColor = (a: string) => a === 'release' ? '#34d399' : a === 'refund' ? '#f87171' : a === 'split' ? '#fbbf24' : '#6b6b80';
  const trustDelta = (tu: TxLog['trust_update']) => {
    if (!tu || !tu.seller) return { text: '—', color: '#6b6b80' };
    const d = tu.new_score - tu.old_score;
    return d > 0 ? { text: `+${d}`, color: '#34d399' } : d < 0 ? { text: `${d}`, color: '#f87171' } : { text: '0', color: '#6b6b80' };
  };

  const labelMap = Object.fromEntries(
    leaderboard.map(a => [a.address, a.label || addr(a.address)])
  );

  const filtered = transactions.filter(t => {
    if (agentFilter && t.buyer !== agentFilter && t.seller !== agentFilter) return false;
    return filter === 'all' || t.verdict === filter;
  });

  const stats = {
    total: transactions.length,
    valid: transactions.filter(t => t.verdict === 'VALID').length,
    partial: transactions.filter(t => t.verdict === 'PARTIAL').length,
    guilty: transactions.filter(t => t.verdict === 'GUILTY').length,
  };

  return (
    <div style={{ minHeight: '100dvh' }}>
      {/* Header — left-aligned */}
      <header style={{ marginBottom: 40 }}>
        <h1 className="vk-serif" style={{ fontSize: 'clamp(36px,4vw,52px)', fontWeight: 700, color: '#eaeaf2', marginBottom: 8 }}>
          Explorer
        </h1>
        <p style={{ fontSize: 16, color: '#a0a0b8', maxWidth: 600 }}>
          Full transaction history with on-chain proof. Filter, search, and verify every verdict.
        </p>
      </header>

      {/* Stats Strip — 4-col */}
      <section style={{ marginBottom: 40 }} aria-label="Transaction statistics">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {[
            { value: stats.total, label: 'Total Transactions', color: '#eaeaf2' },
            { value: stats.valid, label: 'Valid Verdicts', color: '#34d399' },
            { value: stats.partial, label: 'Partial Verdicts', color: '#fbbf24' },
            { value: stats.guilty, label: 'Guilty Verdicts', color: '#f87171' },
          ].map(s => (
            <article key={s.label} style={{ borderRadius: 16, padding: 20, background: '#0f0f18', border: '1px solid #232335', textAlign: 'center' }}>
              <p className="vk-font-data" style={{ fontSize: 32, fontWeight: 500, color: s.color, marginBottom: 4 }}>{s.value}</p>
              <p style={{ fontSize: 13, color: '#6b6b80' }}>{s.label}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Verdict Explainer — 3-col */}
      <section style={{ marginBottom: 40 }} aria-label="Verdict types">
        <div style={{ borderRadius: 16, padding: 24, background: '#0f0f18', border: '1px solid #232335' }}>
          <h2 className="vk-serif" style={{ fontSize: 18, fontWeight: 600, color: '#eaeaf2', marginBottom: 16 }}>Understanding Verdicts</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <div style={{ padding: 16, borderRadius: 12, background: 'rgba(52,211,153,.06)', border: '1px solid rgba(52,211,153,.15)' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#34d399', letterSpacing: '.06em' }}>VALID</span>
              <p style={{ fontSize: 13, color: '#a0a0b8', marginTop: 6, lineHeight: 1.5 }}>Service delivered as promised. Full payment released to seller. Trust score +10.</p>
            </div>
            <div style={{ padding: 16, borderRadius: 12, background: 'rgba(251,191,36,.06)', border: '1px solid rgba(251,191,36,.15)' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#fbbf24', letterSpacing: '.06em' }}>PARTIAL</span>
              <p style={{ fontSize: 13, color: '#a0a0b8', marginTop: 6, lineHeight: 1.5 }}>Some quality checks failed. Payment split between buyer and seller. No trust change.</p>
            </div>
            <div style={{ padding: 16, borderRadius: 12, background: 'rgba(248,113,113,.06)', border: '1px solid rgba(248,113,113,.15)' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#f87171', letterSpacing: '.06em' }}>GUILTY</span>
              <p style={{ fontSize: 13, color: '#a0a0b8', marginTop: 6, lineHeight: 1.5 }}>Service failed quality gate. Full refund to buyer. Trust score &minus;50.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Filter Bar */}
      <section style={{ marginBottom: 24 }} aria-label="Filters">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
          {(['all', 'VALID', 'PARTIAL', 'GUILTY'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={filter === f ? 'vk-btn-primary' : 'vk-btn-secondary'}
              style={{ padding: '8px 16px', fontSize: 13 }}
            >
              {f === 'all' ? 'All Verdicts' : f}
            </button>
          ))}
          {agentFilter && (
            <button
              onClick={() => setAgentFilter(null)}
              style={{
                fontSize: 12, color: '#34d399', background: 'rgba(16,185,129,.08)',
                border: '1px solid rgba(16,185,129,.2)', borderRadius: 8,
                padding: '6px 12px', cursor: 'pointer',
              }}
            >
              &times; {labelMap[agentFilter] || addr(agentFilter)}
            </button>
          )}
          <span className="vk-font-data" style={{ marginLeft: 'auto', fontSize: 12, color: '#6b6b80' }}>{filtered.length} cases</span>
        </div>
      </section>

      {/* Transaction Table */}
      <section style={{ marginBottom: 40 }} aria-label="Transaction history">
        <div style={{ borderRadius: 16, background: '#0f0f18', border: '1px solid #232335', overflow: 'hidden' }}>
          {filtered.length === 0 ? (
            <p style={{ padding: 32, color: '#6b6b80', textAlign: 'center', fontSize: 13 }}>
              No cases on record.{' '}
              <Link href="/" style={{ color: '#34d399', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                Enter the Courtroom to open your first case &rarr;
              </Link>
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="vk-tx-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Buyer</th>
                    <th>Seller</th>
                    <th>Verdict</th>
                    <th>Amount</th>
                    <th>Escrow</th>
                    <th>Trust &Delta;</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(tx => {
                    const delta = trustDelta(tx.trust_update);
                    const isExpanded = expandedTx === tx.id;
                    return (
                      <React.Fragment key={tx.id}>
                        <tr
                          onClick={() => setExpandedTx(isExpanded ? null : tx.id)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td>
                            <span className="vk-font-data" style={{ fontSize: 12, color: '#6b6b80' }}>
                              {new Date(tx.timestamp).toLocaleTimeString([], { hour12: false })}
                            </span>
                          </td>
                          <td>
                            <span className="vk-font-data" style={{ fontSize: 11, color: '#34d399' }}>
                              {labelMap[tx.buyer] || addr(tx.buyer)}
                            </span>
                          </td>
                          <td>
                            <span className="vk-font-data" style={{ fontSize: 11, color: '#c9953a' }}>
                              {labelMap[tx.seller] || addr(tx.seller)}
                            </span>
                          </td>
                          <td>
                            <span style={{
                              padding: '2px 10px', borderRadius: 6,
                              background: verdictBg(tx.verdict),
                              color: verdictColor(tx.verdict),
                              fontSize: 12, fontWeight: 600,
                            }}>{tx.verdict}</span>
                          </td>
                          <td>
                            <span className="vk-font-data" style={{ fontSize: 12 }}>{parseFloat(tx.amount).toFixed(2)} USDC</span>
                          </td>
                          <td>
                            <span style={{ fontSize: 13, color: escrowColor(tx.escrow_action) }}>{escrowLabel(tx.escrow_action)}</span>
                          </td>
                          <td>
                            <span className="vk-font-data" style={{ fontSize: 12, color: delta.color }}>{delta.text}</span>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={7} style={{ padding: 0 }}>
                              <div style={{
                                padding: '16px 20px',
                                background: '#111119',
                                borderTop: '1px solid #232335',
                                display: 'grid',
                                gridTemplateColumns: 'repeat(4, 1fr)',
                                gap: 16,
                              }}>
                                <DetailItem label="Evidence ID" value={tx.evidence_id > 0 ? `#${tx.evidence_id}` : 'N/A'} />
                                <DetailItem label="Dispute ID" value={tx.dispute_id > 0 ? `#${tx.dispute_id}` : 'N/A'} />
                                <DetailItem label="Escrow Tx" value={tx.escrow_tx_hash ? addr(tx.escrow_tx_hash) : 'N/A'} mono />
                                <DetailItem label="Testnet" value={tx.escrow_simulated ? 'Yes (Simulated)' : 'Live'} />
                                <DetailItem label="Score Change" value={tx.trust_update?.seller ? `${tx.trust_update.old_score} → ${tx.trust_update.new_score}` : 'N/A'} />
                                <DetailItem label="Trust Tier" value={tx.trust_update?.seller ? `${tx.trust_update.old_tier} → ${tx.trust_update.new_tier}` : 'N/A'} />
                                <DetailItem label="Buyer" value={labelMap[tx.buyer] || addr(tx.buyer)} />
                                <DetailItem label="Seller" value={labelMap[tx.seller] || addr(tx.seller)} />
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Trust Leaderboard */}
      <section style={{ marginBottom: 40 }} aria-label="Trust leaderboard">
        <h2 className="vk-serif" style={{ fontSize: 20, fontWeight: 600, color: '#eaeaf2', marginBottom: 20 }}>Trust Leaderboard</h2>
        <div style={{ borderRadius: 16, background: '#0f0f18', border: '1px solid #232335', overflow: 'hidden' }}>
          {leaderboard.length === 0 ? (
            <p style={{ padding: 32, color: '#6b6b80', fontSize: 13, textAlign: 'center' }}>No agents on the docket.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {leaderboard.map((a, i) => {
                const rankBg = i === 0 ? 'rgba(251,191,36,.12)' : i === 1 ? 'rgba(123,158,196,.1)' : i === 2 ? 'rgba(107,107,128,.1)' : 'transparent';
                const rankColor = i === 0 ? '#fbbf24' : i === 1 ? '#7b9ec4' : '#6b6b80';
                const isActive = agentFilter === a.address;

                return (
                  <button
                    key={a.address}
                    onClick={() => setAgentFilter(isActive ? null : a.address)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 16,
                      padding: '16px 20px',
                      borderBottom: i < leaderboard.length - 1 ? '1px solid rgba(35,35,53,.5)' : 'none',
                      background: isActive ? '#111119' : 'transparent',
                      border: 'none', cursor: 'pointer',
                      width: '100%', textAlign: 'left',
                      transition: 'background .2s',
                    }}
                  >
                    <span style={{
                      width: 32, height: 32, borderRadius: 10,
                      background: rankBg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: rankColor, fontSize: 16, fontWeight: 700,
                    }}>#{i + 1}</span>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#eaeaf2' }}>{a.label || addr(a.address)}</span>
                      <span className="vk-font-data" style={{ fontSize: 11, color: '#6b6b80', marginLeft: 8 }}>{addr(a.address)}</span>
                    </div>
                    <span style={{
                      padding: '3px 12px', borderRadius: 8,
                      background: a.tier === 'TRUSTED' ? 'rgba(52,211,153,.1)' : a.tier === 'STANDARD' ? 'rgba(201,149,58,.1)' : 'rgba(123,158,196,.1)',
                      color: tierColor(a.tier),
                      fontSize: 12, fontWeight: 500,
                    }}>{a.tier}</span>
                    <span className="vk-font-data" style={{ fontSize: 18, fontWeight: 500, color: '#eaeaf2', width: 60, textAlign: 'right' }}>{a.score}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
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
          <Link href="/agents" className="vk-journey-cta">
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: 'rgba(16,185,129,.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#34d399', flexShrink: 0,
            }}>
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07" />
              </svg>
            </div>
            <div>
              <h3 className="vk-serif" style={{ fontSize: 17, fontWeight: 600, color: '#eaeaf2' }}>
                Register an Agent <span style={{ color: '#34d399' }}>&rarr;</span>
              </h3>
              <p style={{ fontSize: 13, color: '#6b6b80' }}>Onboard your AI agent to the marketplace.</p>
            </div>
          </Link>
        </div>
      </section>
    </div>
  );
}

function DetailItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div
      style={{ cursor: mono ? 'pointer' : undefined }}
      onClick={mono ? () => navigator.clipboard.writeText(value) : undefined}
      title={mono ? 'Click to copy' : undefined}
    >
      <div style={{ fontSize: 10, color: '#6b6b80', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{
        fontSize: 12, color: '#a0a0b8',
        wordBreak: mono ? 'break-all' : undefined,
      }}>
        {mono ? <span className="vk-font-data" style={{ fontSize: 11 }}>{value}</span> : value}
        {mono && <span style={{ fontSize: 10, color: '#6b6b80', marginLeft: 4 }}>&#x2398;</span>}
      </div>
    </div>
  );
}
