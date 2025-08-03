import { JobQueue } from './job-queue';

/**
 * Centralized logging service that follows mixd-web patterns
 * Logs to both console and Supabase ingestion_logs table
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  jobId?: string;
  rawMixId?: string;
  workerType?: string;
  metadata?: any;
}

class Logger {
  private jobQueue = new JobQueue();
  private logLevel: LogLevel;
  
  constructor() {
    this.logLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
  }
  
  /**
   * Log a debug message
   */
  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }
  
  /**
   * Log an info message
   */
  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }
  
  /**
   * Log a warning message
   */
  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }
  
  /**
   * Log an error message
   */
  error(message: string, error?: Error, context?: LogContext): void {
    let fullMessage = message;
    let metadata = context?.metadata;
    
    if (error) {
      fullMessage += `: ${error.message}`;
      metadata = {
        ...metadata,
        stack: error.stack,
        name: error.name,
      };
    }
    
    this.log('error', fullMessage, { ...context, metadata });
    
    // Also log to console.error for immediate visibility
    console.error(fullMessage, error);
  }
  
  /**
   * Core logging method
   */
  private async log(level: LogLevel, message: string, context?: LogContext): Promise<void> {
    // Check if we should log this level
    if (!this.shouldLog(level)) {
      return;
    }
    
    // Log to console with timestamp and formatting
    this.logToConsole(level, message, context);
    
    // Log to Supabase (fire and forget)
    this.logToSupabase(level, message, context).catch(err => {
      console.error('Failed to log to Supabase:', err);
    });
  }
  
  /**
   * Check if we should log this level based on current log level
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    const currentIndex = levels.indexOf(this.logLevel);
    const messageIndex = levels.indexOf(level);
    
    return messageIndex >= currentIndex;
  }
  
  /**
   * Log to console with formatting
   */
  private logToConsole(level: LogLevel, message: string, context?: LogContext): void {
    const timestamp = new Date().toISOString();
    const levelStr = level.toUpperCase().padEnd(5);
    const contextStr = this.formatContext(context);
    
    let logMethod = console.log;
    if (level === 'error') logMethod = console.error;
    else if (level === 'warn') logMethod = console.warn;
    else if (level === 'debug') logMethod = console.debug;
    
    logMethod(`[${timestamp}] ${levelStr} ${message}${contextStr}`);
  }
  
  /**
   * Format context for console logging
   */
  private formatContext(context?: LogContext): string {
    if (!context) return '';
    
    const parts = [];
    if (context.workerType) parts.push(`worker=${context.workerType}`);
    if (context.jobId) parts.push(`job=${context.jobId.slice(0, 8)}...`);
    if (context.rawMixId) parts.push(`mix=${context.rawMixId.slice(0, 8)}...`);
    
    return parts.length > 0 ? ` [${parts.join(', ')}]` : '';
  }
  
  /**
   * Log to Supabase ingestion_logs table
   */
  private async logToSupabase(level: LogLevel, message: string, context?: LogContext): Promise<void> {
    try {
      await this.jobQueue.log(
        context?.jobId || null,
        message,
        level,
        {
          workerType: context?.workerType,
          rawMixId: context?.rawMixId,
          ...context?.metadata,
        }
      );
    } catch (err) {
      // Don't throw here to avoid recursive logging errors
      console.error('Failed to log to Supabase:', err);
    }
  }
  
  /**
   * Create a child logger with default context
   */
  child(defaultContext: LogContext): Logger {
    const childLogger = Object.create(this);
    childLogger.defaultContext = defaultContext;
    
    // Override log method to merge contexts
    const originalLog = this.log.bind(this);
    childLogger.log = (level: LogLevel, message: string, context?: LogContext) => {
      const mergedContext = { ...defaultContext, ...context };
      return originalLog(level, message, mergedContext);
    };
    
    return childLogger;
  }
}

// Export singleton instance
export const logger = new Logger();