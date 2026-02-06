import { logger } from './LoggerService';

let BleManager: any;
let State: any;
let isBLESupported: boolean | null = null;

class BLEService {
  private manager: any = null;
  private connectedDevice: any = null;
  private isScanning: boolean = false;
  private scanSubscription: any = null;

  constructor() {}

  private ensureBLE(): boolean {
    if (isBLESupported !== null) {
      return isBLESupported && this.manager !== null;
    }
    try {
      const bleModule = require('react-native-ble-plx');
      BleManager = bleModule.BleManager;
      State = bleModule.State;
      this.manager = new BleManager();
      this.setupStateListener();
      isBLESupported = true;
      return true;
    } catch (error) {
      logger.warn(
        'BLEService',
        'BLE not available (use a development build for BLE support)'
      );
      isBLESupported = false;
      return false;
    }
  }

  private setupStateListener() {
    if (!this.manager || !isBLESupported) {
      return;
    }
    try {
      this.manager.onStateChange((state: any) => {
        if (state === State.PoweredOn) {
          logger.info('BLEService', 'Bluetooth is powered on');
        } else if (state === State.PoweredOff) {
          logger.warn('BLEService', 'Bluetooth is powered off');
          this.disconnect();
        } else if (state === State.Unauthorized) {
          logger.error('BLEService', 'Bluetooth permission denied');
        }
      });
    } catch (error) {
      logger.error('BLEService', 'Failed to setup state listener', error);
    }
  }

  async checkBluetoothState(): Promise<boolean> {
    if (!this.ensureBLE()) {
      return false;
    }
    try {
      const state = await this.manager.state();
      return state === State.PoweredOn;
    } catch (error) {
      logger.error('BLEService', 'Failed to check Bluetooth state', error);
      return false;
    }
  }

  async startScanning(
    onDeviceFound: (device: any) => void,
    serviceUUIDs?: string[]
  ): Promise<void> {
    if (!this.ensureBLE()) {
      logger.warn('BLEService', 'BLE scanning not available');
      return;
    }
    if (this.isScanning) {
      logger.warn('BLEService', 'Scan already in progress');
      return;
    }

    const isPoweredOn = await this.checkBluetoothState();
    if (!isPoweredOn) {
      throw new Error('Bluetooth is not powered on');
    }

    this.isScanning = true;
    logger.info('BLEService', 'Starting BLE scan', { serviceUUIDs });

    this.scanSubscription = this.manager.startDeviceScan(
      serviceUUIDs,
      { allowDuplicates: false },
      (error: any, device: any) => {
        if (error) {
          logger.error('BLEService', 'BLE scan error', error);
          this.isScanning = false;
          return;
        }

        if (device) {
          logger.debug('BLEService', 'Device found', {
            id: device.id,
            name: device.name,
            rssi: device.rssi,
          });
          onDeviceFound(device);
        }
      }
    );
  }

  stopScanning(): void {
    if (this.scanSubscription && this.manager) {
      this.manager.stopDeviceScan();
      this.scanSubscription = null;
      this.isScanning = false;
      logger.info('BLEService', 'BLE scan stopped');
    }
  }

  async connect(deviceId: string): Promise<any> {
    if (!this.ensureBLE()) {
      throw new Error('BLE not available (use a development build for BLE)');
    }
    try {
      logger.info('BLEService', 'Connecting to device', { deviceId });

      if (this.connectedDevice) {
        await this.disconnect();
      }

      const device = await this.manager.connectToDevice(deviceId);
      await device.discoverAllServicesAndCharacteristics();

      this.connectedDevice = device;
      logger.info('BLEService', 'Device connected', {
        id: device.id,
        name: device.name,
      });

      device.onDisconnected((error: any, device: any) => {
        logger.warn('BLEService', 'Device disconnected', {
          id: device?.id,
          error: error?.message,
        });
        this.connectedDevice = null;
      });

      return device;
    } catch (error) {
      logger.error('BLEService', 'Failed to connect to device', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connectedDevice) {
      try {
        await this.connectedDevice.cancelConnection();
        logger.info('BLEService', 'Device disconnected');
      } catch (error) {
        logger.error('BLEService', 'Error disconnecting device', error);
      }
      this.connectedDevice = null;
    }
  }

  getConnectedDevice(): any {
    return this.connectedDevice;
  }

  isConnected(): boolean {
    return this.connectedDevice !== null;
  }

  async writeCharacteristic(
    serviceUUID: string,
    characteristicUUID: string,
    value: string
  ): Promise<void> {
    if (!this.connectedDevice) {
      throw new Error('No device connected');
    }

    try {
      await this.connectedDevice.writeCharacteristicWithResponseForService(
        serviceUUID,
        characteristicUUID,
        value
      );
      logger.debug('BLEService', 'Characteristic written', {
        serviceUUID,
        characteristicUUID,
      });
    } catch (error) {
      logger.error('BLEService', 'Failed to write characteristic', error);
      throw error;
    }
  }

  async readCharacteristic(
    serviceUUID: string,
    characteristicUUID: string
  ): Promise<string | null> {
    if (!this.connectedDevice) {
      throw new Error('No device connected');
    }

    try {
      const characteristic =
        await this.connectedDevice.readCharacteristicForService(
          serviceUUID,
          characteristicUUID
        );
      return characteristic.value || null;
    } catch (error) {
      logger.error('BLEService', 'Failed to read characteristic', error);
      throw error;
    }
  }

  destroy(): void {
    this.stopScanning();
    this.disconnect();
    if (this.manager) {
      try {
        this.manager.destroy();
        logger.info('BLEService', 'BLE manager destroyed');
      } catch (error) {
        logger.error('BLEService', 'Error destroying BLE manager', error);
      }
    }
  }
}

export const bleService = new BLEService();
