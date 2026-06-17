import * as SecureStore from 'expo-secure-store';
import { logAsyncError } from './asyncErrors';
import {
  PHP_API_TOKEN_KEY,
  PHP_API_USER_ID_KEY,
  PHP_API_USER_NAME_KEY,
} from '../constants/auth';

export async function savePhpSession(
  token: string,
  userId: string,
  userName?: string
): Promise<void> {
  try {
    await SecureStore.setItemAsync(PHP_API_TOKEN_KEY, token);
    await SecureStore.setItemAsync(PHP_API_USER_ID_KEY, userId);
    if (userName != null && userName !== '') {
      await SecureStore.setItemAsync(PHP_API_USER_NAME_KEY, userName);
    } else {
      await SecureStore.deleteItemAsync(PHP_API_USER_NAME_KEY);
    }
  } catch (e) {
    logAsyncError('phpSession', 'savePhpSession', e);
    throw e;
  }
}

export async function clearPhpSession(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PHP_API_TOKEN_KEY);
    await SecureStore.deleteItemAsync(PHP_API_USER_ID_KEY);
    await SecureStore.deleteItemAsync(PHP_API_USER_NAME_KEY);
  } catch (e) {
    logAsyncError('phpSession', 'clearPhpSession', e);
    throw e;
  }
}
