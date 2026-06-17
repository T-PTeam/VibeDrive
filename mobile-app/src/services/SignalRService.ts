import * as signalR from '@microsoft/signalr';
import { logger } from './LoggerService';

export type MessageHandler = (message: string, parsed?: any) => void;

export type ConnectionState =
  | 'Disconnected'
  | 'Connecting'
  | 'Connected'
  | 'Reconnecting';

class SignalRService {
  private connection: signalR.HubConnection | null = null;
  private baseUrl: string = 'http://localhost:5009';
  private userId: string = '';
  private onStateChangeCallback?: (state: ConnectionState) => void;
  private messageHandlers: Map<string, MessageHandler> = new Map();

  setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  setUserId(userId: string) {
    this.userId = userId;
  }

  onStateChange(callback: (state: ConnectionState) => void) {
    this.onStateChangeCallback = callback;
  }

  onMessage(command: string, handler: MessageHandler) {
    this.messageHandlers.set(command, handler);
    logger.debug('SignalR', `Registered handler for command: ${command}`);
  }

  removeMessageHandler(command: string) {
    this.messageHandlers.delete(command);
    logger.debug('SignalR', `Removed handler for command: ${command}`);
  }

  private notifyStateChange(state: ConnectionState) {
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback(state);
    }
  }

  async connect(): Promise<void> {
    if (!this.userId) {
      logger.warn('SignalR', 'UserId not set. Cannot connect.');
      return;
    }

    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      logger.debug('SignalR', 'Already connected');
      return;
    }

    if (this.connection?.state === signalR.HubConnectionState.Connecting) {
      logger.debug('SignalR', 'Connection already in progress');
      return;
    }

    try {
      this.notifyStateChange('Connecting');
      logger.info('SignalR', `Connecting to ${this.baseUrl}/driverhub`, {
        userId: this.userId,
      });

      this.connection = new signalR.HubConnectionBuilder()
        .withUrl(`${this.baseUrl}/driverhub?userId=${this.userId}`, {
          skipNegotiation: false,
          transport:
            signalR.HttpTransportType.LongPolling |
            signalR.HttpTransportType.WebSockets,
        })
        .withAutomaticReconnect({
          nextRetryDelayInMilliseconds: (retryContext) => {
            if (retryContext.previousRetryCount < 3) {
              return 2000;
            }
            if (retryContext.previousRetryCount < 10) {
              return 5000;
            }
            return 15000;
          },
        })
        .configureLogging(signalR.LogLevel.Warning)
        .build();

      (this.connection as any).serverTimeoutInMilliseconds = 30000;
      (this.connection as any).keepAliveIntervalInMilliseconds = 15000;

      this.connection.on('ReceiveMessage', (message: string) => {
        logger.debug('SignalR', 'Received message', { message });

        let parsed: any = null;
        try {
          parsed = JSON.parse(message);
          logger.debug('SignalR', 'Parsed message', parsed);
        } catch (e) {
          logger.debug('SignalR', 'Message is not JSON', { raw: message });
        }

        if (parsed && typeof parsed === 'object') {
          const command = parsed.type || parsed.command || parsed.data?.type;
          if (command && this.messageHandlers.has(command)) {
            const handler = this.messageHandlers.get(command);
            if (handler) {
              try {
                handler(message, parsed);
              } catch (error) {
                logger.error(
                  'SignalR',
                  `Error in message handler for ${command}`,
                  error
                );
              }
            }
          }
        }

        if (this.messageHandlers.has('*')) {
          const defaultHandler = this.messageHandlers.get('*');
          if (defaultHandler) {
            try {
              defaultHandler(message, parsed);
            } catch (error) {
              logger.error(
                'SignalR',
                'Error in default message handler',
                error
              );
            }
          }
        }
      });

      this.connection.onreconnecting((error) => {
        this.notifyStateChange('Reconnecting');
        logger.warn('SignalR', 'Reconnecting', { error: error?.message });
      });

      this.connection.onreconnected((connectionId) => {
        this.notifyStateChange('Connected');
        logger.info('SignalR', 'Reconnected', { connectionId });
      });

      this.connection.onclose((error) => {
        this.notifyStateChange('Disconnected');
        if (error) {
          logger.error('SignalR', 'Connection closed with error', {
            message: error?.message,
            name: error?.name,
          });
        } else {
          logger.info('SignalR', 'Connection closed');
        }
      });

      await this.connection.start();
      this.notifyStateChange('Connected');
      const connectionId = this.connection?.connectionId ?? undefined;
      logger.info('SignalR', 'Connected successfully', { connectionId });
    } catch (error: any) {
      this.notifyStateChange('Disconnected');
      const err = error as { message?: string };
      const message =
        error?.message || (typeof error === 'string' ? error : 'Unknown error');
      logger.error('SignalR', 'Connection failed', {
        baseUrl: this.baseUrl,
        userId: this.userId,
        message,
      });
    }
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      try {
        await this.connection.stop();
        logger.info('SignalR', 'Disconnected');
      } catch (error) {
        logger.error('SignalR', 'Error disconnecting', error);
      } finally {
        this.connection = null;
        this.notifyStateChange('Disconnected');
      }
    }
  }

  getState(): ConnectionState {
    if (!this.connection) {
      return 'Disconnected';
    }

    switch (this.connection.state) {
      case signalR.HubConnectionState.Disconnected:
        return 'Disconnected';
      case signalR.HubConnectionState.Connecting:
        return 'Connecting';
      case signalR.HubConnectionState.Connected:
        return 'Connected';
      case signalR.HubConnectionState.Reconnecting:
        return 'Reconnecting';
      default:
        return 'Disconnected';
    }
  }

  isConnected(): boolean {
    return this.connection?.state === signalR.HubConnectionState.Connected;
  }
}

export const signalRService = new SignalRService();
