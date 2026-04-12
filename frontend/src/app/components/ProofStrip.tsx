'use client';

import type { CurrentTx } from '../hooks/useCourtroomReducer';
import type { Phase } from '../../types';

interface ProofStripProps {
  currentTx: CurrentTx;
  phase: Phase;
}

export function ProofStrip({ currentTx, phase }: ProofStripProps) {
  if (phase === 'idle') return null;

  const hasProof = currentTx.evidenceId > 0 || currentTx.disputeId > 0 || currentTx.escrowTxHash;
  const addr = (s: string) => s ? `${s.slice(0, 6)}...${s.slice(-4)}` : '\u2014';

  const txHash = currentTx.escrowTxHash
    ? addr(currentTx.escrowTxHash)
    : 'Pending';

  const settlementText = currentTx.escrowAction
    ? currentTx.escrowAction === 'release' ? 'Released'
      : currentTx.escrowAction === 'refund' ? 'Refunded'
      : 'Split 50/50'
    : 'Pending';

  return (
    <div className="vk-panel-card" style={{ padding: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'rgba(16,185,129,.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#34d399',
        }}>
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
          </svg>
        </div>
        <h3 className="vk-serif" style={{ fontSize: 18, fontWeight: 600, color: 'var(--vk-text)', margin: 0 }}>On-Chain Proof</h3>
        {!hasProof && <span style={{ fontSize: 12, color: 'var(--vk-text-muted)', marginLeft: 'auto' }}>Awaiting confirmation...</span>}
      </div>

      {/* 4-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <div style={{ borderRadius: 12, background: 'var(--vk-panel)', padding: 12 }}>
          <p style={{ fontSize: 11, color: 'var(--vk-text-muted)', marginBottom: 4 }}>Tx Hash</p>
          {currentTx.stellarExplorerUrl ? (
            <a
              href={currentTx.stellarExplorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="vk-font-data"
              style={{ fontSize: 12, color: '#34d399', textDecoration: 'none' }}
            >
              {txHash} <span style={{ fontSize: 10 }}>&#x2197;</span>
            </a>
          ) : (
            <p className="vk-font-data" style={{ fontSize: 12, color: txHash === 'Pending' ? 'var(--vk-text-muted)' : 'var(--vk-text)', margin: 0 }}>
              {txHash}
              {currentTx.escrowSimulated && <span style={{ fontSize: 9, color: 'var(--vk-yellow)', marginLeft: 6 }}>SIM</span>}
            </p>
          )}
        </div>
        <div style={{ borderRadius: 12, background: 'var(--vk-panel)', padding: 12 }}>
          <p style={{ fontSize: 11, color: 'var(--vk-text-muted)', marginBottom: 4 }}>Evidence</p>
          <p className="vk-font-data" style={{ fontSize: 12, color: currentTx.evidenceId > 0 ? 'var(--vk-text)' : 'var(--vk-text-muted)', margin: 0 }}>
            {currentTx.evidenceId > 0 ? `#${currentTx.evidenceId}` : 'Pending'}
          </p>
        </div>
        <div style={{ borderRadius: 12, background: 'var(--vk-panel)', padding: 12 }}>
          <p style={{ fontSize: 11, color: 'var(--vk-text-muted)', marginBottom: 4 }}>Dispute</p>
          <p className="vk-font-data" style={{ fontSize: 12, color: currentTx.disputeId > 0 ? 'var(--vk-text)' : 'var(--vk-text-muted)', margin: 0 }}>
            {currentTx.disputeId > 0 ? `#${currentTx.disputeId}` : 'Pending'}
          </p>
        </div>
        <div style={{ borderRadius: 12, background: 'var(--vk-panel)', padding: 12 }}>
          <p style={{ fontSize: 11, color: 'var(--vk-text-muted)', marginBottom: 4 }}>Settlement</p>
          <p style={{
            fontSize: 12, margin: 0,
            color: currentTx.escrowAction === 'release' ? 'var(--vk-green)'
              : currentTx.escrowAction === 'refund' ? 'var(--vk-red)'
              : currentTx.escrowAction === 'split' ? 'var(--vk-yellow)'
              : 'var(--vk-text-muted)',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            {currentTx.escrowAction && (
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
            )}
            {settlementText}
          </p>
        </div>
      </div>
    </div>
  );
}
