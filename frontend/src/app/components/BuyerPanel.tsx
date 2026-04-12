'use client';

interface BuyerPanelProps {
  active: boolean;
  phase: string;
  escrowAction?: string | null;
  label?: string;
  address?: string;
  amount?: string;
}

export function BuyerPanel({ active, phase, escrowAction, label, address, amount }: BuyerPanelProps) {
  const displayAmount = amount && amount !== '' ? amount : '0.01';

  const statusText =
    phase === 'payment' ? 'Requesting data…'
    : phase === 'complete' ? 'Transaction resolved'
    : 'Processing payment';

  const paymentText =
    phase === 'payment' || phase === 'seller_response' || phase === 'checking' || phase === 'verdict' || phase === 'escrow' || phase === 'narration' || phase === 'complete'
      ? `$${displayAmount} USDC`
      : '—';

  const isHeld = phase === 'payment' || phase === 'seller_response' || phase === 'checking' || phase === 'verdict';

  const escrowText =
    phase === 'escrow' || phase === 'narration' || phase === 'complete'
      ? escrowAction === 'release' ? 'Released to Seller'
        : escrowAction === 'refund' ? 'Refunded to Buyer'
        : escrowAction === 'split' ? 'Split 50/50'
        : 'Settled'
      : isHeld
        ? 'Held in escrow'
        : '—';

  return (
    <article
      className="vk-panel-card"
      style={{
        padding: 20,
        borderLeft: '3px solid #059669',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
      aria-label="Buyer agent"
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          background: 'rgba(16,185,129,.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#34d399',
        }}>
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="8.5" cy="7" r="4" />
          </svg>
        </div>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--vk-text)', margin: 0 }}>
            {label || 'Buyer Agent'}
          </h3>
          <span style={{ fontSize: 12, color: 'var(--vk-text-muted)' }}>Requesting Party</span>
        </div>
        {active && <span className="vk-dot" style={{ marginLeft: 'auto' }} />}
      </div>

      {/* Data rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {address && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ color: 'var(--vk-text-muted)' }}>Wallet</span>
            <span className="vk-font-data" style={{ fontSize: 12, color: '#34d399' }}>
              {address.slice(0, 4)}...{address.slice(-4)}
            </span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span style={{ color: 'var(--vk-text-muted)' }}>Paid</span>
          <span className="vk-font-data" style={{ fontSize: 12, color: 'var(--vk-text)' }}>{paymentText}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span style={{ color: 'var(--vk-text-muted)' }}>Status</span>
          <span style={{ color: 'var(--vk-text-sec)' }}>{statusText}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span style={{ color: 'var(--vk-text-muted)' }}>Escrow</span>
          <span style={{ color: 'var(--vk-text-sec)' }}>{escrowText}</span>
        </div>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid var(--vk-border)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#34d399' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399' }} /> Verified · x402
        </span>
      </div>
    </article>
  );
}
