'use client';

import { useEffect, useRef } from 'react';

interface VerdictBannerProps {
  verdict: string | null;
  checksPassed?: number;
  checksTotal?: number;
}

function getVerdictConfig(verdict: string, passed: number, total: number) {
  const escrowText = verdict === 'VALID' ? 'Funds released to Seller'
    : verdict === 'PARTIAL' ? 'Payment split 50/50'
    : 'Funds refunded to Buyer';

  const configs: Record<string, { bg: string; color: string; border: string; pillBg: string }> = {
    VALID: { bg: 'rgba(52,211,153,.08)', color: 'var(--vk-green)', border: 'rgba(52,211,153,0.2)', pillBg: 'rgba(201,149,58,.12)' },
    PARTIAL: { bg: 'var(--vk-yellow-dim)', color: 'var(--vk-yellow)', border: 'rgba(251,191,36,0.2)', pillBg: 'var(--vk-yellow-dim)' },
    GUILTY: { bg: 'var(--vk-red-dim)', color: 'var(--vk-red)', border: 'rgba(248,113,113,0.2)', pillBg: 'var(--vk-red-dim)' },
  };

  const cfg = configs[verdict] || configs.GUILTY;
  return { ...cfg, label: verdict, detail: `${passed}/${total} checks passed · ${escrowText}` };
}

export function VerdictBanner({ verdict, checksPassed = 0, checksTotal = 6 }: VerdictBannerProps) {
  const bannerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!verdict || !bannerRef.current) return;
    bannerRef.current.animate?.(
      [
        { transform: 'scale(0.85) translateY(6px)', opacity: 0 },
        { transform: 'scale(1.02) translateY(-2px)', opacity: 1 },
        { transform: 'scale(1) translateY(0)', opacity: 1 },
      ],
      { duration: 400, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' },
    );
  }, [verdict]);

  if (!verdict) return null;
  const cfg = getVerdictConfig(verdict, checksPassed, checksTotal);

  return (
    <div
      ref={bannerRef}
      style={{
        borderRadius: 14,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        padding: '16px 20px',
        textAlign: 'center',
      }}
    >
      <span
        className="vk-verdict-large"
        style={{
          background: cfg.pillBg,
          color: verdict === 'VALID' ? '#fbbf24' : cfg.color,
          border: `1px solid ${verdict === 'VALID' ? 'rgba(201,149,58,.25)' : cfg.border}`,
          marginBottom: 8,
        }}
      >
        {cfg.label}
      </span>
      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--vk-text-muted)', letterSpacing: 0.5 }}>
        {cfg.detail}
      </div>
    </div>
  );
}
