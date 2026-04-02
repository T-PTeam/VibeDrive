import { useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import * as Speech from 'expo-speech';
import * as SecureStore from 'expo-secure-store';
import { signalRService } from '../../services/SignalRService';
import { logger } from '../../services/LoggerService';
import { speakDriverLine } from './speakDriverLine';
import { DRIVE_SPEAKER_AUDIO_MODE } from './ttsConstants';
import { Audio } from 'expo-av';
import { audioRecordingService } from '../../services/AudioRecordingService';
import { redisService } from '../../services/RedisService';
import { spotifyService } from '../../services/SpotifyService';
import { ledController } from '../../services/LEDController';
import { apiService } from '../../services/ApiService';
import { PHP_API_TOKEN_KEY } from '../../constants/auth';
import { logAsyncError } from '../../utils/asyncErrors';

const LED_SERVICE_UUID = '00001111-0000-1000-8000-00805f9b34fb';
const LED_CHARACTERISTIC_UUID = '00002222-0000-1000-8000-00805f9b34fb';
const LED_DEVICE_NAME = 'VibeDrive Controller';

type DriveAssistOptions = {
  onProposeNavigationDestination?: (destQuery: string) => void;
};

export function useDriveAssist(userId: string, options?: DriveAssistOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [chatSessionId, setChatSessionId] = useState<number | null>(null);

  useEffect(() => {
    const connectSignalR = async () => {
      signalRService.setUserId(userId);
      try {
        await signalRService.connect();
      } catch (error) {
        logger.error('DriveAssist', 'Failed to connect to SignalR', error);
      }
    };

    const setSpeakerAudioMode = async () => {
      try {
        await Audio.setAudioModeAsync(DRIVE_SPEAKER_AUDIO_MODE);
      } catch (e) {
        logger.warn('DriveAssist', 'setSpeakerAudioMode failed', e);
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
        try {
          logger.info('DriveAssist', 'Received play_music command', {
            message,
            parsed,
          });

          const trackData = parsed?.data || parsed?.track || message;
          const success = await spotifyService.playMusic(trackData);

          if (!success) {
            logger.warn('DriveAssist', 'Failed to play music', { trackData });
          } else {
            Alert.alert('Music', 'Playing music on Spotify');
          }

          if (ledController.isConnected()) {
            const color = ledController.getColorForTrigger('play_music');
            await ledController.setColor(color);
          }
        } catch (e) {
          logAsyncError('useDriveAssist', 'signalRPlayMusic', e);
        }
      });

      signalRService.onMessage('ai_response', async (message, parsed) => {
        try {
          logger.info('DriveAssist', 'Received AI response', {
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
              await speakDriverLine(aiMessage, () => {
                Alert.alert('AI Assistant', aiMessage);
              });
              logger.info('DriveAssist', 'Spoke AI response', {
                message: aiMessage,
              });
            } catch (error) {
              logger.error('DriveAssist', 'Failed to speak AI response', error);
              Alert.alert('AI Assistant', aiMessage);
            }
          }

          if (ledController.isConnected()) {
            const color = ledController.getColorForTrigger('ai_response');
            await ledController.setColor(color);
          }
        } catch (e) {
          logAsyncError('useDriveAssist', 'signalRAiResponse', e);
        }
      });
    };

    connectSignalR();
    void initializeServices().catch((e) =>
      logAsyncError('useDriveAssist', 'initializeServices', e)
    );
    setupSignalRHandlers();

    return () => {
      signalRService.removeMessageHandler('play_music');
      signalRService.removeMessageHandler('ai_response');
      signalRService.disconnect();
      if (audioRecordingService.getIsRecording()) {
        audioRecordingService.cancelRecording();
      }
    };
  }, [userId]);

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

  const handleMicrophonePress = useCallback(async () => {
    if (isRecording) {
      try {
        setIsUploading(true);
        const result = await audioRecordingService.stopRecording();
        setIsRecording(false);
        setRecordingDuration(0);

        if (result) {
          logger.info('DriveAssist', 'Recording stopped', result);
          const token = await SecureStore.getItemAsync(PHP_API_TOKEN_KEY);
          if (token) {
            logger.info('DriveAssist', 'Sending audio to chat API', {
              hasToken: true,
              hasSessionId: chatSessionId != null,
            });
            const chatResult = await apiService.sendAudioToChat(
              result.uri,
              token,
              chatSessionId
            );
            logger.info('DriveAssist', 'Chat API result received', {
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
              const navDestCall = toolCalls.find((toolCall) => {
                if (!toolCall || typeof toolCall !== 'object') return false;
                const name =
                  typeof (toolCall as Record<string, unknown>).name === 'string'
                    ? (toolCall as Record<string, unknown>).name
                    : '';
                return name === 'set_navigation_destination';
              }) as { arguments?: Record<string, unknown> } | undefined;
              if (navDestCall && options?.onProposeNavigationDestination) {
                const args =
                  navDestCall.arguments &&
                  typeof navDestCall.arguments === 'object'
                    ? navDestCall.arguments
                    : {};
                const destQuery =
                  typeof (args as Record<string, unknown>).dest_query ===
                  'string'
                    ? ((args as Record<string, unknown>).dest_query as string)
                    : '';
                if (destQuery.trim()) {
                  options.onProposeNavigationDestination(destQuery.trim());
                }
              }
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
                logger.info('DriveAssist', 'Handled play_music tool call', {
                  success,
                  args,
                });
                if (!success) {
                  Alert.alert(
                    'Spotify',
                    'Could not start playback. Open Spotify and try again.'
                  );
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
                  await speakDriverLine(assistantText, () => {
                    Alert.alert('AI Assistant', assistantText);
                  });
                  logger.info(
                    'DriveAssist',
                    'Spoke AI response from chat API',
                    {
                      message: assistantText,
                    }
                  );
                } catch (error) {
                  logger.error(
                    'DriveAssist',
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
        }
      } catch (error: unknown) {
        const err = error as { message?: string };
        const message =
          err?.message || 'Failed to process recording. Please try again.';
        if (message.includes('rate limit')) {
          logger.warn('DriveAssist', message);
        } else {
          logger.error('DriveAssist', 'Failed to process recording', error);
        }
        Alert.alert('Error', message);
      } finally {
        setIsUploading(false);
      }
    } else {
      try {
        await audioRecordingService.startRecording();
        setIsRecording(true);
        setRecordingDuration(0);
      } catch (error) {
        logger.error('DriveAssist', 'Failed to start recording', error);
        Alert.alert('Error', 'Failed to start recording. Please try again.');
      }
    }
  }, [chatSessionId, isRecording, userId, options]);

  return {
    isRecording,
    isUploading,
    recordingDuration,
    handleMicrophonePress,
  };
}
