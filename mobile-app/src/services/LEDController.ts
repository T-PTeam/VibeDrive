import { bleService } from './BLEService';
import { logger } from './LoggerService';
import { fromByteArray } from 'base64-js';

interface RGBColor {
  red: number;
  green: number;
  blue: number;
}

interface LEDControllerConfig {
  serviceUUID: string;
  characteristicUUID: string;
  deviceName?: string;
  deviceId?: string;
}

class LEDController {
  private config: LEDControllerConfig | null = null;
  private isInitialized: boolean = false;

  initialize(config: LEDControllerConfig): void {
    this.config = config;
    this.isInitialized = true;
    logger.info('LEDController', 'Initialized', config);
  }

  private validateConfig(): void {
    if (!this.isInitialized || !this.config) {
      throw new Error('LEDController not initialized');
    }
  }

  private rgbToBytes(color: RGBColor): string {
    const bytes = new Uint8Array([color.red, color.green, color.blue]);
    return fromByteArray(bytes);
  }

  private rgbwToBytes(color: RGBColor, white: number = 0): string {
    const bytes = new Uint8Array([color.red, color.green, color.blue, white]);
    return fromByteArray(bytes);
  }

  async connect(): Promise<boolean> {
    this.validateConfig();
    const config = this.config!;

    try {
      if (config.deviceId) {
        await bleService.connect(config.deviceId);
        return true;
      }

      if (config.deviceName) {
        return await this.connectByName(config.deviceName);
      }

      return await this.connectByServiceUUID();
    } catch (error) {
      logger.error('LEDController', 'Failed to connect', error);
      return false;
    }
  }

  private async connectByName(deviceName: string): Promise<boolean> {
    return new Promise((resolve) => {
      let foundDevice = false;

      logger.info(
        'LEDController',
        'Scanning for device by name (no UUID filter)',
        {
          deviceName,
        }
      );

      bleService.startScanning(async (device) => {
        logger.debug('LEDController', 'Device found during scan', {
          name: device.name,
          id: device.id,
        });

        if (device.name === deviceName && !foundDevice) {
          foundDevice = true;
          bleService.stopScanning();

          logger.info('LEDController', 'Matching device found, connecting', {
            name: device.name,
            id: device.id,
          });

          try {
            await bleService.connect(device.id);
            resolve(true);
          } catch (error) {
            logger.error(
              'LEDController',
              'Failed to connect to found device',
              error
            );
            resolve(false);
          }
        }
      }, undefined);

      setTimeout(() => {
        if (!foundDevice) {
          bleService.stopScanning();
          logger.warn('LEDController', 'Device not found', { deviceName });
          resolve(false);
        }
      }, 10000);
    });
  }

  private async connectByServiceUUID(): Promise<boolean> {
    return new Promise((resolve) => {
      let foundDevice = false;

      logger.info('LEDController', 'Scanning for first available BLE device');

      bleService.startScanning(async (device) => {
        logger.debug('LEDController', 'Device found during scan', {
          name: device.name,
          id: device.id,
        });

        if (!foundDevice) {
          foundDevice = true;
          bleService.stopScanning();

          logger.info('LEDController', 'Connecting to first device found', {
            id: device.id,
            name: device.name,
          });

          try {
            await bleService.connect(device.id);
            resolve(true);
          } catch (error) {
            logger.error(
              'LEDController',
              'Failed to connect to found device',
              error
            );
            resolve(false);
          }
        }
      }, undefined);

      setTimeout(() => {
        if (!foundDevice) {
          bleService.stopScanning();
          logger.warn('LEDController', 'No BLE devices found');
          resolve(false);
        }
      }, 10000);
    });
  }

  async setColor(color: RGBColor): Promise<boolean> {
    this.validateConfig();

    if (!bleService.isConnected()) {
      logger.warn('LEDController', 'Not connected to LED device');
      return false;
    }

    try {
      const colorBytes = this.rgbToBytes(color);
      await bleService.writeCharacteristic(
        this.config!.serviceUUID,
        this.config!.characteristicUUID,
        colorBytes
      );

      logger.info('LEDController', 'Color set', color);
      return true;
    } catch (error) {
      logger.error('LEDController', 'Failed to set color', error);
      return false;
    }
  }

  async setColorRGBW(color: RGBColor, white: number = 0): Promise<boolean> {
    this.validateConfig();

    if (!bleService.isConnected()) {
      logger.warn('LEDController', 'Not connected to LED device');
      return false;
    }

    try {
      const colorBytes = this.rgbwToBytes(color, white);
      await bleService.writeCharacteristic(
        this.config!.serviceUUID,
        this.config!.characteristicUUID,
        colorBytes
      );

      logger.info('LEDController', 'Color set (RGBW)', { ...color, white });
      return true;
    } catch (error) {
      logger.error('LEDController', 'Failed to set color (RGBW)', error);
      return false;
    }
  }

  async setColorHex(hexColor: string): Promise<boolean> {
    const rgb = this.hexToRgb(hexColor);
    if (!rgb) {
      logger.error('LEDController', 'Invalid hex color', { hexColor });
      return false;
    }
    return await this.setColor(rgb);
  }

  private hexToRgb(hex: string): RGBColor | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          red: parseInt(result[1], 16),
          green: parseInt(result[2], 16),
          blue: parseInt(result[3], 16),
        }
      : null;
  }

  async disconnect(): Promise<void> {
    await bleService.disconnect();
    logger.info('LEDController', 'Disconnected');
  }

  isConnected(): boolean {
    return bleService.isConnected();
  }

  getColorForTrigger(
    trigger: 'play_music' | 'ai_response' | 'load_offer'
  ): RGBColor {
    switch (trigger) {
      case 'play_music':
        return { red: 0, green: 255, blue: 0 };
      case 'ai_response':
        return { red: 0, green: 0, blue: 255 };
      case 'load_offer':
        return { red: 255, green: 165, blue: 0 };
      default:
        return { red: 255, green: 255, blue: 255 };
    }
  }

  async pulse(color: RGBColor, cycles = 3, cycleMs = 400): Promise<void> {
    if (!bleService.isConnected()) return;
    const dim = (c: RGBColor, scale: number): RGBColor => ({
      red: Math.round(c.red * scale),
      green: Math.round(c.green * scale),
      blue: Math.round(c.blue * scale),
    });
    for (let i = 0; i < cycles; i++) {
      await this.setColor(dim(color, 0.15));
      await new Promise((r) => setTimeout(r, cycleMs / 2));
      await this.setColor(color);
      await new Promise((r) => setTimeout(r, cycleMs / 2));
    }
  }
}

export const ledController = new LEDController();
