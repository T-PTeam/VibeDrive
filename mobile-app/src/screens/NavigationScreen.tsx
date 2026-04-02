import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { RootStackParamList } from '../../App';
import { PHP_API_TOKEN_KEY } from '../constants/auth';
import { navigationService } from '../services/NavigationService';
import { loadsService } from '../services/LoadsService';
import { locationService } from '../services/LocationService';
import { signalRService } from '../services/SignalRService';
import { clearPhpSession } from '../utils/phpSession';
import NavigationMap from '../components/NavigationMap';
import type { RouteResultDto } from '../types/navigation';
import { useDriveAssist } from '../features/drive-assist/useDriveAssist';
import {
  speakDriverLine,
  buildTtsSpeechOptions,
  getResolvedTtsSpeechOptions,
} from '../features/drive-assist/speakDriverLine';
import { TTS_MESSAGES } from '../features/drive-assist/ttsConstants';
import DriveAssistMicControls from '../features/drive-assist/components/DriveAssistMicControls';
import NavigationFields from '../features/navigation/components/NavigationFields';
import DestinationChangePrompt from '../features/navigation/components/DestinationChangePrompt';
import {
  loadNavigationQueries,
  loadLastUserLocation,
  saveLastUserLocation,
  saveNavigationQueries,
} from '../features/navigation/utils/navigationPrefs';
import { formatGeocodedAddress } from '../features/navigation/utils/formatGeocodedAddress';
import { logAsyncError, logAsyncRejection } from '../utils/asyncErrors';

type NavigationScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'Navigation'
>;

type NavigationScreenRouteProp = RouteProp<RootStackParamList, 'Navigation'>;

interface Props {
  navigation: NavigationScreenNavigationProp;
  route: NavigationScreenRouteProp;
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

export default function NavigationScreen({ navigation, route }: Props) {
  const userId = route.params?.userId ?? 'driver123';

  const [data, setData] = useState<RouteResultDto | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const activeStepIndexRef = useRef(0);
  const [isDriving, setIsDriving] = useState(false);
  const [originText, setOriginText] = useState('');
  const [destText, setDestText] = useState('');
  const [pendingDestQuery, setPendingDestQuery] = useState<string | null>(null);
  const [userCoordinate, setUserCoordinate] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const lastSpokenStepIndexRef = useRef<number | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const skippedLoadDestCityRef = useRef<string | null>(null);
  const destTextRef = useRef('');
  const originTextRef = useRef('');
  const lastPersistedLocationRef = useRef<{
    lat: number;
    lon: number;
    at: number;
  } | null>(null);

  const applyRoute = useCallback(
    async (nextOrigin: string, nextDest: string): Promise<boolean> => {
      const o = nextOrigin.trim();
      const d = nextDest.trim();
      if (!o || !d) {
        Alert.alert('Navigation', 'Please enter both From and To.');
        return false;
      }
      setIsApplying(true);
      try {
        const result = await navigationService.getRoute(o, d);
        if (!result) {
          Alert.alert('Navigation', 'Could not fetch route. Please try again.');
          return false;
        }
        setData(result);
        setActiveStepIndex(0);
        lastSpokenStepIndexRef.current = null;
        await saveNavigationQueries(o, d);
        return true;
      } catch (e) {
        logAsyncError('NavigationScreen', 'applyRoute', e);
        Alert.alert('Navigation', 'Could not fetch route. Please try again.');
        return false;
      } finally {
        setIsApplying(false);
      }
    },
    []
  );

  const handleStartDriving = useCallback(async () => {
    const ok = await applyRoute(originText, destText);
    if (ok) {
      setIsDriving(true);
      void speakDriverLine(TTS_MESSAGES.welcomeDriving).catch(
        logAsyncRejection('NavigationScreen', 'startDrivingTts')
      );
    }
  }, [applyRoute, originText, destText]);

  const handleAcceptProposedDest = useCallback(() => {
    const proposed = pendingDestQuery;
    if (!proposed) return;
    setPendingDestQuery(null);
    setDestText(proposed);
    applyRoute(originText, proposed).catch(
      logAsyncRejection('NavigationScreen', 'applyProposedDest')
    );
  }, [applyRoute, originText, pendingDestQuery]);

  const handleRejectProposedDest = useCallback(() => {
    setPendingDestQuery(null);
  }, []);

  const { isRecording, isUploading, recordingDuration, handleMicrophonePress } =
    useDriveAssist(userId, {
      onProposeNavigationDestination: (proposed) => {
        setPendingDestQuery(proposed);
      },
    });

  const refreshAuthInHeader = useCallback(() => {
    SecureStore.getItemAsync(PHP_API_TOKEN_KEY)
      .then((t) => {
        setIsLoggedIn(!!t?.trim());
      })
      .catch(logAsyncRejection('NavigationScreen', 'refreshAuthInHeader'));
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshAuthInHeader();
    }, [refreshAuthInHeader])
  );

  useEffect(() => {
    destTextRef.current = destText;
    originTextRef.current = originText;
  }, [destText, originText]);

