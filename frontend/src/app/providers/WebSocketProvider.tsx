'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import type { WSEvent } from '../../types';

type WSStatus = 'connecting' | 'connected' | 'disconnected';
type WSListener = (event: WSEvent) => void;

interface WSContextValue {
  status: WSStatus;
  subscribe: (address: string | null) => void;
  addListener: (fn: WSListener) => () => void;
  sendMessage: (msg: unknown) => void;
}

const WSContext = createContext<WSContextValue | null>(null);

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000/ws';
const MAX_BACKOFF = 30_000;

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Set<WSListener>>(new Set());
  const subscribeAddrRef = useRef<string | null>(null);
  const [status, setStatus] = useState<WSStatus>('disconnected');
  const backoffRef = useRef(2000);
  const connectedAtRef = useRef(0);

  useEffect(() => {
    let closed = false;

    function connect() {
      if (closed) return;
      setStatus('connecting');
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('connected');
        backoffRef.current = 2000;
        connectedAtRef.current = Date.now();
        // Re-send subscribe filter on reconnect
        if (subscribeAddrRef.current !== null) {
          ws.send(JSON.stringify({ subscribe: subscribeAddrRef.current }));
        }
      };

      ws.onmessage = (ev) => {
        try {
          const raw = JSON.parse(ev.data);
          if (typeof raw !== 'object' || raw === null || typeof raw.type !== 'string') return;
          const msg = raw as WSEvent;
          for (const fn of listenersRef.current) fn(msg);
        } catch { /* ignore non-JSON */ }
      };

      ws.onclose = () => {
        if (!closed) {
          setStatus('disconnected');
          // Reset backoff if connection was healthy for >5s (avoids 30s freeze after a brief hiccup)
          if (Date.now() - connectedAtRef.current > 5000) backoffRef.current = 2000;
          const delay = Math.min(backoffRef.current, MAX_BACKOFF);
          backoffRef.current = delay * 2;
          setTimeout(connect, delay);
        }
      };

      ws.onerror = () => ws.close();
    }

    connect();
    return () => { closed = true; wsRef.current?.close(); };
  }, []);

  const subscribe = useCallback((address: string | null) => {
    subscribeAddrRef.current = address;
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ subscribe: address }));
    }
  }, []);

  const addListener = useCallback((fn: WSListener) => {
    listenersRef.current.add(fn);
    return () => { listenersRef.current.delete(fn); };
  }, []);

  const sendMessage = useCallback((msg: unknown) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  return (
    <WSContext.Provider value={{ status, subscribe, addListener, sendMessage }}>
      {children}
    </WSContext.Provider>
  );
}

export function useWebSocket() {
  const ctx = useContext(WSContext);
  if (!ctx) throw new Error('useWebSocket must be used within WebSocketProvider');
  return ctx;
}
