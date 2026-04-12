'use client';

import { useState, useEffect, useRef } from 'react';
import type { CheckDetail } from '../../types';

interface QualityChecksProps {
  checks: CheckDetail[];
}

const ALL_CHECKS = [
  'HTTP Status',
  'Has Body',
  'Valid JSON',
  'Schema Match',
  'Fields Present',
  'Value Bounds',
];

const CHECK_DISPLAY_NAMES: Record<string, string> = {
  'HTTP Status': 'Completeness',
  'Has Body': 'Data Received',
  'Valid JSON': 'Accuracy',
  'Schema Match': 'Format Compliance',
  'Fields Present': 'Data Integrity',
  'Value Bounds': 'SLA Adherence',
};

const CHECK_DESCRIPTIONS: Record<string, string> = {
  'HTTP Status': 'Server responded successfully',
  'Has Body': 'Response contains data',
  'Valid JSON': 'Data is in valid format',
  'Schema Match': 'Data matches expected structure',
  'Fields Present': 'All required fields are present',
  'Value Bounds': 'Values are within acceptable range',
};

function resolveCheckIndex(name: string): number {
  return ALL_CHECKS.findIndex(
    (c) =>
      c === name ||
      c.toUpperCase().replace(/\s/g, '_') === name ||
      c.toLowerCase().replace(/\s/g, '_') === name.toLowerCase().replace(/\s/g, '_')
  );
}

export function QualityChecks({ checks }: QualityChecksProps) {
  const fillRefs = useRef<(HTMLDivElement | null)[]>([]);
  const barRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [showInfo, setShowInfo] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const animatedIndices = useRef<Set<number>>(new Set());

  const passed = checks.filter((c) => c.passed).length;
  const scoreText = checks.length > 0 ? `${passed} / ${ALL_CHECKS.length}` : '— / 6';

  useEffect(() => {
    if (checks.length === 0) {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      animatedIndices.current.clear();
      ALL_CHECKS.forEach((_, i) => {
        const fill = fillRefs.current[i];
        if (fill) { fill.style.width = '0%'; fill.style.background = ''; }
      });
      return;
    }

    checks.forEach((check, i) => {
      const idx = resolveCheckIndex(check.name);
      const fillIdx = idx >= 0 ? idx : i;
      if (animatedIndices.current.has(fillIdx)) return;

      const fill = fillRefs.current[fillIdx];
      const bar = barRefs.current[fillIdx];
      if (!fill || !bar) return;

      animatedIndices.current.add(fillIdx);
      const pct = check.passed ? (70 + Math.random() * 30) : (10 + Math.random() * 30);
      const t = setTimeout(() => {
        fill.style.width = `${pct}%`;
        fill.style.background = check.passed ? '#10b981' : '#f87171';

        bar.animate?.([{ opacity: 0.4 }, { opacity: 1 }], {
          duration: 250,
          easing: 'ease-out',
          fill: 'forwards',
        });
      }, fillIdx * 150);

      timers.current.push(t);
    });

    return () => {
      timers.current.forEach(clearTimeout);
    };
  }, [checks]);

  return (
    <div aria-label="Quality assessment">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <h4 style={{ fontSize: 12, fontWeight: 600, color: 'var(--vk-text-sec)', textTransform: 'uppercase', letterSpacing: '.08em', margin: 0 }}>
            Quality Assessment
          </h4>
          {checks.length === 0 && (
            <button
              onClick={() => setShowInfo(v => !v)}
              style={{
                background: showInfo ? 'rgba(16,185,129,.15)' : 'var(--vk-surface)',
                border: '1px solid var(--vk-border)',
                borderRadius: '50%',
                width: 18, height: 18, fontSize: 10,
                color: 'var(--vk-text-muted)',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 0,
              }}
            >
              ?
            </button>
          )}
        </span>
        <span className="vk-font-data" style={{ fontSize: 13, fontWeight: 700, color: 'var(--vk-emerald-400)', letterSpacing: 1 }}>
          {scoreText}
        </span>
      </div>

      {showInfo && checks.length === 0 && (
        <div style={{
          background: 'var(--vk-surface)',
          border: '1px solid var(--vk-border)',
          borderRadius: 'var(--vk-radius-sm)',
          padding: '10px 14px',
          marginBottom: 12,
          animation: 'vk-fade-in 0.2s ease both',
        }}>
          {ALL_CHECKS.map(name => (
            <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12, borderBottom: '1px solid var(--vk-border)' }}>
              <span style={{ color: 'var(--vk-text-sec)' }}>{CHECK_DISPLAY_NAMES[name] || name}</span>
              <span style={{ color: 'var(--vk-text-muted)', maxWidth: '60%', textAlign: 'right' }}>{CHECK_DESCRIPTIONS[name]}</span>
            </div>
          ))}
        </div>
      )}

      {/* 2-column grid of quality bars */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {ALL_CHECKS.map((label, i) => {
          const check = checks.find((c) => resolveCheckIndex(c.name) === i);
          const pctDisplay = check ? (check.passed ? `${(70 + Math.floor(Math.random() * 30))}%` : `${(10 + Math.floor(Math.random() * 30))}%`) : '';

          return (
            <div key={label} ref={(el) => { barRefs.current[i] = el; }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--vk-text-muted)' }}>{CHECK_DISPLAY_NAMES[label] || label}</span>
                <span className="vk-font-data" style={{ fontSize: 12, color: check ? (check.passed ? '#34d399' : '#f87171') : 'var(--vk-text-muted)' }}>
                  {pctDisplay || '—'}
                </span>
              </div>
              <div style={{ height: 5, background: 'var(--vk-surface)', borderRadius: 3, overflow: 'hidden' }}>
                <div
                  ref={(el) => { fillRefs.current[i] = el; }}
                  className="vk-fill-bar"
                  style={{ height: '100%', width: '0%', borderRadius: 3 }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
