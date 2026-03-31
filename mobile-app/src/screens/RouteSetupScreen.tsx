import React, { useState } from 'react';
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
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../App';
import { loadsService } from '../services/LoadsService';
import { routeSetupParseService } from '../services/RouteSetupParseService';
import { applyRouteSetupParseResult } from '../features/routeSetup/utils/applyRouteSetupParseResult';

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
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('');
  const [weight, setWeight] = useState('');
  const [volume, setVolume] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiHint, setAiHint] = useState('');
  const userId = route.params?.userId ?? 'driver123';

  const handleFillWithAi = async () => {
    if (!description.trim()) {
      Alert.alert('Error', 'Enter a description to fill with AI');
      return;
    }
    setAiLoading(true);
    setAiHint('');
    try {
      const parsed = await routeSetupParseService.parseRouteSetup(description);
      if (!parsed) {
        Alert.alert(
          'Error',
          'Could not fill fields. Check your connection and that the API is running.'
        );
        return;
      }
      applyRouteSetupParseResult({
        parsed,
        setCity,
        setWeight,
        setVolume,
        setAiHint,
      });
    } finally {
      setAiLoading(false);
    }
  };

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
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.form}>
          <Text style={styles.label}>Describe route (optional)</Text>
          <TextInput
            style={styles.inputMultiline}
            placeholder="e.g. Delivery to Berlin, 12 tons, about 90 cubic meters"
            value={description}
            onChangeText={setDescription}
            multiline
            textAlignVertical="top"
            autoCorrect
          />
          <TouchableOpacity
            style={[
              styles.secondaryButton,
              (aiLoading || !description.trim()) &&
                styles.secondaryButtonDisabled,
            ]}
            onPress={handleFillWithAi}
            disabled={aiLoading || !description.trim()}
          >
            {aiLoading ? (
              <ActivityIndicator color="#000000" />
            ) : (
              <Text style={styles.secondaryButtonText}>Fill with AI</Text>
            )}
          </TouchableOpacity>
          {aiHint ? <Text style={styles.aiHint}>{aiHint}</Text> : null}
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
  inputMultiline: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    marginBottom: 12,
    fontSize: 16,
    backgroundColor: '#ffffff',
  },
  secondaryButton: {
    height: 48,
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: '#ffffff',
  },
  secondaryButtonDisabled: {
    opacity: 0.45,
  },
  secondaryButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '600',
  },
  aiHint: {
    fontSize: 14,
    color: '#555555',
    marginBottom: 20,
    lineHeight: 20,
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
