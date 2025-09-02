/**
 * Robust localStorage logging system for draft actions
 * This is a fallback logging mechanism with high durability and low storage footprint
 */

interface LocalLogEntry {
  t: number; // timestamp (shortened for storage efficiency)
  r: string; // roomId (shortened)
  a: string; // action (shortened)
  d?: any;   // data (shortened, optional)
  h: boolean; // isHost (shortened)
}

interface LogStorage {
  entries: LocalLogEntry[];
  lastCleanup: number;
}

class LocalStorageLogger {
  private readonly storageKey = 'draft_log';
  private readonly maxEntries = 1000; // Keep last 1000 entries
  private readonly cleanupInterval = 24 * 60 * 60 * 1000; // 24 hours
  private readonly maxStorageSize = 500 * 1024; // 500KB max storage

  /**
   * Log an action to localStorage
   */
  logAction(
    roomId: string,
    action: string,
    data?: any,
    isHost: boolean = false
  ): void {
    try {
      const entry: LocalLogEntry = {
        t: Date.now(),
        r: this.truncateString(roomId, 20),
        a: this.truncateString(action, 30),
        d: this.sanitizeData(data),
        h: isHost
      };

      this.appendEntry(entry);
    } catch (error) {
      // Silently fail - logging should never break the app
      console.warn('LocalStorage logging failed:', error);
    }
  }

  /**
   * Log a simple message
   */
  logMessage(
    roomId: string,
    message: string,
    isHost: boolean = false
  ): void {
    this.logAction(roomId, 'message', { msg: this.truncateString(message, 100) }, isHost);
  }

  /**
   * Log an error
   */
  logError(
    roomId: string,
    error: Error | string,
    context?: string,
    isHost: boolean = false
  ): void {
    const errorData = {
      err: typeof error === 'string' ? error : error.message,
      ctx: context ? this.truncateString(context, 50) : undefined
    };
    this.logAction(roomId, 'error', errorData, isHost);
  }

  /**
   * Get all log entries (for debugging)
   */
  getLogs(): LocalLogEntry[] {
    try {
      const storage = this.getStorage();
      return storage.entries || [];
    } catch {
      return [];
    }
  }

  /**
   * Get logs for a specific room
   */
  getLogsForRoom(roomId: string): LocalLogEntry[] {
    return this.getLogs().filter(entry => entry.r === roomId);
  }

  /**
   * Get only draft pick logs for a specific room
   */
  getPickLogsForRoom(roomId: string): LocalLogEntry[] {
    return this.getLogs().filter(entry => 
      entry.r === roomId && 
      (entry.a === 'draft_pick_completed' || entry.a === 'draft_pick')
    );
  }

  /**
   * Export logs as JSON string
   */
  exportLogs(): string {
    try {
      const logs = this.getLogs();
      return JSON.stringify(logs.map(entry => ({
        timestamp: new Date(entry.t).toISOString(),
        roomId: entry.r,
        action: entry.a,
        data: entry.d,
        isHost: entry.h
      })), null, 2);
    } catch {
      return '[]';
    }
  }

  /**
   * Export pick logs as CSV string
   */
  exportPicksAsCsv(roomId: string): string {
    try {
      const picks = this.getPickLogsForRoom(roomId);
      const csvHeader = 'Timestamp,Player,Position,Team,Owner,Amount,Mode,Round,Pick,Total Picks\n';
      
      const csvRows = picks
        .filter(entry => entry.a === 'draft_pick_completed' && entry.d)
        .map(entry => {
          const data = entry.d;
          return [
            new Date(entry.t).toISOString(),
            `"${data.playerName || ''}"`,
            data.playerPosition || '',
            `"${data.draftingTeamName || ''}"`,
            `"${data.draftingTeamOwner || ''}"`,
            data.amount || 0,
            data.draftMode || '',
            data.draftRound || '',
            data.draftPick || '',
            data.totalPicks || ''
          ].join(',');
        })
        .join('\n');

      return csvHeader + csvRows;
    } catch {
      return 'Timestamp,Player,Position,Team,Owner,Amount,Mode,Round,Pick,Total Picks\n';
    }
  }

