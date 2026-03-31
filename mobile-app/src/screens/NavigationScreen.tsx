import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { RootStackParamList } from '../../App';
import { navigationService } from '../services/NavigationService';
import NavigationMap from '../components/NavigationMap';
import type { RouteResultDto } from '../types/navigation';

type NavigationScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'Navigation'
>;

type NavigationScreenRouteProp = RouteProp<RootStackParamList, 'Navigation'>;

interface Props {
  navigation: NavigationScreenNavigationProp;
  route: NavigationScreenRouteProp;
}

export default function NavigationScreen({ route }: Props) {
  const originQuery = route.params.originQuery;
  const destQuery = route.params.destQuery;

  const [data, setData] = useState<RouteResultDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const lastSpokenStepIndexRef = useRef<number | null>(null);

  const title = useMemo(() => {
    const o = originQuery.trim();
    const d = destQuery.trim();
    return o && d ? `${o} → ${d}` : 'Navigation';
  }, [originQuery, destQuery]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    navigationService
      .getRoute(originQuery, destQuery)
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          Alert.alert('Navigation', 'Could not fetch route. Please try again.');
          setData(null);
          return;
        }
        setData(result);
        setActiveStepIndex(0);
        lastSpokenStepIndexRef.current = null;
      })
      .catch(() => {
        if (cancelled) return;
        Alert.alert('Navigation', 'Could not fetch route. Please try again.');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [originQuery, destQuery]);

  useEffect(() => {
    if (!data) return;

    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    const start = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 6000,
          distanceInterval: 20,
        },
        (pos) => {
          if (cancelled) return;
          const steps = data.steps;
          if (steps.length === 0) return;

          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;

          const nextIdx = Math.min(activeStepIndex, steps.length - 1);
          const next = steps[nextIdx];
          const metersToEnd = distanceMeters(
            lat,
            lon,
            next.end.latitude,
            next.end.longitude
          );

          if (metersToEnd < 35 && nextIdx < steps.length - 1) {
            setActiveStepIndex(nextIdx + 1);
          }
        }
      );
    };

    start().catch(() => undefined);

    return () => {
      cancelled = true;
      if (subscription) subscription.remove();
    };
  }, [data, activeStepIndex]);

  useEffect(() => {
    if (!data) return;
    const steps = data.steps;
    if (steps.length === 0) return;
    if (lastSpokenStepIndexRef.current === activeStepIndex) return;

    const step = steps[activeStepIndex];
    if (!step?.instruction) return;
    lastSpokenStepIndexRef.current = activeStepIndex;
    Speech.stop();
    Speech.speak(step.instruction, {
      language: 'en-US',
      rate: 0.95,
      pitch: 1.02,
    });
  }, [data, activeStepIndex]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" color="#666666" />
        <Text style={styles.centerText}>Loading route…</Text>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerTitle}>{title}</Text>
        <Text style={styles.centerText}>No route available.</Text>
      </View>
    );
  }

  return <NavigationMap route={data} activeStepIndex={activeStepIndex} />;
}

function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#ffffff',
  },
  centerTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    color: '#111111',
    textAlign: 'center',
  },
  centerText: {
    marginTop: 8,
    color: '#666666',
    textAlign: 'center',
  },
});
