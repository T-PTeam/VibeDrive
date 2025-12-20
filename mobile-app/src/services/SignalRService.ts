import * as signalR from '@microsoft/signalr';
import { logger } from './LoggerService';

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

  setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  setUserId(userId: string) {
    this.userId = userId;
  }

  onStateChange(callback: (state: ConnectionState) => void) {
    this.onStateChangeCallback = callback;
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
            signalR.HttpTransportType.WebSockets |
            signalR.HttpTransportType.LongPolling,
        })
        .withAutomaticReconnect({
          nextRetryDelayInMilliseconds: (retryContext) => {
            if (retryContext.previousRetryCount < 3) {
              return 1000;
            }
            if (retryContext.previousRetryCount < 10) {
              return 5000;
            }
            return 10000;
          },
        })
        .build();

      this.connection.on('ReceiveMessage', (message: string) => {
        logger.debug('SignalR', 'Received message', { message });
        try {
          const parsed = JSON.parse(message);
          logger.debug('SignalR', 'Parsed message', parsed);
        } catch (e) {
          logger.debug('SignalR', 'Message is not JSON', { raw: message });
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
          logger.error('SignalR', 'Connection closed with error', error);
        } else {
          logger.info('SignalR', 'Connection closed');
        }
      });

      await this.connection.start();
      this.notifyStateChange('Connected');
      logger.info('SignalR', 'Connected successfully', {
        connectionId: this.connection.connectionId,
      });
    } catch (error: any) {
      this.notifyStateChange('Disconnected');
      logger.error('SignalR', 'Connection failed', error, {
        baseUrl: this.baseUrl,
        userId: this.userId,
      });
      throw error;
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