  useFocusEffect(
    useCallback(() => {
      if (bootstrapping) {
        return;
      }
      let cancelled = false;
      (async () => {
        const active = await loadsService.getActiveRoute(userId);
        if (cancelled) {
          return;
        }
        const loadDest = active?.dest_city?.trim() ?? '';
        if (!loadDest) {
          return;
        }
        const nLoad = normalizeDestCompare(loadDest);
        const nCurrent = normalizeDestCompare(destTextRef.current);
        if (nLoad === nCurrent) {
          skippedLoadDestCityRef.current = null;
          return;
        }
        if (skippedLoadDestCityRef.current === nLoad) {
          return;
        }
        Alert.alert(
          'Update navigation?',
          `Your route destination is now ${loadDest}. Update the destination field and recalculate the route?`,
          [
            {
              text: 'Not now',
              style: 'cancel',
              onPress: () => {
                skippedLoadDestCityRef.current = nLoad;
              },
            },
            {
              text: 'Update',
              onPress: () => {
                skippedLoadDestCityRef.current = null;
                setDestText(loadDest);
                const o = originTextRef.current.trim();
                if (o) {
                  applyRoute(o, loadDest).catch(
                    logAsyncRejection(
                      'NavigationScreen',
                      'applyRouteFromLoadDestPrompt'
                    )
                  );
                }
              },
            },
          ]
        );
      })().catch(
        logAsyncRejection('NavigationScreen', 'checkActiveRouteDestChange')
      );
      return () => {
        cancelled = true;
      };
    }, [bootstrapping, userId, applyRoute])
  );

  const handleLogout = useCallback(async () => {
    try {
      locationService.stopWatching();
      await clearPhpSession();
      await signalRService.disconnect();
      setIsLoggedIn(false);
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    } catch (e) {
      logAsyncError('NavigationScreen', 'handleLogout', e);
    }
  }, [navigation]);

  const handleOpenUserSettings = useCallback(() => {
    navigation.navigate('UserSettings', {
      userId,
      destQuery: destText.trim() || undefined,
    });
  }, [navigation, userId, destText]);

