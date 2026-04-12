import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { TransactionLogEntry } from '../types.js';

export class TransactionStore {
  private entries: TransactionLogEntry[] = [];
  private filePath: string | null = null;

  constructor(filePath?: string) {
    if (filePath) {
      this.filePath = filePath;
      mkdirSync(dirname(filePath), { recursive: true });
      if (existsSync(filePath)) {
        try {
          this.entries = JSON.parse(readFileSync(filePath, 'utf-8'));
          console.log(`[TransactionStore] Loaded ${this.entries.length} entries from ${filePath}`);
        } catch {
          console.warn('[TransactionStore] Failed to parse persisted file — starting fresh');
        }
      }
    }
  }

  append(entry: TransactionLogEntry): void {
    this.entries.push(entry);
    if (this.filePath) {
      try {
        writeFileSync(this.filePath, JSON.stringify(this.entries), 'utf-8');
      } catch (err) {
        console.warn('[TransactionStore] Persist failed:', err);
      }
    }
  }

  getByAddress(address: string): TransactionLogEntry[] {
    return this.entries
      .filter((e) => e.buyer === address || e.seller === address)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  getAll(): TransactionLogEntry[] {
    return [...this.entries].sort((a, b) => b.timestamp - a.timestamp);
  }
}
