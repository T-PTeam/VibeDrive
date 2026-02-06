import * as AuthSession from 'expo-auth-session';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import { Alert, Platform } from 'react-native';
import { logger } from './LoggerService';

interface SpotifyTrack {
  uri?: string;
  trackId?: string;
  query?: string;
}

interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  scope?: string;
  expires_in: number;
  refresh_token?: string;
}

interface SpotifyDevice {
  id: string;
  is_active: boolean;
  name: string;
  type: string;
}

class SpotifyService {
  private isAuthenticated: boolean = false;
  private clientId: string = '';
  private redirectUri: string = '';

  private readonly accessTokenKey = 'spotify_access_token';
  private readonly refreshTokenKey = 'spotify_refresh_token';
  private readonly expiresAtKey = 'spotify_expires_at';

  initialize(clientId: string, redirectUri: string) {
    this.clientId = clientId;
    this.redirectUri = redirectUri;
    logger.info('SpotifyService', 'Initialized', { clientId, redirectUri });
  }

  async authenticate(): Promise<boolean> {
    try {
      if (!this.clientId) {
        Alert.alert(
          'Spotify',
          'Spotify client id is missing. Set EXPO_PUBLIC_SPOTIFY_CLIENT_ID.'
        );
        return false;
      }

      const redirectUri = this.getRedirectUri();
      const request = new AuthSession.AuthRequest({
        clientId: this.clientId,
        scopes: [
          'user-modify-playback-state',
          'user-read-playback-state',
          'user-read-email',
          'user-read-private',
          'streaming',
        ],
        redirectUri,
        responseType: AuthSession.ResponseType.Code,
        usePKCE: true,
        extraParams: {
          show_dialog: 'true',
        },
      });

      const discovery = this.getDiscovery();
      const result = await request.promptAsync(discovery);

      if (result.type !== 'success' || !result.params?.code) {
        logger.warn('SpotifyService', 'Authentication cancelled or failed', {
          type: result.type,
        });
        return false;
      }

      if (!request.codeVerifier) {
        logger.error('SpotifyService', 'Missing PKCE code verifier');
        return false;
      }

      const token = await this.exchangeCodeForToken({
        code: result.params.code,
        codeVerifier: request.codeVerifier,
        redirectUri,
      });

      if (!token?.access_token) {
        logger.warn('SpotifyService', 'Token exchange failed');
        return false;
      }

      await this.saveToken(token);
      this.isAuthenticated = true;
      logger.info('SpotifyService', 'Authenticated');
      return true;
    } catch (error) {
      logger.error('SpotifyService', 'Authentication failed', error);
      return false;
    }
  }

  async playTrack(track: SpotifyTrack): Promise<boolean> {
    try {
      const accessToken = await this.getValidAccessToken();
      if (!accessToken) {
        const didAuth = await this.authenticateWithPrompt();
        if (!didAuth) {
          return false;
        }
      }

      const finalAccessToken = await this.getValidAccessToken();
      if (!finalAccessToken) {
        return false;
      }

      const uri = await this.resolveUri(track, finalAccessToken);
      if (!uri) {
        return false;
      }

      const devices = await this.getDevices(finalAccessToken);
      if (devices.length === 0) {
        await this.openSpotifyApp(uri);
        Alert.alert(
          'Spotify',
          'Open Spotify once on this device, then try the command again.'
        );
        return false;
      }

      const preferred = devices.find((d) => d.is_active) ?? devices[0];

      const played = await this.playUriOnDevice(
        finalAccessToken,
        preferred.id,
        uri
      );
      if (played) {
        return true;
      }

      const transferred = await this.transferPlayback(
        finalAccessToken,
        preferred.id
      );
      if (!transferred) {
        await this.openSpotifyApp(uri);
        return false;
      }

      return await this.playUriOnDevice(finalAccessToken, preferred.id, uri);
    } catch (error) {
      logger.error('SpotifyService', 'Failed to play track', error);
      return false;
    }
  }

