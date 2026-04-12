'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';

interface JudgePanelProps {
  phase: string;
  narration: string;
  children: ReactNode;
}

export function JudgePanel({ phase, narration, children }: JudgePanelProps) {
  const [displayedText, setDisplayedText] = useState('');
  const [showCursor, setShowCursor] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean narration: strip markdown, replace backend jargon, sanitize errors
  const cleanNarration = narration
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/\bHTTP_STATUS\b/g, 'Server Response')
    .replace(/\bHAS_BODY\b/g, 'Data Received')
    .replace(/\bVALID_JSON\b/g, 'Valid Format')
    .replace(/\bSCHEMA_MATCH\b/g, 'Correct Structure')
    .replace(/\bFIELDS_PRESENT\b/g, 'Required Fields')
    .replace(/\bVALUE_BOUNDS\b/g, 'Values in Range')
    .replace(/[\da-fA-F]{16,}:error:\S+:SSL[^\n]*/g, 'On-chain recording encountered a temporary error.');

  // Typewriter effect for narration
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (!cleanNarration) {
      setDisplayedText('');
      setShowCursor(false);
      return;
    }

    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplayedText(cleanNarration);
      setShowCursor(false);
      return;
    }

    setShowCursor(true);
    setDisplayedText('');
    let i = 0;
    timerRef.current = setInterval(() => {
      i++;
      setDisplayedText(cleanNarration.slice(0, i));
      if (i >= cleanNarration.length) {
        if (timerRef.current) clearInterval(timerRef.current);
      }
    }, 18);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [cleanNarration]);

  const courtStatus =
    phase === 'checking' ? 'Examining evidence…'
    : phase === 'verdict' ? 'Rendering verdict…'
    : phase === 'narration' ? 'Delivering opinion…'
    : phase === 'complete' ? 'Case closed'
    : 'Awaiting next case';

  return (
    <article
      className="vk-panel-card vk-judge-glow vk-judge-pulse"
      style={{
        padding: 24,
        gridColumn: 'span 2',
        gridRow: 'span 2',
        border: '1px solid rgba(201,149,58,.25)',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}
      aria-label="Judge panel"
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: 'rgba(201,149,58,.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fbbf24',
          }}>
            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0 0 12 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 0 1-2.031.352 5.988 5.988 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.97Zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 0 1-2.031.352 5.989 5.989 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.97Z" />
            </svg>
          </div>
          <div>
            <h3 className="vk-serif-bold" style={{ fontSize: 22, fontWeight: 700, color: '#fbbf24', margin: 0 }}>The Judge</h3>
            <span style={{ fontSize: 13, color: 'var(--vk-text-muted)' }}>AI Arbitration Engine · {courtStatus}</span>
          </div>
        </div>
        <span style={{
          padding: '4px 14px', borderRadius: 20,
          background: 'rgba(201,149,58,.1)',
          border: '1px solid rgba(201,149,58,.25)',
          color: '#fbbf24', fontSize: 12, fontWeight: 600, letterSpacing: '.06em',
        }}>PRESIDING</span>
      </div>

      {/* Quality Checks + Verdict Banner (children) */}
      {children}

      {/* Judge Narration */}
      <div>
        <p style={{ fontSize: 11, color: 'var(--vk-text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>
          Judge&apos;s Opinion
        </p>
        <div className="vk-judge-box">
          <div className="vk-judge-text">
            {displayedText || (phase === 'idle' ? 'Court is in session. Awaiting next case.' : '…')}
            {showCursor && <span className="vk-typewriter-cursor" />}
          </div>
        </div>
      </div>
    </article>
  );
}
