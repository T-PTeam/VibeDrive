import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  AppState,
  Switch,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import * as Speech from 'expo-speech';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { RootStackParamList } from '../../App';
import { logger } from '../services/LoggerService';
import { signalRService } from '../services/SignalRService';
import {
  audioRecordingService,
  RecordingResult,
} from '../services/AudioRecordingService';
import { redisService } from '../services/RedisService';
import { spotifyService } from '../services/SpotifyService';
import { ledController } from '../services/LEDController';
import { apiService } from '../services/ApiService';
import { PHP_API_TOKEN_KEY } from '../constants/auth';
import { wakeWordService } from '../services/wakeWordService';
import { vadService } from '../services/vadService';
import { audioDuckingService } from '../services/audioDuckingService';
import { configureAudioSessionForHandsFree } from '../services/audioSessionConfig';
import {
  STORAGE_HANDS_FREE_ENABLED,
  STORAGE_VAD_PAUSE_PRESET,
  STORAGE_VAD_PRESET,
  VAD_PAUSE_PRESET_TO_MS,
  VAD_PRESET_TO_DB,
  VadPausePreset,
  VadPreset,
} from '../constants/handsFree';

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
  const [chatSessionId, setChatSessionId] = useState<number | null>(null);
  const [handsFreeModeActive, setHandsFreeModeActive] = useState(false);
  const userId = route.params?.userId || 'driver123';
  const userName = route.params?.userName;

  const chatSessionIdRef = useRef<number | null>(null);
  chatSessionIdRef.current = chatSessionId;

  const handsFreeModeRef = useRef(false);
  handsFreeModeRef.current = handsFreeModeActive;

  const handsFreeCaptureRef = useRef(false);
  const processingWakeRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);

  const finalizeRecordingRef = useRef<
    (result: RecordingResult) => Promise<void>
  >(async () => {});

  finalizeRecordingRef.current = async (result: RecordingResult) => {
    const token = await SecureStore.getItemAsync(PHP_API_TOKEN_KEY);
    if (token) {
      logger.info('DriveScreen', 'Sending audio to chat API', {
        hasToken: true,
        hasSessionId: chatSessionIdRef.current != null,
      });
      const chatResult = await apiService.sendAudioToChat(
        result.uri,
        token,
        chatSessionIdRef.current
      );
      logger.info('DriveScreen', 'Chat API result received', {
        hasResult: chatResult != null,
        sessionId: chatResult?.session_id ?? null,
        hasData: chatResult?.data != null,
        dataKeys: chatResult?.data ? Object.keys(chatResult.data) : [],
      });
      if (chatResult) {
        setChatSessionId(chatResult.session_id);
        const toolCalls = Array.isArray(chatResult.data?.tool_calls)
          ? chatResult.data.tool_calls
          : [];
        const playMusicCall = toolCalls.find((toolCall) => {
          if (!toolCall || typeof toolCall !== 'object') return false;
          const name =
            typeof (toolCall as Record<string, unknown>).name === 'string'
              ? (toolCall as Record<string, unknown>).name
              : '';
          return name === 'play_music';
        }) as { arguments?: Record<string, unknown> } | undefined;
        if (playMusicCall) {
          const args =
            playMusicCall.arguments &&
            typeof playMusicCall.arguments === 'object'
              ? playMusicCall.arguments
              : {};
          const success = await spotifyService.playMusic(args);
          logger.info('DriveScreen', 'Handled play_music tool call', {
            success,
            args,
          });
          if (!success) {
            if (spotifyService.getLastPlayWasSearchFallbackOnly()) {
              Alert.alert(
                'Spotify',
                'No matching track for autoplay. Spotify was opened with search results — pick a track or choose a device, then try again.'
              );
            } else {
              Alert.alert(
                'Spotify',
                'Could not start playback. Open Spotify and try again.'
              );
            }
          }
        }
        const assistantMessage = chatResult.data?.assistant_message as
          | { content?: unknown }
          | undefined;
        const assistantText =
          typeof assistantMessage?.content === 'string'
            ? assistantMessage.content
            : null;
        if (assistantText) {
          try {
            Speech.stop();
            await activateLoudspeakerThenSpeak(assistantText, () => {
              Alert.alert('AI Assistant', assistantText);
            });
            logger.info('DriveScreen', 'Spoke AI response from chat API', {
              message: assistantText,
            });
          } catch (error) {
            logger.error(
              'DriveScreen',
              'Failed to speak AI response from chat API',
              error
            );
            Alert.alert('AI Assistant', assistantText);
          }
        } else {
          Alert.alert(
            'No AI response',
            'Request succeeded but assistant message was empty.'
          );
        }
      } else {
        setChatSessionId(null);
        Alert.alert(
          'No AI response',
          'Chat request completed but returned no response payload.'
        );
      }
    } else {
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
  };

  const restartHandsFreeWake = async () => {
    if (!handsFreeModeRef.current) {
      return;
    }
    if (appStateRef.current !== 'active') {
      return;
    }
    const reason = wakeWordService.getUnavailableReason();
    if (reason) {
      return;
    }
    try {
      await configureAudioSessionForHandsFree();
      await wakeWordService.start(() => {
        void processWakeRef.current();
      });
    } catch (e) {
      logger.error('DriveScreen', 'restartHandsFreeWake failed', e);
    }
  };

  const processWakeRef = useRef<() => Promise<void>>(async () => {});

  processWakeRef.current = async () => {
    if (processingWakeRef.current) {
      return;
    }
    if (!handsFreeModeRef.current) {
      return;
    }
    if (audioRecordingService.getIsRecording()) {
      return;
    }
    processingWakeRef.current = true;
    try {
      await wakeWordService.stop();
      await audioDuckingService.duck();
      await audioRecordingService.startHandsFreeRecording();
      handsFreeCaptureRef.current = true;
      setIsRecording(true);
      setRecordingDuration(0);
      const rec = audioRecordingService.getRecording();
      if (!rec) {
        handsFreeCaptureRef.current = false;
        setIsRecording(false);
        await audioRecordingService.cancelRecording().catch(() => {});
        await audioDuckingService.restore();
        try {
          await Audio.setAudioModeAsync(SPEAKER_AUDIO_MODE);
        } catch (e) {
          logger.warn('DriveScreen', 'restore speaker after missing rec', e);
        }
        await restartHandsFreeWake();
        return;
      }
      vadService.start(async () => {
        setIsUploading(true);
        try {
          vadService.stop();
          const result = await audioRecordingService.stopRecording();
          setIsRecording(false);
          setRecordingDuration(0);
          handsFreeCaptureRef.current = false;
          if (result) {
            await finalizeRecordingRef.current(result);
          }
        } catch (error: unknown) {
          const message =
            (error as { message?: string })?.message ||
            'Failed to process recording. Please try again.';
          if (typeof message === 'string' && message.includes('rate limit')) {
            logger.warn('DriveScreen', message);
          } else {
            logger.error('DriveScreen', 'Hands-free finalize failed', error);
          }
          Alert.alert('Error', message);
        } finally {
          setIsUploading(false);
          await audioDuckingService.restore();
          try {
            await Audio.setAudioModeAsync(SPEAKER_AUDIO_MODE);
          } catch (e) {
            logger.warn('DriveScreen', 'restore speaker mode failed', e);
          }
          await restartHandsFreeWake();
        }
      }, rec);
    } catch (error) {
      logger.error('DriveScreen', 'Hands-free wake pipeline failed', error);
      handsFreeCaptureRef.current = false;
      setIsRecording(false);
      await audioRecordingService.cancelRecording().catch(() => {});
      await audioDuckingService.restore();
      try {
        await Audio.setAudioModeAsync(SPEAKER_AUDIO_MODE);
      } catch (e) {
        logger.warn('DriveScreen', 'restore speaker after error failed', e);
      }
      await restartHandsFreeWake();
    } finally {
      processingWakeRef.current = false;
    }
  };

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

      try {
        const hf = await AsyncStorage.getItem(STORAGE_HANDS_FREE_ENABLED);
        if (hf === '1' || hf === 'true') {
          if (!wakeWordService.getUnavailableReason()) {
            setHandsFreeModeActive(true);
          }
        }
        const raw = await AsyncStorage.getItem(STORAGE_VAD_PRESET);
        if (raw === 'quiet' || raw === 'normal' || raw === 'noisy') {
          vadService.updateConfig({
            silenceThresholdDb: VAD_PRESET_TO_DB[raw as VadPreset],
          });
        }
        const rawPause = await AsyncStorage.getItem(STORAGE_VAD_PAUSE_PRESET);
        if (
          rawPause === 'short' ||
          rawPause === 'standard' ||
          rawPause === 'long'
        ) {
          vadService.updateConfig({
            silenceDurationMs:
              VAD_PAUSE_PRESET_TO_MS[rawPause as VadPausePreset],
          });
        }
      } catch (e) {
        logger.warn('DriveScreen', 'AsyncStorage hands-free init failed', e);
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
    };

    connectSignalR();
    initializeServices();
    setupSignalRHandlers();

    return () => {
      signalRService.removeMessageHandler('play_music');
      signalRService.removeMessageHandler('ai_response');
      signalRService.disconnect();
      if (audioRecordingService.getIsRecording()) {
        audioRecordingService.cancelRecording();
      }
      void wakeWordService.stop();
      vadService.stop();
    };
  }, [userId]);

  useEffect(() => {
    if (!handsFreeModeActive) {
      void wakeWordService.stop();
      vadService.stop();
      void Audio.setAudioModeAsync(SPEAKER_AUDIO_MODE).catch((e) =>
        logger.warn('DriveScreen', 'speaker mode on hands-free off', e)
      );
      return;
    }
    const reason = wakeWordService.getUnavailableReason();
    if (reason) {
      return;
    }
    void (async () => {
      try {
        await configureAudioSessionForHandsFree();
        await wakeWordService.start(() => {
          void processWakeRef.current();
        });
      } catch (e) {
        logger.error('DriveScreen', 'Failed to start wake listener', e);
      }
    })();
    return () => {
      void wakeWordService.stop();
    };
  }, [handsFreeModeActive]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      appStateRef.current = next;
      if (next === 'background' || next === 'inactive') {
        void wakeWordService.stop();
        vadService.stop();
        if (handsFreeCaptureRef.current) {
          void (async () => {
            handsFreeCaptureRef.current = false;
            vadService.stop();
            await audioRecordingService.cancelRecording().catch(() => {});
            setIsRecording(false);
            setRecordingDuration(0);
            await audioDuckingService.restore();
            try {
              await Audio.setAudioModeAsync(SPEAKER_AUDIO_MODE);
            } catch (e) {
              logger.warn(
                'DriveScreen',
                'AppState background audio restore',
                e
              );
            }
          })();
        }
      } else if (next === 'active') {
        if (
          handsFreeModeRef.current &&
          !wakeWordService.getUnavailableReason() &&
          !audioRecordingService.getIsRecording()
        ) {
          void restartHandsFreeWake();
        }
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

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
        vadService.stop();
        handsFreeCaptureRef.current = false;
        const result = await audioRecordingService.stopRecording();
        setIsRecording(false);
        setRecordingDuration(0);

        if (result) {
          logger.info('DriveScreen', 'Recording stopped', result);
          try {
            await finalizeRecordingRef.current(result);
          } catch (error: unknown) {
            const message =
              (error as { message?: string })?.message ||
              'Failed to process recording. Please try again.';
            if (typeof message === 'string' && message.includes('rate limit')) {
              logger.warn('DriveScreen', message);
            } else {
              logger.error('DriveScreen', 'Failed to process recording', error);
            }
            Alert.alert('Error', message);
          }
        }
        await audioDuckingService.restore();
        if (handsFreeModeRef.current) {
          await restartHandsFreeWake();
        }
      } catch (error: unknown) {
        const message =
          (error as { message?: string })?.message ||
          'Failed to process recording. Please try again.';
        if (typeof message === 'string' && message.includes('rate limit')) {
          logger.warn('DriveScreen', message);
        } else {
          logger.error('DriveScreen', 'Failed to process recording', error);
        }
        Alert.alert('Error', message);
      } finally {
        setIsUploading(false);
      }
    } else {
      try {
        vadService.stop();
        await wakeWordService.stop();
        await audioRecordingService.startRecording();
        setIsRecording(true);
        setRecordingDuration(0);
      } catch (error) {
        logger.error('DriveScreen', 'Failed to start recording', error);
        Alert.alert('Error', 'Failed to start recording. Please try again.');
      }
    }
  };

  const handsFreeUnavailable = wakeWordService.getUnavailableReason();

  const onHandsFreeToggle = async (value: boolean) => {
    if (value && handsFreeUnavailable) {
      return;
    }
    setHandsFreeModeActive(value);
    try {
      await AsyncStorage.setItem(
        STORAGE_HANDS_FREE_ENABLED,
        value ? 'true' : 'false'
      );
    } catch (e) {
      logger.warn('DriveScreen', 'Failed to persist hands-free preference', e);
    }
    if (!value) {
      vadService.stop();
      handsFreeCaptureRef.current = false;
      await wakeWordService.stop();
      if (audioRecordingService.getIsRecording()) {
        await audioRecordingService.cancelRecording();
        setIsRecording(false);
        setRecordingDuration(0);
      }
      await audioDuckingService.restore();
      try {
        await Audio.setAudioModeAsync(SPEAKER_AUDIO_MODE);
      } catch (e) {
        logger.warn('DriveScreen', 'speaker restore on toggle off', e);
      }
    }
  };

  const handleLogout = async () => {
    await SecureStore.deleteItemAsync(PHP_API_TOKEN_KEY);
    await signalRService.disconnect();
    navigation.replace('Login');
  };

  const handleViewPrices = () => {
    navigation.navigate('SubscriptionPrices');
  };

  const handleOpenSettings = () => {
    navigation.navigate('Settings');
  };

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleOpenSettings}
          >
            <Text style={styles.headerButtonText}>⚙</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleViewPrices}
          >
            <Text style={styles.headerButtonText}>Plans</Text>
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
  }, [navigation]);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {userName ? (
          <Text style={styles.userLabel}>Logged in as {userName}</Text>
        ) : null}
        <View style={styles.handsFreeRow}>
          <Text style={styles.handsFreeLabel}>Hands-free</Text>
          <Switch
            value={handsFreeModeActive}
            onValueChange={(v) => void onHandsFreeToggle(v)}
            disabled={!!handsFreeUnavailable}
            trackColor={{ false: '#333333', true: '#3355aa' }}
            thumbColor={handsFreeModeActive ? '#ffffff' : '#888888'}
          />
        </View>
        {handsFreeUnavailable ? (
          <Text style={styles.banner}>{handsFreeUnavailable}</Text>
        ) : null}
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
  userLabel: {
    position: 'absolute',
    top: 24,
    fontSize: 14,
    color: '#888888',
  },
  handsFreeRow: {
    position: 'absolute',
    top: 56,
    left: 24,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  handsFreeLabel: {
    fontSize: 16,
    color: '#cccccc',
    fontWeight: '600',
  },
  banner: {
    position: 'absolute',
    top: 100,
    left: 24,
    right: 24,
    fontSize: 13,
    color: '#aa8866',
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