  async playMusic(command: string | any): Promise<boolean> {
    try {
      let track: SpotifyTrack;

      if (typeof command === 'string') {
        try {
          const parsed = JSON.parse(command);
          track = this.parseTrackData(parsed);
        } catch {
          track = { query: command };
        }
      } else if (typeof command === 'object') {
        track = this.parseTrackData(command);
      } else {
        logger.warn(
          'SpotifyService',
          'Invalid play_music command format',
          command
        );
        return false;
      }

      return await this.playTrack(track);
    } catch (error) {
      logger.error('SpotifyService', 'Failed to play music', error);
      return false;
    }
  }

  private parseTrackData(data: any): SpotifyTrack {
    if (data.uri) {
      return { uri: data.uri };
    }
    if (data.track_id || data.trackId) {
      return { trackId: data.track_id || data.trackId };
    }
    if (data.query || data.search || data.song || data.track) {
      return {
        query: data.query || data.search || data.song || data.track,
      };
    }
    if (typeof data === 'string') {
      return { query: data };
    }
    return { query: 'music' };
  }

  private getRedirectUri(): string {
    return this.redirectUri || 'vibedrive://spotify-callback';
  }

  private getDiscovery(): AuthSession.DiscoveryDocument {
    return {
      authorizationEndpoint: 'https://accounts.spotify.com/authorize',
      tokenEndpoint: 'https://accounts.spotify.com/api/token',
    };
  }

  private async authenticateWithPrompt(): Promise<boolean> {
    return await new Promise((resolve) => {
      Alert.alert(
        'Spotify Login',
        'Please login to Spotify to enable autoplay.',
        [
          {
            text: 'Login',
            onPress: async () => resolve(await this.authenticate()),
          },
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        ],
        { cancelable: true }
      );
    });
  }

  private async exchangeCodeForToken(params: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<SpotifyTokenResponse | null> {
    const body = new URLSearchParams({
      client_id: this.clientId,
      grant_type: 'authorization_code',
      code: params.code,
      redirect_uri: params.redirectUri,
      code_verifier: params.codeVerifier,
    });

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      logger.warn('SpotifyService', 'Token exchange HTTP error', {
        status: response.status,
        text,
      });
      return null;
    }

    return (await response.json()) as SpotifyTokenResponse;
  }