  const handleViewPrices = useCallback(() => {
    navigation.navigate('SubscriptionPrices');
  }, [navigation]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={handleOpenUserSettings}
            style={styles.headerAction}
            accessibilityRole="button"
            accessibilityLabel="User settings"
          >
            <Text style={styles.headerActionText}>Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleViewPrices}
            style={styles.headerAction}
            accessibilityRole="button"
            accessibilityLabel="Subscription plans"
          >
            <Text style={styles.headerActionText}>Plans</Text>
          </TouchableOpacity>
          {isLoggedIn ? (
            <TouchableOpacity
              onPress={() => {
                handleLogout().catch(
                  logAsyncRejection('NavigationScreen', 'headerLogout')
                );
              }}
              style={styles.headerAction}
              accessibilityRole="button"
              accessibilityLabel="Log out"
            >
              <Text style={styles.headerActionText}>Logout</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => navigation.navigate('Login')}
              style={styles.headerAction}
              accessibilityRole="button"
              accessibilityLabel="Open login"
            >
              <Text style={styles.headerActionText}>Login</Text>
            </TouchableOpacity>
          )}
        </View>
      ),
    });
  }, [
    navigation,
    isLoggedIn,
    handleLogout,
    handleOpenUserSettings,
    handleViewPrices,
  ]);

  useEffect(() => {
    activeStepIndexRef.current = activeStepIndex;
  }, [activeStepIndex]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await locationService.fetchLastLocationAndHydrate(userId);
      if (cancelled) return;
      const stored = await loadNavigationQueries();
      const paramO = route.params?.originQuery?.trim();
      const paramD = route.params?.destQuery?.trim();
      let o = paramO || '';
      if (!o && stored.origin?.trim()) {
        const s = stored.origin.trim();
        const isCoordOnly = /^-?\d+\.?\d*,\s*-?\d+\.?\d*$/.test(s);
        if (!isCoordOnly) {
          o = s;
        }
      }
      const d = paramD || stored.dest;

      let coordForMap: { latitude: number; longitude: number } | null = null;
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        try {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          if (!cancelled) {
            coordForMap = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            };
            await saveLastUserLocation(
              pos.coords.latitude,
              pos.coords.longitude
            );
          }
        } catch (e) {
          logAsyncError(
            'NavigationScreen',
            'getCurrentPositionForBootstrap',
            e
          );
        }
      }
      if (!coordForMap && !cancelled) {
        const lastLoc = await loadLastUserLocation();
        if (lastLoc) {
          coordForMap = {
            latitude: lastLoc.latitude,
            longitude: lastLoc.longitude,
          };
        }
      }

      let originFilledFromPosition = false;
      if (!cancelled && !o.trim() && coordForMap) {
        try {
          const places = await Location.reverseGeocodeAsync({
            latitude: coordForMap.latitude,
            longitude: coordForMap.longitude,
          });
          const first = places[0];
          if (first) {
            const line = formatGeocodedAddress(first).trim();
            if (line) {
              o = line;
              originFilledFromPosition = true;
            }
          }
        } catch (e) {
          logAsyncError('NavigationScreen', 'reverseGeocodeOrigin', e);
        }
        if (!o.trim()) {
          o = `${coordForMap.latitude.toFixed(5)}, ${coordForMap.longitude.toFixed(5)}`;
          originFilledFromPosition = true;
        }
      }

      if (!cancelled) {
        setOriginText(o);
        setDestText(d);
        if (coordForMap) {
          setUserCoordinate(coordForMap);
        }
        if (originFilledFromPosition && o.trim()) {
          await saveNavigationQueries(o, d);
        }
        setBootstrapping(false);
      }
    })().catch(logAsyncRejection('NavigationScreen', 'bootstrapNavigation'));
    return () => {
      cancelled = true;
    };
  }, [route.params?.originQuery, route.params?.destQuery, userId]);

  const title = useMemo(() => {
    const o = originText.trim();
    const d = destText.trim();
    return o && d ? `${o} → ${d}` : 'Navigation';
  }, [originText, destText]);

  useEffect(() => {
    navigation.setOptions({ title });
  }, [navigation, title]);

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    const start = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: isDriving ? 1000 : 6000,
          distanceInterval: isDriving ? 8 : 20,
        },
        (pos) => {
          if (cancelled) return;
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          setUserCoordinate({ latitude: lat, longitude: lon });
          const h = pos.coords.heading;
          if (h != null && !Number.isNaN(h) && h >= 0) {
            setHeading(h);
          }

          const now = Date.now();
          const prev = lastPersistedLocationRef.current;
          let shouldPersist = !prev;
          if (prev) {
            const moved = distanceMeters(lat, lon, prev.lat, prev.lon);
            const elapsed = now - prev.at;
            shouldPersist = elapsed >= 45000 || moved >= 80;
          }
          if (shouldPersist) {
            lastPersistedLocationRef.current = { lat, lon, at: now };
            saveLastUserLocation(lat, lon).catch(
              logAsyncRejection(
                'NavigationScreen',
                'saveLastUserLocationOnWatch'
              )
            );
          }

          if (!isDriving || !data) return;

          const steps = data.steps;
          if (steps.length === 0) return;

          const nextIdx = Math.min(
            activeStepIndexRef.current,
            steps.length - 1
          );
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

    start().catch(logAsyncRejection('NavigationScreen', 'watchPosition'));

    return () => {
      cancelled = true;
      if (subscription) subscription.remove();
    };
  }, [data, isDriving]);

  useEffect(() => {
    if (!data || !isDriving) return;
    const steps = data.steps;
    if (steps.length === 0) return;
    if (lastSpokenStepIndexRef.current === activeStepIndex) return;

    const step = steps[activeStepIndex];
    if (!step?.instruction) return;
    lastSpokenStepIndexRef.current = activeStepIndex;
    let cancelled = false;
    void (async () => {
      try {
        Speech.stop();
        const opts = await getResolvedTtsSpeechOptions();
        if (cancelled) return;
        Speech.speak(step.instruction, buildTtsSpeechOptions(opts));
      } catch (e) {
        logAsyncError('NavigationScreen', 'speakTurnInstruction', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data, isDriving, activeStepIndex]);

  if (bootstrapping) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" color="#666666" />
        <Text style={styles.centerText}>Getting ready…</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <NavigationMap
        route={data}
        activeStepIndex={activeStepIndex}
        userCoordinate={userCoordinate}
        heading={heading}
        isDriving={isDriving}
      />
      <DestinationChangePrompt
        visible={pendingDestQuery != null}
        currentDest={destText}
        proposedDest={pendingDestQuery ?? ''}
        onAccept={handleAcceptProposedDest}
        onReject={handleRejectProposedDest}
      />
      {!isDriving ? (
        <>
          <NavigationFields
            originText={originText}
            destText={destText}
            onChangeOrigin={setOriginText}
            onChangeDest={setDestText}
            onStartDriving={handleStartDriving}
            isApplying={isApplying}
          />
        </>
      ) : (
        <>
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => setIsDriving(false)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Edit route"
          >
            <Text style={styles.editButtonText}>Edit</Text>
          </TouchableOpacity>
          <DriveAssistMicControls
            variant="floating"
            isRecording={isRecording}
            isUploading={isUploading}
            recordingDuration={recordingDuration}
            onPress={handleMicrophonePress}
          />
        </>
      )}
    </View>
  );
}

function normalizeDestCompare(s: string): string {
  return s.trim().toLowerCase();
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#ffffff',
  },
  centerText: {
    marginTop: 8,
    color: '#666666',
    textAlign: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    maxWidth: 280,
  },
  headerAction: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginHorizontal: 2,
    backgroundColor: '#000000',
    borderRadius: 8,
  },
  headerActionText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  editButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    zIndex: 25,
  },
  editButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
});
