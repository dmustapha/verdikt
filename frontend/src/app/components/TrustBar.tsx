'use client';

import { useEffect, useRef, useState } from 'react';
import type { TrustUpdate } from '../../types';

interface TrustBarProps {
  update: TrustUpdate | null;
  label?: string;
}

const MAX_SCORE = 800;

function getTierLabel(score: number): string {
  if (score >= 700) return 'TRUSTED';
  if (score >= 300) return 'STANDARD';
  return 'UNTRUSTED';
}

export function TrustBar({ update, label }: TrustBarProps) {
  const [score, setScore] = useState(300);
  const fillRef = useRef<HTMLDivElement | null>(null);
  const valueRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!update) return;
    setScore(update.new_score);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    fillRef.current?.animate?.(
      [
        { filter: 'brightness(2)', boxShadow: '0 0 40px rgba(16,185,129,0.4), 0 0 80px rgba(16,185,129,0.2)' },
        { filter: 'brightness(1)', boxShadow: '0 0 0 transparent' },
      ],
      { duration: 900, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    );

    valueRef.current?.animate?.(
      [
        { transform: 'scale(1.25)', textShadow: '0 0 16px rgba(52,211,153,0.6)' },
        { transform: 'scale(1)', textShadow: '0 0 0 transparent' },
      ],
      { duration: 500, easing: 'ease-out' },
    );
  }, [update]);

  const pct = Math.min((score / MAX_SCORE) * 100, 100);
  const tier = getTierLabel(score);
  const delta = update ? update.new_score - update.old_score : 0;
  const isMpp = score >= 700;

  return (
    <div className="vk-panel-card" style={{ padding: 24 }}>
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 className="vk-serif" style={{ fontSize: 20, fontWeight: 600, color: 'var(--vk-text)', margin: 0 }}>
          {label || 'Trust Score'}
        </h2>
        <span style={{
          padding: '4px 14px', borderRadius: 20,
          background: 'rgba(201,149,58,.1)',
          border: '1px solid rgba(201,149,58,.2)',
          color: '#fbbf24', fontSize: 12, fontWeight: 500,
          fontFamily: 'var(--font-data)',
        }}>{tier}</span>
      </div>

      {/* Score + delta */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 12 }}>
        <span ref={valueRef} className="vk-font-data" style={{ fontSize: 40, fontWeight: 500, color: 'var(--vk-text)', lineHeight: 1 }}>
          {score}
        </span>
        <span style={{ color: 'var(--vk-text-muted)', fontSize: 14, marginBottom: 4 }}>/ 800</span>
        {update && (
          <span style={{ color: delta >= 0 ? 'var(--vk-green)' : 'var(--vk-red)', fontSize: 13, marginBottom: 4, marginLeft: 'auto' }}>
            {delta >= 0 ? `+${delta}` : delta} from this verdict
          </span>
        )}
      </div>

      {/* Trust bar — emerald shimmer */}
      <div style={{ height: 10, background: 'var(--vk-surface)', borderRadius: 5, overflow: 'hidden', marginBottom: 12 }}>
        <div
          ref={fillRef}
          className="vk-fill-bar vk-trust-shimmer"
          style={{
            height: '100%',
            width: `${pct}%`,
            borderRadius: 5,
            background: 'linear-gradient(90deg,#059669,#34d399,#fbbf24,#34d399,#059669)',
          }}
        />
      </div>

      {/* Tier labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--vk-text-muted)' }}>
        <span>0 — Untrusted</span>
        <span>300 — Standard</span>
        <span style={{ color: '#34d399', fontWeight: 500 }}>700 — Trusted</span>
        <span>800 — Max</span>
      </div>
    </div>
  );
}
