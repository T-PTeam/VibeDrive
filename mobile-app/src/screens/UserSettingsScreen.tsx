import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import * as Speech from 'expo-speech';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../App';
import { loadsService } from '../services/LoadsService';
import { speakDriverLine } from '../features/drive-assist/speakDriverLine';
import { TTS_MESSAGES } from '../features/drive-assist/ttsConstants';
import TtsVoiceSection from '../features/drive-assist/components/TtsVoiceSection';
import { loadNavigationQueries } from '../features/navigation/utils/navigationPrefs';
import { logAsyncError, logAsyncRejection } from '../utils/asyncErrors';

type UserSettingsScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'UserSettings'
>;
type UserSettingsScreenRouteProp = RouteProp<
  RootStackParamList,
  'UserSettings'
>;

interface Props {
  navigation: UserSettingsScreenNavigationProp;
  route: UserSettingsScreenRouteProp;
}

export default function UserSettingsScreen({ navigation, route }: Props) {
  const [weight, setWeight] = useState('');
  const [volume, setVolume] = useState('');
  const [loading, setLoading] = useState(false);
  const [destLabel, setDestLabel] = useState('');
  const userId = route.params?.userId ?? 'driver123';

  const refreshDest = useCallback(async () => {
    const param = route.params?.destQuery?.trim();
    if (param) {
      setDestLabel(param);
      return;
    }
    const stored = await loadNavigationQueries();
    setDestLabel(stored.dest?.trim() ?? '');
  }, [route.params?.destQuery]);

  const hydrateForm = useCallback(async () => {
    await refreshDest();
    const fromDb = await loadsService.getDriverSettings(userId);
    if (fromDb) {
      setWeight(
        typeof fromDb.weight_kg === 'number' && !Number.isNaN(fromDb.weight_kg)
          ? String(fromDb.weight_kg)
          : ''
      );
      setVolume(
        typeof fromDb.volume_m3 === 'number' && !Number.isNaN(fromDb.volume_m3)
          ? String(fromDb.volume_m3)
          : ''
      );
      if (fromDb.dest_city?.trim()) {
        setDestLabel(fromDb.dest_city.trim());
      }
      return;
    }
    const fromRedis = await loadsService.getActiveRoute(userId);
    if (fromRedis) {
      setWeight(
        typeof fromRedis.weight_kg === 'number' &&
          !Number.isNaN(fromRedis.weight_kg)
          ? String(fromRedis.weight_kg)
          : ''
      );
      setVolume(
        typeof fromRedis.volume_m3 === 'number' &&
          !Number.isNaN(fromRedis.volume_m3)
          ? String(fromRedis.volume_m3)
          : ''
      );
      if (fromRedis.dest_city?.trim()) {
        setDestLabel(fromRedis.dest_city.trim());
      }
    }
  }, [userId, refreshDest]);

  useEffect(() => {
    hydrateForm().catch(logAsyncRejection('UserSettingsScreen', 'hydrateForm'));
  }, [hydrateForm]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      hydrateForm().catch(
        logAsyncRejection('UserSettingsScreen', 'hydrateFormOnFocus')
      );
    });
    return unsub;
  }, [navigation, hydrateForm]);

  const handleSaveMonitoring = async () => {
    const dest = destLabel.trim();
    if (!dest) {
      Alert.alert(
        'Destination required',
        'Set a destination in Navigation (To field) first.'
      );
      return;
    }
    const weightNum = parseFloat(weight);
    const volumeNum = parseFloat(volume);
    if (isNaN(weightNum) || weightNum < 0) {
      Alert.alert('Error', 'Please enter a valid weight (kg)');
      return;
    }
    if (isNaN(volumeNum) || volumeNum < 0) {
      Alert.alert('Error', 'Please enter a valid volume (m³)');
      return;
    }
    setLoading(true);
    void speakDriverLine(TTS_MESSAGES.monitoringStarted).catch(
      logAsyncRejection('UserSettingsScreen', 'monitoringStartedTts')
    );
    try {
      const monitoringSession = await loadsService.startMonitoring(
        userId,
        dest,
        weightNum,
        volumeNum
      );
      if (monitoringSession) {
        setTimeout(() => {
          Alert.alert(
            'Monitoring started',
            `${dest}, ${weightNum} kg, ${volumeNum} m³`
          );
          navigation.goBack();
        }, 250);
      } else {
        try {
          Speech.stop();
        } catch (e) {
          logAsyncError('UserSettingsScreen', 'speechStopOnMonitoringError', e);
        }
        Alert.alert('Error', 'Failed to start monitoring. Please try again.');
      }
    } catch (e) {
      logAsyncError('UserSettingsScreen', 'startMonitoring', e);
      try {
        Speech.stop();
      } catch (err) {
        logAsyncError(
          'UserSettingsScreen',
          'speechStopOnStartMonitoringCatch',
          err
        );
      }
      Alert.alert('Error', 'Failed to start monitoring. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.form}>
          <Text style={styles.label}>Destination</Text>
          <Text style={styles.destReadonly}>{destLabel || '—'}</Text>
          <Text style={styles.label}>Weight (kg)</Text>
          <TextInput
            style={styles.input}
            placeholder="0"
            value={weight}
            onChangeText={setWeight}
            keyboardType="decimal-pad"
          />
          <Text style={styles.label}>Volume (m³)</Text>
          <TextInput
            style={styles.input}
            placeholder="0"
            value={volume}
            onChangeText={setVolume}
            keyboardType="decimal-pad"
          />
          <TtsVoiceSection userId={userId} />
          <TouchableOpacity
            style={styles.button}
            onPress={handleSaveMonitoring}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>Start monitoring</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    padding: 24,
    paddingBottom: 40,
  },
  form: {
    width: '100%',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 8,
  },
  destReadonly: {
    fontSize: 16,
    color: '#111111',
    marginBottom: 20,
    lineHeight: 22,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 16,
    marginBottom: 20,
    fontSize: 16,
    backgroundColor: '#ffffff',
  },
  button: {
    height: 50,
    backgroundColor: '#000000',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
