import { ref, push, serverTimestamp, off } from 'firebase/database';
import { database } from '../firebase/config';

export interface DraftLogEntry {
  timestamp: any; // Firebase ServerValue.TIMESTAMP
  roomId: string;
  action: string; // e.g., 'draft_pick', 'undo', 'reset', 'settings_update', 'timer_update'
  changes: Array<{
    key: string;
    prevValue: any;
    newValue: any;
  }>;
  metadata?: {
    isHost: boolean;
    userId?: string;
    draftRound?: number;
    draftPick?: number;
    playerId?: number;
    teamId?: number;
    [key: string]: any;
  };
}

class DraftLogger {
  private isEnabled: boolean = true;
  private logQueue: DraftLogEntry[] = [];
  private isProcessingQueue: boolean = false;
  private retryAttempts: { [key: string]: number } = {};
  private maxRetries: number = 3;
  private retryDelay: number = 1000; // 1 second

  /**
   * Log a draft action with state changes
   * @param roomId - The room ID
   * @param action - The action being performed
   * @param prevState - Previous state (partial)
   * @param newState - New state (partial)
   * @param metadata - Additional metadata about the action
   */
  async logAction(
    roomId: string,
    action: string,
    prevState: Record<string, any>,
    newState: Record<string, any>,
    metadata: DraftLogEntry['metadata'] = {}
  ): Promise<void> {
    if (!this.isEnabled || !roomId) {
      console.warn('Draft logging is disabled or roomId is missing');
      return;
    }

    try {
      // Calculate changes by comparing prev and new state
      const changes = this.calculateChanges(prevState, newState);
      
      if (changes.length === 0) {
        // No actual changes, skip logging
        return;
      }

      const sanitizedMetadata = this.sanitizeValue(metadata);
      


      const logEntry: DraftLogEntry = {
        timestamp: serverTimestamp(),
        roomId,
        action,
        changes,
        // Deep clone the sanitized metadata to prevent mutations
        metadata: JSON.parse(JSON.stringify(sanitizedMetadata))
      };

      // Add to queue for processing
      this.logQueue.push(logEntry);
      this.processQueue();

    } catch (error) {
      console.error('Failed to queue log entry:', error);
      // Don't throw - logging should never break the main flow
    }
  }

  /**
   * Log a simple action without state comparison
   */
  async logSimpleAction(
    roomId: string,
    action: string,
    description: string,
    metadata: DraftLogEntry['metadata'] = {}
  ): Promise<void> {
    const changes = [{
      key: 'action_description',
      prevValue: null,
      newValue: description
    }];

    const sanitizedMetadata = this.sanitizeValue(metadata);
    


    const logEntry: DraftLogEntry = {
      timestamp: serverTimestamp(),
      roomId,
      action,
      changes,
      // Deep clone the sanitized metadata to prevent mutations
      metadata: JSON.parse(JSON.stringify(sanitizedMetadata))
    };

    this.logQueue.push(logEntry);
    this.processQueue();
  }

  /**
   * Process the queue of log entries
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.logQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.logQueue.length > 0) {
      const logEntry = this.logQueue.shift()!;
      await this.writeLogEntry(logEntry);
    }

    this.isProcessingQueue = false;
  }

  /**
   * Write a single log entry to Firebase
   */
  private async writeLogEntry(logEntry: DraftLogEntry): Promise<void> {
    const entryId = `${logEntry.roomId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const logsRef = ref(database, `draftLogs/${logEntry.roomId}`);
      await push(logsRef, logEntry);
      
      // Clear retry count on success
      delete this.retryAttempts[entryId];
      
    } catch (error) {
      // Check if it's a permission denied error
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isPermissionDenied = errorMessage.includes('PERMISSION_DENIED') || errorMessage.includes('permission_denied');
      
      if (isPermissionDenied) {
        console.warn('Draft logging disabled due to Firebase permission restrictions. This is expected in demo mode.');
        // Disable logging to prevent spam
        this.setEnabled(false);
        // Clear the queue to prevent further attempts
        this.logQueue = [];
        this.retryAttempts = {};
        return;
      }
      
      console.error('Failed to write log entry:', error);
      
      // Implement retry logic for non-permission errors
      const retryCount = this.retryAttempts[entryId] || 0;
      if (retryCount < this.maxRetries) {
        this.retryAttempts[entryId] = retryCount + 1;
        
        // Add back to queue for retry after delay
        setTimeout(() => {
          this.logQueue.unshift(logEntry);
          this.processQueue();
        }, this.retryDelay * (retryCount + 1)); // Exponential backoff
        
      } else {
        console.error(`Failed to log entry after ${this.maxRetries} retries:`, logEntry);
        delete this.retryAttempts[entryId];
      }
    }
  }

  /**
   * Calculate changes between two state objects
   */
  private calculateChanges(
    prevState: Record<string, any>,
    newState: Record<string, any>
  ): Array<{ key: string; prevValue: any; newValue: any }> {
    const changes: Array<{ key: string; prevValue: any; newValue: any }> = [];
    
    // Get all keys from both states
    const allKeys = new Set([...Object.keys(prevState), ...Object.keys(newState)]);
    
    for (const key of allKeys) {
      const prevValue = prevState[key];
      const newValue = newState[key];
      
      // Skip if values are the same (deep comparison for objects/arrays)
      if (this.deepEqual(prevValue, newValue)) {
        continue;
      }
      
      changes.push({
        key,
        prevValue: this.sanitizeValue(prevValue),
        newValue: this.sanitizeValue(newValue)
      });
    }
    
    return changes;
  }

  /**
   * Deep equality check for values
   */
  private deepEqual(a: any, b: any): boolean {
    if (a === b) return true;
    
    if (a == null || b == null) return a === b;
    
    if (typeof a !== 'object' || typeof b !== 'object') return a === b;
    
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      return a.every((item, index) => this.deepEqual(item, b[index]));
    }
    
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    
    if (keysA.length !== keysB.length) return false;
    
    return keysA.every(key => this.deepEqual(a[key], b[key]));
  }

  /**
   * Sanitize values for logging (remove sensitive data, limit size)
   */
  private sanitizeValue(value: any): any {
    // Convert undefined to null for Firebase compatibility
    if (value === undefined) return null;
    if (value === null) return null;
    
    // If it's a large object/array, limit its size for logging
    if (typeof value === 'object') {
      try {
        const serialized = JSON.stringify(value);
        if (serialized.length > 10000) {
          return `[Large object: ${serialized.length} chars]`;
        }
        
        // Deep sanitize object/array to convert any nested undefined values
        return this.deepSanitize(value);
      } catch (error) {
        return '[Unserializable object]';
      }
    }
    
    return value;
  }

  /**
   * Deep sanitize objects/arrays to convert undefined values to null
   */
  private deepSanitize(obj: any): any {
    if (obj === undefined) return null;
    if (obj === null) return null;
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.deepSanitize(item));
    }
    
    if (typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = this.deepSanitize(value);
      }
      return sanitized;
    }
    
    return obj;
  }

  /**
   * Enable or disable logging
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  /**
   * Get current queue size (for debugging)
   */
  getQueueSize(): number {
    return this.logQueue.length;
  }

  /**
   * Clear the queue (for testing)
   */
  clearQueue(): void {
    this.logQueue = [];
    this.retryAttempts = {};
  }
}

// Export singleton instance
export const draftLogger = new DraftLogger();

// Export the class for testing
export { DraftLogger };
