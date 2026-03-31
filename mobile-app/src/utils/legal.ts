import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { LEGAL_ACCEPTED_KEY } from '../constants/auth';

export function getTermsUrl(): string {
  return (
    (Constants.expoConfig?.extra?.termsOfUseUrl as string | undefined) ??
    'https://vibe-drive.store/terms'
  );
}

export function getPrivacyUrl(): string {
  return (
    (Constants.expoConfig?.privacyPolicyUrl as string | undefined) ??
    'https://vibe-drive.store/privacy'
  );
}

export async function openTerms(): Promise<void> {
  await WebBrowser.openBrowserAsync(getTermsUrl());
}

export async function openPrivacy(): Promise<void> {
  await WebBrowser.openBrowserAsync(getPrivacyUrl());
}

export async function saveLegalAccepted(): Promise<void> {
  await SecureStore.setItemAsync(LEGAL_ACCEPTED_KEY, 'true');
}

export async function getLegalAccepted(): Promise<boolean> {
  const value = await SecureStore.getItemAsync(LEGAL_ACCEPTED_KEY);
  return value === 'true';
}
