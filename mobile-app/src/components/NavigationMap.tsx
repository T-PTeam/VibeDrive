import React, { useRef, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Platform } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import type { RouteResultDto } from '../types/navigation';
import { GOOGLE_MAP_DARK_STYLE } from '../features/navigation/constants/googleMapDarkStyle';

type UserCoord = { latitude: number; longitude: number };

type Props = {
  route: RouteResultDto | null;
  activeStepIndex: number;
  userCoordinate: UserCoord | null;
  heading: number | null;
  isDriving: boolean;
};

const FALLBACK_REGION = {
  latitude: 15,
  longitude: 10,
  latitudeDelta: 55,
  longitudeDelta: 55,
};

const ROUTE_LINE_BLUE = '#5b9fff';

export default function NavigationMap({
  route: routeData,
  activeStepIndex,
  userCoordinate,
  heading,
  isDriving,
}: Props) {
  const mapRef = useRef<MapView>(null);
  const points = routeData?.polyline ?? [];

  useEffect(() => {
    if (!routeData || !mapRef.current) {
      return;
    }
    const coords = routeData.polyline.map((p) => ({
      latitude: p.latitude,
      longitude: p.longitude,
    }));
    if (coords.length >= 2) {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 56, right: 28, bottom: 220, left: 28 },
        animated: true,
      });
    } else {
      mapRef.current.animateCamera(
        {
          center: {
            latitude: routeData.origin.latitude,
            longitude: routeData.origin.longitude,
          },
          zoom: 11,
        },
        { duration: 450 }
      );
    }
  }, [routeData]);

  const initialRegion = useMemo(() => {
    if (routeData) {
      return {
        latitude: routeData.origin.latitude,
        longitude: routeData.origin.longitude,
        latitudeDelta: 1.2,
        longitudeDelta: 1.2,
      };
    }
    if (userCoordinate) {
      return {
        latitude: userCoordinate.latitude,
        longitude: userCoordinate.longitude,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      };
    }
    return FALLBACK_REGION;
  }, [routeData, userCoordinate?.latitude, userCoordinate?.longitude]);

  useEffect(() => {
    if (!isDriving || !userCoordinate || !mapRef.current) {
      return;
    }
    const id = requestAnimationFrame(() => {
      mapRef.current?.animateCamera(
        {
          center: userCoordinate,
          pitch: 0,
          heading: heading ?? 0,
          zoom: 17,
        },
        { duration: 450 }
      );
    });
    return () => cancelAnimationFrame(id);
  }, [userCoordinate?.latitude, userCoordinate?.longitude, heading, isDriving]);

  useEffect(() => {
    if (routeData != null || !userCoordinate || !mapRef.current) {
      return;
    }
    const id = requestAnimationFrame(() => {
      mapRef.current?.animateCamera(
        {
          center: userCoordinate,
          pitch: 0,
          heading: heading ?? 0,
          zoom: 14,
        },
        { duration: 400 }
      );
    });
    return () => cancelAnimationFrame(id);
  }, [routeData, userCoordinate?.latitude, userCoordinate?.longitude, heading]);

  const panelMaxHeight = isDriving ? 160 : 280;

  const mapStyleProps =
    Platform.OS === 'android'
      ? { customMapStyle: GOOGLE_MAP_DARK_STYLE }
      : { userInterfaceStyle: 'dark' as const };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton={false}
        rotateEnabled
        pitchEnabled={false}
        {...mapStyleProps}
      >
        {routeData ? (
          <>
            <Marker
              coordinate={{
                latitude: routeData.origin.latitude,
                longitude: routeData.origin.longitude,
              }}
              title="Origin"
              description={routeData.origin.formatted}
            />
            <Marker
              coordinate={{
                latitude: routeData.destination.latitude,
                longitude: routeData.destination.longitude,
              }}
              title="Destination"
              description={routeData.destination.formatted}
            />
            {points.length > 0 ? (
              <Polyline
                coordinates={points.map((p) => ({
                  latitude: p.latitude,
                  longitude: p.longitude,
                }))}
                strokeColor={ROUTE_LINE_BLUE}
                strokeWidth={4}
              />
            ) : null}
          </>
        ) : null}
      </MapView>

      <View style={[styles.panel, { maxHeight: panelMaxHeight }]}>
        <Text style={styles.panelTitle}>Directions</Text>
        {routeData && routeData.steps.length > 0 ? (
          <FlatList
            data={routeData.steps}
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
        ) : (
          <Text style={styles.panelHint}>
            Set where you are going, then tap Apply to see turn-by-turn steps.
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  map: {
    flex: 1,
  },
  panel: {
    borderTopWidth: 1,
    borderTopColor: '#2a2a3a',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: '#12121a',
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    color: '#e8e8ea',
  },
  panelHint: {
    color: '#a0a0a8',
    fontSize: 14,
    lineHeight: 20,
  },
  stepRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3a',
  },
  stepRowActive: {
    backgroundColor: '#1a2438',
  },
  stepIndex: {
    width: 26,
    color: '#8a8a94',
    fontWeight: '700',
  },
  stepBody: {
    flex: 1,
  },
  stepText: {
    color: '#e8e8ea',
    fontSize: 14,
    fontWeight: '600',
  },
  stepTextActive: {
    color: ROUTE_LINE_BLUE,
  },
  stepMeta: {
    marginTop: 4,
    color: '#8a8a94',
    fontSize: 12,
  },
});
