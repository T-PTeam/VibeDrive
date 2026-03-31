import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import type { RouteResultDto } from '../types/navigation';

type Props = {
  route: RouteResultDto;
  activeStepIndex: number;
};

export default function NavigationMap({ route, activeStepIndex }: Props) {
  const points = route.polyline;

  const initialRegion = {
    latitude: route.origin.latitude,
    longitude: route.origin.longitude,
    latitudeDelta: 1.2,
    longitudeDelta: 1.2,
  };

  return (
    <View style={styles.container}>
      <MapView style={styles.map} initialRegion={initialRegion}>
        <Marker
          coordinate={{
            latitude: route.origin.latitude,
            longitude: route.origin.longitude,
          }}
          title="Origin"
          description={route.origin.formatted}
        />
        <Marker
          coordinate={{
            latitude: route.destination.latitude,
            longitude: route.destination.longitude,
          }}
          title="Destination"
          description={route.destination.formatted}
        />
        {points.length > 0 ? (
          <Polyline
            coordinates={points.map((p) => ({
              latitude: p.latitude,
              longitude: p.longitude,
            }))}
            strokeColor="#0b57d0"
            strokeWidth={4}
          />
        ) : null}
      </MapView>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Directions</Text>
        <FlatList
          data={route.steps}
          keyExtractor={(_, idx) => String(idx)}
          renderItem={({ item, index }) => (
            <View
              style={[
                styles.stepRow,
                index === activeStepIndex && styles.stepRowActive,
              ]}
            >
              <Text style={styles.stepIndex}>{index + 1}.</Text>
              <View style={styles.stepBody}>
                <Text
                  style={[
                    styles.stepText,
                    index === activeStepIndex && styles.stepTextActive,
                  ]}
                >
                  {item.instruction}
                </Text>
                <Text style={styles.stepMeta}>
                  {Math.round(item.distance_meters)} m •{' '}
                  {Math.round(item.duration_seconds / 60)} min
                </Text>
              </View>
            </View>
          )}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  map: {
    flex: 1,
  },
  panel: {
    borderTopWidth: 1,
    borderTopColor: '#e5e5e5',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
    maxHeight: 280,
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    color: '#111111',
  },
  stepRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  stepRowActive: {
    backgroundColor: '#f5f9ff',
  },
  stepIndex: {
    width: 26,
    color: '#666666',
    fontWeight: '700',
  },
  stepBody: {
    flex: 1,
  },
  stepText: {
    color: '#111111',
    fontSize: 14,
    fontWeight: '600',
  },
  stepTextActive: {
    color: '#0b57d0',
  },
  stepMeta: {
    marginTop: 4,
    color: '#666666',
    fontSize: 12,
  },
});
