import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../App';
import { signalRService } from '../services/SignalRService';
import { clearPhpSession } from '../utils/phpSession';
import { locationService } from '../services/LocationService';
import { useDriveAssist } from '../features/drive-assist/useDriveAssist';
import { speakDriverLine } from '../features/drive-assist/speakDriverLine';
import { TTS_MESSAGES } from '../features/drive-assist/ttsConstants';
import DriveAssistMicControls from '../features/drive-assist/components/DriveAssistMicControls';
import { logAsyncError, logAsyncRejection } from '../utils/asyncErrors';

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
  const userId = route.params?.userId || 'driver123';
  const userName = route.params?.userName;
  const driveWelcomeSpokenRef = useRef(false);
  const { isRecording, isUploading, recordingDuration, handleMicrophonePress } =
    useDriveAssist(userId);

  useEffect(() => {
    if (driveWelcomeSpokenRef.current) {
      return;
    }
    driveWelcomeSpokenRef.current = true;
    void speakDriverLine(TTS_MESSAGES.welcomeDriving).catch(
      logAsyncRejection('DriveScreen', 'welcomeTts')
    );
  }, []);

  const handleLogout = async () => {
    try {
      locationService.stopWatching();
      await clearPhpSession();
      await signalRService.disconnect();
      navigation.replace('Login');
    } catch (e) {
      logAsyncError('DriveScreen', 'handleLogout', e);
    }
  };

  const handleViewPrices = () => {
    navigation.navigate('SubscriptionPrices');
  };

  const handleOpenUserSettings = () => {
    navigation.navigate('UserSettings', { userId });
  };

  const handleOpenNavigationDemo = () => {
    navigation.navigate('Navigation', { userId });
  };

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleOpenUserSettings}
          >
            <Text style={styles.headerButtonText}>Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleOpenNavigationDemo}
          >
            <Text style={styles.headerButtonText}>Nav</Text>
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
  }, [navigation, userId]);

  return (
    <View style={styles.container}>
      {userName ? (
        <Text style={styles.userLabel}>Logged in as {userName}</Text>
      ) : null}
      <DriveAssistMicControls
        variant="drive"
        isRecording={isRecording}
        isUploading={isUploading}
        recordingDuration={recordingDuration}
        onPress={handleMicrophonePress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  userLabel: {
    position: 'absolute',
    top: 24,
    alignSelf: 'center',
    zIndex: 1,
    fontSize: 14,
    color: '#888888',
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
