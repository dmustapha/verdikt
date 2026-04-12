'use client';

interface SellerPanelProps {
  active: boolean;
  isBad: boolean;
  phase: string;
  verdict?: string | null;
  label?: string;
  address?: string;
}

export function SellerPanel({ active, isBad, phase, verdict, label, address }: SellerPanelProps) {
  const isGuilty = verdict === 'GUILTY';
  const isPartial = verdict === 'PARTIAL';

  const statusText = phase === 'complete'
    ? isGuilty ? 'Returned invalid response' : isPartial ? 'Returned partial data' : 'Data delivered'
    : active
      ? isBad ? 'Returned invalid response' : 'Returned valid data'
      : 'Awaiting request';

  const validationText = phase === 'complete'
    ? isGuilty ? 'Failed quality checks' : isPartial ? 'Partial — some checks failed' : 'Passed quality checks'
    : active
      ? isBad ? 'Invalid response format' : 'Passed all checks'
      : '—';

  const validationColor = phase === 'complete'
    ? isGuilty ? 'var(--vk-red)' : isPartial ? 'var(--vk-yellow)' : 'var(--vk-green)'
    : active
      ? isBad ? 'var(--vk-red)' : 'var(--vk-green)'
      : 'var(--vk-text-sec)';

  const evidenceText =
    phase === 'complete' || phase === 'narration' || phase === 'escrow' || phase === 'verdict'
      ? 'Logged to Stellar'
      : '—';

  return (
    <article
      className="vk-panel-card"
      style={{
        padding: 20,
        borderLeft: '3px solid #c9953a',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
      aria-label="Seller agent"
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          background: 'rgba(201,149,58,.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fbbf24',
        }}>
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
          </svg>
        </div>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--vk-text)', margin: 0 }}>
            {label || 'Seller Agent'}
          </h3>
          <span style={{ fontSize: 12, color: 'var(--vk-text-muted)' }}>Service Provider</span>
        </div>
        {active && <span className="vk-dot" style={{ marginLeft: 'auto' }} />}
      </div>

      {/* Data rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {address && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ color: 'var(--vk-text-muted)' }}>Wallet</span>
            <span className="vk-font-data" style={{ fontSize: 12, color: '#c9953a' }}>
              {address.slice(0, 4)}...{address.slice(-4)}
            </span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span style={{ color: 'var(--vk-text-muted)' }}>Status</span>
          <span style={{ color: 'var(--vk-text-sec)' }}>{statusText}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span style={{ color: 'var(--vk-text-muted)' }}>Quality Result</span>
          <span style={{ color: validationColor }}>{validationText}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span style={{ color: 'var(--vk-text-muted)' }}>On-Chain Evidence</span>
          <span style={{ color: 'var(--vk-text-sec)' }}>{evidenceText}</span>
        </div>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid var(--vk-border)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#c9953a' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#c9953a' }} /> Verified Seller
        </span>
      </div>
    </article>
  );
}
