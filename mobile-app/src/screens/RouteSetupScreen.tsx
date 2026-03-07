import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../App';
import { loadsService } from '../services/LoadsService';

type RouteSetupScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'RouteSetup'
>;
type RouteSetupScreenRouteProp = RouteProp<RootStackParamList, 'RouteSetup'>;

interface Props {
  navigation: RouteSetupScreenNavigationProp;
  route: RouteSetupScreenRouteProp;
}

export default function RouteSetupScreen({ navigation, route }: Props) {
  const [city, setCity] = useState('');
  const [weight, setWeight] = useState('');
  const [volume, setVolume] = useState('');
  const [loading, setLoading] = useState(false);
  const userId = route.params?.userId ?? 'driver123';

  const handleStartMonitoring = async () => {
    if (!city.trim()) {
      Alert.alert('Error', 'Please enter a city');
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
    try {
      const activeRoute = await loadsService.startMonitoring(
        userId,
        city.trim(),
        weightNum,
        volumeNum
      );
      if (activeRoute) {
        Alert.alert(
          'Monitoring started',
          `${city.trim()}, ${weightNum} kg, ${volumeNum} m³`
        );
        navigation.goBack();
      } else {
        Alert.alert('Error', 'Failed to start monitoring. Please try again.');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to start monitoring. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.form}>
          <Text style={styles.label}>City</Text>
          <TextInput
            style={styles.input}
            placeholder="Destination city"
            value={city}
            onChangeText={setCity}
            autoCapitalize="words"
            autoCorrect={false}
          />
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
          <TouchableOpacity
            style={styles.button}
            onPress={handleStartMonitoring}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>Start Monitoring</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    flex: 1,
    padding: 24,
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
