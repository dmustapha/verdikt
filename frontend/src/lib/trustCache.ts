const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
const TTL = 30_000;

const cache = new Map<string, { score: number; tier: string; total_tx: number; expires: number }>();

export async function getCachedTrust(address: string) {
  const cached = cache.get(address);
  if (cached && cached.expires > Date.now()) return cached;
  try {
    const res = await fetch(`${BACKEND_URL}/api/trust/${address}`);
    if (!res.ok) return null;
    const data = await res.json();
    cache.set(address, { ...data.trust, expires: Date.now() + TTL });
    return data.trust;
  } catch { return null; }
}

export function invalidate(address: string): void {
  cache.delete(address);
}
