import React, { useState, useEffect } from 'react';
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
import { RootStackParamList } from '../../App';
import { signalRService } from '../services/SignalRService';
import { logger } from '../services/LoggerService';
import { audioRecordingService } from '../services/AudioRecordingService';
import { redisService } from '../services/RedisService';
import { spotifyService } from '../services/SpotifyService';

type DriveScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'Drive'
>;

type DriveScreenRouteProp = RouteProp<RootStackParamList, 'Drive'>;

interface Props {
  navigation: DriveScreenNavigationProp;
  route: DriveScreenRouteProp;
}

export default function DriveScreen({ navigation, route }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const userId = route.params?.userId || 'driver123';

  useEffect(() => {
    const connectSignalR = async () => {
      signalRService.setUserId(userId);
      try {
        await signalRService.connect();
      } catch (error) {
        logger.error('DriveScreen', 'Failed to connect to SignalR', error);
      }
    };

    const initializeServices = async () => {
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
      });

      signalRService.onMessage('ai_response', async (message, parsed) => {
        logger.info('DriveScreen', 'Received AI response', {
          message,
          parsed,
        });

        const aiMessage = parsed?.data?.message || parsed?.message || message;
        if (aiMessage) {
          try {
            Speech.speak(aiMessage, {
              language: 'en',
              pitch: 1.0,
              rate: 0.9,
            });
            logger.info('DriveScreen', 'Spoke AI response', {
              message: aiMessage,
            });
          } catch (error) {
            logger.error('DriveScreen', 'Failed to speak AI response', error);
            Alert.alert('AI Assistant', aiMessage);
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

          if (success) {
            Alert.alert(
              'Success',
              'Audio recording saved and published to Redis'
            );
          } else {
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

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerButtons}>
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
