import React, { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import * as Speech from 'expo-speech';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import { RootStackParamList } from '../../App';
import { getPhpApiUrl } from '../config/api';

const SPEAKER_AUDIO_MODE = {
  allowsRecordingIOS: false,
  playsInSilentModeIOS: true,
  staysActiveInBackground: false,
  interruptionModeIOS: InterruptionModeIOS.DoNotMix,
  interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
  shouldDuckAndroid: false,
  playThroughEarpieceAndroid: false,
};

async function activateLoudspeakerThenSpeak(
  text: string,
  onError: (err: unknown) => void
): Promise<void> {
  await Audio.setAudioModeAsync(SPEAKER_AUDIO_MODE);
  let silentSound: Audio.Sound | null = null;
  try {
    const { sound } = await Audio.Sound.createAsync({
      uri: 'https://raw.githubusercontent.com/anars/blank-audio/master/1-second-of-silence.mp3',
    });
    silentSound = sound;
    await sound.playAsync();
  } catch (_) {}
  Speech.speak(text, {
    language: 'en-US',
    pitch: 1.05,
    rate: 0.92,
    volume: 1.0,
    onStart: () => {
      logger.debug('DriveScreen', 'AI TTS started');
    },
    onDone: () => {
      logger.debug('DriveScreen', 'AI TTS finished');
      if (silentSound) {
        silentSound.unloadAsync().catch(() => {});
      }
    },
    onError: (err) => {
      logger.error('DriveScreen', 'AI TTS error', err);
      if (silentSound) {
        silentSound.unloadAsync().catch(() => {});
      }
      onError(err);
    },
  });
}
import { signalRService } from '../services/SignalRService';
import { logger } from '../services/LoggerService';
import { audioRecordingService } from '../services/AudioRecordingService';
import { redisService } from '../services/RedisService';
import { spotifyService } from '../services/SpotifyService';
import { ledController } from '../services/LEDController';
import LoadOfferCard, { LoadOfferPayload } from '../components/LoadOfferCard';
import { loadsService } from '../services/LoadsService';
import { locationService } from '../services/LocationService';
import type { ActiveRouteDto } from '../types/loads';

type DriveScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'Drive'
>;

type DriveScreenRouteProp = RouteProp<RootStackParamList, 'Drive'>;

interface Props {
  navigation: DriveScreenNavigationProp;
  route: DriveScreenRouteProp;
}

const LED_SERVICE_UUID = '00001111-0000-1000-8000-00805f9b34fb';
const LED_CHARACTERISTIC_UUID = '00002222-0000-1000-8000-00805f9b34fb';
const LED_DEVICE_NAME = 'VibeDrive Controller';

export default function DriveScreen({ navigation, route }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [ledConnecting, setLedConnecting] = useState(false);
  const [ledConnected, setLedConnected] = useState(false);
  const [spotifyTesting, setSpotifyTesting] = useState(false);
  const [loadOffer, setLoadOffer] = useState<LoadOfferPayload | null>(null);
  const [activeRoute, setActiveRoute] = useState<ActiveRouteDto | null>(null);
  const userId = route.params?.userId || 'driver123';

  const fetchActiveRoute = useCallback(async () => {
    const route = await loadsService.getActiveRoute(userId);
    setActiveRoute(route);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      fetchActiveRoute();
      const phpUrl = getPhpApiUrl();
      locationService.setBaseUrl(phpUrl);
      locationService.requestPermissions().then((granted) => {
        if (granted) locationService.startWatching(userId);
      });
      return () => locationService.stopWatching();
    }, [fetchActiveRoute, userId])
  );

  useEffect(() => {
    const connectSignalR = async () => {
      signalRService.setUserId(userId);
      try {
        await signalRService.connect();
      } catch (error) {
        logger.error('DriveScreen', 'Failed to connect to SignalR', error);
      }
    };

    const setSpeakerAudioMode = async () => {
      try {
        await Audio.setAudioModeAsync(SPEAKER_AUDIO_MODE);
      } catch (e) {
        logger.warn('DriveScreen', 'setSpeakerAudioMode failed', e);
      }
    };

    const initializeServices = async () => {
      await setSpeakerAudioMode();
      ledController.initialize({
        serviceUUID: LED_SERVICE_UUID,
        characteristicUUID: LED_CHARACTERISTIC_UUID,
        deviceName: LED_DEVICE_NAME,
      });
      const hasPermission = await audioRecordingService.requestPermissions();
      if (!hasPermission) {
        Alert.alert(
          'Microphone Permission',
          'Microphone permission is required to record audio. Please enable it in settings.'
        );
      }

      const spotifyClientId = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID || '';
      const spotifyRedirectUri =
        process.env.EXPO_PUBLIC_SPOTIFY_REDIRECT_URI ||
        'vibedrive://spotify-callback';
      if (spotifyClientId) {
        spotifyService.initialize(spotifyClientId, spotifyRedirectUri);
      }
    };

    const setupSignalRHandlers = () => {
      signalRService.onMessage('play_music', async (message, parsed) => {
        logger.info('DriveScreen', 'Received play_music command', {
          message,
          parsed,
        });

        const trackData = parsed?.data || parsed?.track || message;
        const success = await spotifyService.playMusic(trackData);

        if (!success) {
          logger.warn('DriveScreen', 'Failed to play music', { trackData });
        } else {
          Alert.alert('Music', 'Playing music on Spotify');
        }

        if (ledController.isConnected()) {
          const color = ledController.getColorForTrigger('play_music');
          await ledController.setColor(color);
        }
      });

      signalRService.onMessage('ai_response', async (message, parsed) => {
        logger.info('DriveScreen', 'Received AI response', {
          message,
          parsed,
        });

        const aiMessage =
          typeof parsed?.data?.message === 'string'
            ? parsed.data.message
            : typeof parsed?.message === 'string'
              ? parsed.message
              : typeof message === 'string'
                ? message
                : null;
        if (aiMessage) {
          try {
            Speech.stop();
            await activateLoudspeakerThenSpeak(aiMessage, () => {
              Alert.alert('AI Assistant', aiMessage);
            });
            logger.info('DriveScreen', 'Spoke AI response', {
              message: aiMessage,
            });
          } catch (error) {
            logger.error('DriveScreen', 'Failed to speak AI response', error);
            Alert.alert('AI Assistant', aiMessage);
          }
        }

        if (ledController.isConnected()) {
          const color = ledController.getColorForTrigger('ai_response');
          await ledController.setColor(color);
        }
      });

      signalRService.onMessage('LoadOffer', (_message, parsed) => {
        const raw = parsed?.payload ?? parsed;
        if (!raw || typeof raw !== 'object') return;
        const p = raw as Record<string, unknown>;
        const payload: LoadOfferPayload = {
          id: String(p.id ?? p.load_id ?? ''),
          origin: String(p.origin ?? p.origin_city ?? ''),
          destination: String(
            p.destination ?? p.dest_city ?? p.destination_city ?? ''
          ),
          rate:
            typeof p.rate === 'number'
              ? p.rate
              : Number(p.rate) || String(p.rate ?? ''),
          currency: p.currency != null ? String(p.currency) : undefined,
          weightKg:
            p.weightKg != null
              ? Number(p.weightKg)
              : p.weight_kg != null
                ? Number(p.weight_kg)
                : undefined,
          volumeM3:
            p.volumeM3 != null
              ? Number(p.volumeM3)
              : p.volume_m3 != null
                ? Number(p.volume_m3)
                : undefined,
          distanceKm:
            p.distanceKm != null
              ? Number(p.distanceKm)
              : p.distance_km != null
                ? Number(p.distance_km)
                : undefined,
          source: p.source != null ? String(p.source) : undefined,
        };
        if (payload.id && payload.origin && payload.destination) {
          setLoadOffer(payload);
          const rateStr =
            typeof payload.rate === 'number'
              ? payload.rate.toLocaleString()
              : String(payload.rate);
          const phrase = `New load offer: ${payload.origin} to ${payload.destination}, ${payload.currency ?? 'USD'} ${rateStr}`;
          Speech.stop();
          Speech.speak(phrase, {
            language: 'en-US',
            pitch: 1.05,
            rate: 0.92,
            volume: 1.0,
          });
          if (ledController.isConnected()) {
            ledController.pulse(ledController.getColorForTrigger('load_offer'));
          }
        }
      });
    };

    connectSignalR();
    initializeServices();
    setupSignalRHandlers();

    return () => {
      signalRService.removeMessageHandler('play_music');
      signalRService.removeMessageHandler('ai_response');
      signalRService.removeMessageHandler('LoadOffer');
      signalRService.disconnect();
      if (audioRecordingService.getIsRecording()) {
        audioRecordingService.cancelRecording();
      }
    };
  }, [userId]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isRecording) {
      interval = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setRecordingDuration(0);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isRecording]);

  const handleMicrophonePress = async () => {
    if (isRecording) {
      try {
        setIsUploading(true);
        const result = await audioRecordingService.stopRecording();
        setIsRecording(false);
        setRecordingDuration(0);

        if (result) {
          logger.info('DriveScreen', 'Recording stopped', result);
          const success = await redisService.publishAudioRecording(
            userId,
            result.uri,
            result.duration
          );

          if (!success) {
            Alert.alert(
              'Warning',
              'Recording saved but failed to publish to Redis'
            );
          }
        }
      } catch (error) {
        logger.error('DriveScreen', 'Failed to process recording', error);
        Alert.alert('Error', 'Failed to process recording. Please try again.');
      } finally {
        setIsUploading(false);
      }
    } else {
      try {
        await audioRecordingService.startRecording();
        setIsRecording(true);
        setRecordingDuration(0);
      } catch (error) {
        logger.error('DriveScreen', 'Failed to start recording', error);
        Alert.alert('Error', 'Failed to start recording. Please try again.');
      }
    }
  };

  const handleLogout = async () => {
    await signalRService.disconnect();
    navigation.replace('Login');
  };

  const handleViewPrices = () => {
    navigation.navigate('SubscriptionPrices');
  };

  const handleRouteSetup = () => {
    navigation.navigate('RouteSetup', { userId });
  };

  const handleConnectLED = async () => {
    setLedConnecting(true);
    try {
      const ok = await ledController.connect();
      setLedConnected(ok);
      if (ok) {
        Alert.alert('LED', 'Connected to ' + LED_DEVICE_NAME);
      } else {
        Alert.alert(
          'LED',
          'Could not find "' +
            LED_DEVICE_NAME +
            '". Make sure the virtual peripheral is advertising and uses service UUID ' +
            LED_SERVICE_UUID
        );
      }
    } catch (e) {
      setLedConnected(false);
      Alert.alert('LED', 'Connect failed. Is Bluetooth on?');
    } finally {
      setLedConnecting(false);
    }
  };

  const handleDisconnectLED = async () => {
    await ledController.disconnect();
    setLedConnected(false);
  };

  const handleTestSpotify = async () => {
    const spotifyClientId = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID || '';
    if (!spotifyClientId) {
      Alert.alert(
        'Spotify',
        'Set EXPO_PUBLIC_SPOTIFY_CLIENT_ID in .env and restart the app.'
      );
      return;
    }
    setSpotifyTesting(true);
    try {
      const success = await spotifyService.playMusic({ query: 'music' });
      if (success) {
        Alert.alert('Music', 'Playing on Spotify');
      } else {
        Alert.alert(
          'Spotify',
          'Play failed. Check: 1) Redirect URI in Spotify Dashboard 2) Spotify app open or Premium account.'
        );
      }
    } catch (error) {
      logger.error('DriveScreen', 'Test Spotify error', error);
      Alert.alert('Spotify', 'Error: ' + String(error));
    } finally {
      setSpotifyTesting(false);
    }
  };

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={ledConnected ? handleDisconnectLED : handleConnectLED}
            disabled={ledConnecting}
          >
            <Text style={styles.headerButtonText}>
              {ledConnecting ? '...' : ledConnected ? 'LED ✓' : 'LED'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleRouteSetup}
          >
            <Text style={styles.headerButtonText}>Route</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleViewPrices}
          >
            <Text style={styles.headerButtonText}>Subscription</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerButton, styles.logoutButton]}
            onPress={handleLogout}
          >
            <Text style={[styles.headerButtonText, styles.logoutButtonText]}>
              Logout
            </Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, ledConnected, ledConnecting, spotifyTesting]);

  const handleLoadOfferAccept = async (id: string) => {
    setLoadOffer(null);
    try {
      const newRoute = await loadsService.acceptLoad(userId, id);
      if (newRoute) {
        setActiveRoute(newRoute);
        Alert.alert(
          'Load accepted',
          `Route is now ${newRoute.origin_city} to ${newRoute.dest_city}.`
        );
      } else {
        Alert.alert('Error', 'Failed to accept load. Please try again.');
      }
    } catch (e) {
      logger.error('DriveScreen', 'Accept load failed', e);
      Alert.alert('Error', 'Failed to accept load. Please try again.');
    }
  };

  const handleLoadOfferDismiss = (id: string) => {
    setLoadOffer(null);
  };

  const handleLoadOfferClose = () => {
    setLoadOffer(null);
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {activeRoute ? (
          <Text style={styles.routeText}>
            Route: {activeRoute.origin_city} → {activeRoute.dest_city}
          </Text>
        ) : (
          <Text style={styles.routeText}>No active route</Text>
        )}
        <TouchableOpacity
          style={[
            styles.microphoneButton,
            isRecording && styles.microphoneButtonActive,
          ]}
          onPress={handleMicrophonePress}
          activeOpacity={0.8}
          accessibilityLabel="Microphone"
          accessibilityRole="button"
        >
          <Text style={styles.microphoneIcon}>🎤</Text>
        </TouchableOpacity>
        {isRecording && (
          <Text style={styles.statusText}>
            Recording...{' '}
            {recordingDuration > 0 && `${Math.floor(recordingDuration)}s`}
          </Text>
        )}
        {isUploading && (
          <View style={styles.uploadingContainer}>
            <ActivityIndicator size="small" color="#888888" />
            <Text style={styles.uploadingText}>Uploading...</Text>
          </View>
        )}
      </View>
      <LoadOfferCard
        visible={!!loadOffer}
        load={loadOffer}
        onAccept={handleLoadOfferAccept}
        onDismiss={handleLoadOfferDismiss}
        onClose={handleLoadOfferClose}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  microphoneButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#333333',
  },
  microphoneButtonActive: {
    backgroundColor: '#2a2a2a',
    borderColor: '#ff4444',
  },
  microphoneIcon: {
    fontSize: 48,
  },
  routeText: {
    fontSize: 14,
    color: '#888888',
    marginBottom: 16,
  },
  statusText: {
    marginTop: 24,
    fontSize: 14,
    color: '#888888',
  },
  uploadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  uploadingText: {
    fontSize: 14,
    color: '#888888',
    marginLeft: 8,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#1a1a1a',
    marginRight: 8,
  },
  logoutButton: {
    backgroundColor: '#ff4444',
  },
  headerButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  logoutButtonText: {
    color: '#ffffff',
  },
});
