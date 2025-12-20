type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class LoggerService {
  private isDevelopment: boolean = __DEV__;
  private logLevel: LogLevel = this.isDevelopment ? 'debug' : 'error';

  setLogLevel(level: LogLevel) {
    this.logLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }

  private formatMessage(
    level: LogLevel,
    context: string,
    message: string,
    ...args: any[]
  ): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}] [${context}]`;

    switch (level) {
      case 'debug':
        if (this.isDevelopment) {
          console.log(prefix, message, ...args);
        }
        break;
      case 'info':
        console.log(prefix, message, ...args);
        break;
      case 'warn':
        console.warn(prefix, message, ...args);
        break;
      case 'error':
        console.error(prefix, message, ...args);
        break;
    }
  }

  debug(context: string, message: string, ...args: any[]): void {
    this.formatMessage('debug', context, message, ...args);
  }

  info(context: string, message: string, ...args: any[]): void {
    this.formatMessage('info', context, message, ...args);
  }

  warn(context: string, message: string, ...args: any[]): void {
    this.formatMessage('warn', context, message, ...args);
  }

  error(context: string, message: string, error?: any, ...args: any[]): void {
    if (error instanceof Error) {
      this.formatMessage('error', context, message, {
        message: error.message,
        stack: error.stack,
        ...args,
      });
    } else {
      this.formatMessage('error', context, message, error, ...args);
    }
  }
}

export const logger = new LoggerService();