  private async refreshAccessToken(
    refreshToken: string
  ): Promise<SpotifyTokenResponse | null> {
    const body = new URLSearchParams({
      client_id: this.clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      logger.warn('SpotifyService', 'Token refresh HTTP error', {
        status: response.status,
        text,
      });
      return null;
    }

    return (await response.json()) as SpotifyTokenResponse;
  }

  private async saveToken(token: SpotifyTokenResponse): Promise<void> {
    const expiresAt = (Date.now() + token.expires_in * 1000).toString();
    await SecureStore.setItemAsync(this.accessTokenKey, token.access_token);
    await SecureStore.setItemAsync(this.expiresAtKey, expiresAt);
    if (token.refresh_token) {
      await SecureStore.setItemAsync(this.refreshTokenKey, token.refresh_token);
    }
  }

  private async loadToken(): Promise<{
    accessToken: string;
    refreshToken: string | null;
    expiresAt: number;
  } | null> {
    const accessToken = await SecureStore.getItemAsync(this.accessTokenKey);
    const expiresAtRaw = await SecureStore.getItemAsync(this.expiresAtKey);
    const refreshToken = await SecureStore.getItemAsync(this.refreshTokenKey);

    if (!accessToken || !expiresAtRaw) {
      return null;
    }

    const expiresAt = Number(expiresAtRaw);
    if (!Number.isFinite(expiresAt)) {
      return null;
    }

    return { accessToken, refreshToken, expiresAt };
  }

  private async getValidAccessToken(): Promise<string | null> {
    try {
      const token = await this.loadToken();
      if (!token) {
        return null;
      }

      const now = Date.now();
      if (token.expiresAt - now > 30_000) {
        return token.accessToken;
      }

      if (!token.refreshToken) {
        return null;
      }

      const refreshed = await this.refreshAccessToken(token.refreshToken);
      if (!refreshed?.access_token) {
        return null;
      }

      await this.saveToken({
        ...refreshed,
        refresh_token: refreshed.refresh_token ?? token.refreshToken,
      });

      return refreshed.access_token;
    } catch (error) {
      logger.error('SpotifyService', 'Failed to get valid access token', error);
      return null;
    }
  }

  private async spotifyApi<T>(
    accessToken: string,
    path: string,
    init?: RequestInit
  ): Promise<{
    ok: boolean;
    status: number;
    data: T | null;
    raw: string | null;
  }> {
    const response = await fetch(`https://api.spotify.com${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });

    const raw = await response.text();
    if (!response.ok) {
      return { ok: false, status: response.status, data: null, raw };
    }

    if (!raw) {
      return { ok: true, status: response.status, data: null, raw: null };
    }

    return {
      ok: true,
      status: response.status,
      data: JSON.parse(raw) as T,
      raw,
    };
  }

  private async resolveUri(
    track: SpotifyTrack,
    accessToken: string
  ): Promise<string | null> {
    if (track.uri) {
      return track.uri;
    }

    if (track.trackId) {
      return `spotify:track:${track.trackId}`;
    }

    if (!track.query) {
      Alert.alert('Spotify', 'No query provided.');
      return null;
    }

    const search = await this.spotifyApi<{
      tracks?: { items?: Array<{ uri: string }> };
    }>(
      accessToken,
      `/v1/search?q=${encodeURIComponent(track.query)}&type=track&limit=1&market=from_token`
    );

    if (!search.ok || !search.data?.tracks?.items?.length) {
      logger.warn('SpotifyService', 'Search failed or empty', {
        status: search.status,
        raw: search.raw,
      });
      await this.openSpotifyApp(
        `spotify:search:${encodeURIComponent(track.query)}`
      );
      return null;
    }

    return search.data.tracks.items[0].uri;
  }

  private async getDevices(accessToken: string): Promise<SpotifyDevice[]> {
    const result = await this.spotifyApi<{ devices: SpotifyDevice[] }>(
      accessToken,
      '/v1/me/player/devices'
    );

    if (!result.ok || !result.data?.devices) {
      logger.warn('SpotifyService', 'Failed to get devices', {
        status: result.status,
        raw: result.raw,
      });
      return [];
    }

    return result.data.devices;
  }

  private async playUriOnDevice(
    accessToken: string,
    deviceId: string,
    uri: string
  ): Promise<boolean> {
    const result = await this.spotifyApi<unknown>(
      accessToken,
      `/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`,
      {
        method: 'PUT',
        body: JSON.stringify({ uris: [uri] }),
      }
    );

    if (!result.ok) {
      logger.warn('SpotifyService', 'Play failed', {
        status: result.status,
        raw: result.raw,
      });
      return false;
    }

    logger.info('SpotifyService', 'Playback started', { deviceId, uri });
    return true;
  }

  private async transferPlayback(
    accessToken: string,
    deviceId: string
  ): Promise<boolean> {
    const result = await this.spotifyApi<unknown>(
      accessToken,
      '/v1/me/player',
      {
        method: 'PUT',
        body: JSON.stringify({ device_ids: [deviceId], play: false }),
      }
    );

    if (!result.ok) {
      logger.warn('SpotifyService', 'Transfer playback failed', {
        status: result.status,
        raw: result.raw,
      });
      return false;
    }

    return true;
  }

  private async openSpotifyApp(uri: string): Promise<void> {
    try {
      await Linking.openURL(uri);
    } catch (error) {
      logger.warn('SpotifyService', 'Failed to open Spotify app', error);

      if (uri.startsWith('spotify:track:')) {
        const id = uri.replace('spotify:track:', '');
        await Linking.openURL(`https://open.spotify.com/track/${id}`);
        return;
      }

      if (uri.startsWith('spotify:search:')) {
        const q = uri.replace('spotify:search:', '');
        await Linking.openURL(`https://open.spotify.com/search/${q}`);
        return;
      }

      if (Platform.OS === 'android') {
        await Linking.openURL(
          'https://play.google.com/store/apps/details?id=com.spotify.music'
        );
      }
    }
  }

  getIsAuthenticated(): boolean {
    return this.isAuthenticated;
  }

  setAuthenticated(authenticated: boolean) {
    this.isAuthenticated = authenticated;
  }
}

export const spotifyService = new SpotifyService();