  /**
   * Clear all logs (for cleanup)
   */
  clearLogs(): void {
    try {
      localStorage.removeItem(this.storageKey);
    } catch {
      // Silently fail
    }
  }

  /**
   * Get storage usage info
   */
  getStorageInfo(): { entries: number; sizeKB: number; lastCleanup: Date | null } {
    try {
      const storage = this.getStorage();
      const sizeBytes = new Blob([JSON.stringify(storage)]).size;
      return {
        entries: storage.entries.length,
        sizeKB: Math.round(sizeBytes / 1024 * 100) / 100,
        lastCleanup: storage.lastCleanup ? new Date(storage.lastCleanup) : null
      };
    } catch {
      return { entries: 0, sizeKB: 0, lastCleanup: null };
    }
  }

  // Private methods

  private getStorage(): LogStorage {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) {
        return { entries: [], lastCleanup: Date.now() };
      }
      const parsed = JSON.parse(stored);
      return {
        entries: Array.isArray(parsed.entries) ? parsed.entries : [],
        lastCleanup: parsed.lastCleanup || Date.now()
      };
    } catch {
      return { entries: [], lastCleanup: Date.now() };
    }
  }

  private setStorage(storage: LogStorage): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(storage));
    } catch (error) {
      // If storage is full, try to cleanup and retry once
      this.forceCleanup();
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(storage));
      } catch {
        // If still failing, give up silently
      }
    }
  }

  private appendEntry(entry: LocalLogEntry): void {
    const storage = this.getStorage();
    
    // Add new entry
    storage.entries.push(entry);
    
    // Check if cleanup is needed
    const now = Date.now();
    const needsCleanup = 
      storage.entries.length > this.maxEntries ||
      (now - storage.lastCleanup) > this.cleanupInterval ||
      this.isStorageTooBig(storage);

    if (needsCleanup) {
      this.cleanup(storage);
      storage.lastCleanup = now;
    }

    this.setStorage(storage);
  }

  private cleanup(storage: LogStorage): void {
    // Keep only the most recent entries
    if (storage.entries.length > this.maxEntries) {
      storage.entries = storage.entries.slice(-this.maxEntries);
    }

    // If still too big, be more aggressive
    while (this.isStorageTooBig(storage) && storage.entries.length > 100) {
      storage.entries = storage.entries.slice(-Math.floor(storage.entries.length * 0.8));
    }
  }

  private forceCleanup(): void {
    const storage = this.getStorage();
    // Keep only last 100 entries in emergency cleanup
    storage.entries = storage.entries.slice(-100);
    storage.lastCleanup = Date.now();
    this.setStorage(storage);
  }

  private isStorageTooBig(storage: LogStorage): boolean {
    try {
      const sizeBytes = new Blob([JSON.stringify(storage)]).size;
      return sizeBytes > this.maxStorageSize;
    } catch {
      return false;
    }
  }

  private sanitizeData(data: any): any {
    if (data === null || data === undefined) {
      return undefined;
    }

    if (typeof data === 'string') {
      return this.truncateString(data, 200);
    }

    if (typeof data === 'number' || typeof data === 'boolean') {
      return data;
    }

    if (Array.isArray(data)) {
      return data.slice(0, 10).map(item => this.sanitizeData(item));
    }

    if (typeof data === 'object') {
      const sanitized: any = {};
      let count = 0;
      for (const [key, value] of Object.entries(data)) {
        if (count >= 10) break; // Limit object properties
        sanitized[this.truncateString(key, 20)] = this.sanitizeData(value);
        count++;
      }
      return sanitized;
    }

    return String(data).substring(0, 100);
  }

  private truncateString(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
  }
}

// Export singleton instance
export const localStorageLogger = new LocalStorageLogger();

// Export types for external use
export type { LocalLogEntry };
