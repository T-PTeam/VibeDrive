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
  Switch,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootStackParamList } from '../../App';
import { PHP_API_TOKEN_KEY } from '../constants/auth';
import { navigationService } from '../services/NavigationService';
import { loadsService } from '../services/LoadsService';
import { locationService } from '../services/LocationService';
import { signalRService } from '../services/SignalRService';
import { clearPhpSession } from '../utils/phpSession';
import NavigationMap from '../components/NavigationMap';
import NextTurnBanner from '../features/navigation/components/NextTurnBanner';
import type { RouteResultDto } from '../types/navigation';
import { useDriveAssist } from '../features/drive-assist/useDriveAssist';
import { speakDriverLine } from '../features/drive-assist/speakDriverLine';
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
import { wakeWordService } from '../services/wakeWordService';
import { vadService } from '../services/vadService';
import { audioRecordingService } from '../services/AudioRecordingService';
import { audioDuckingService } from '../services/audioDuckingService';
import {
  configureAudioSessionForHandsFree,
  configureAudioSessionForHandsFreeCapture,
} from '../services/audioSessionConfig';
import {
  STORAGE_HANDS_FREE_ENABLED,
  HANDS_FREE_MAX_UTTERANCE_MS,
  getHandsFreeVadPartial,
} from '../constants/handsFree';
import { logger } from '../services/LoggerService';
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

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    t = setTimeout(() => reject(new Error('timeout')), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (t) clearTimeout(t);
  }
}

export default function NavigationScreen({ navigation, route }: Props) {
  const userId = route.params?.userId ?? 'driver123';
  const navRenderIdRef = useRef(0);
  navRenderIdRef.current += 1;

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
  const [distanceToNextStep, setDistanceToNextStep] = useState<number | null>(
    null
  );
  const [handsFreeEnabled, setHandsFreeEnabled] = useState(false);
  const handsFreeEnabledRef = useRef(false);
  handsFreeEnabledRef.current = handsFreeEnabled;
  const processingWakeRef = useRef(false);
  const handsFreeCaptureRef = useRef(false);
  const handsFreeVadBeforeRef = useRef<ReturnType<
    typeof vadService.getConfig
  > | null>(null);
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

  const activeStep = useMemo(() => {
    if (!data || data.steps.length === 0) return null;
    return data.steps[Math.min(activeStepIndex, data.steps.length - 1)];
  }, [data, activeStepIndex]);

  const applyRoute = useCallback(
    async (
      nextOrigin: string,
      nextDest: string
    ): Promise<RouteResultDto | null> => {
      const o = nextOrigin.trim();
      const d = nextDest.trim();
      if (!o || !d) {
        Alert.alert('Navigation', 'Please enter both From and To.');
        return null;
      }
      setIsApplying(true);
      try {
        const result = await navigationService.getRoute(o, d);
        if (!result) {
          Alert.alert('Navigation', 'Could not fetch route. Please try again.');
          return null;
        }
        setActiveStepIndex(0);
        lastSpokenStepIndexRef.current = null;
        await saveNavigationQueries(o, d);
        return result;
      } catch (e) {
        logAsyncError('NavigationScreen', 'applyRoute', e);
        Alert.alert('Navigation', 'Could not fetch route. Please try again.');
        return null;
      } finally {
        setIsApplying(false);
      }
    },
    []
  );

  const handleStartDriving = useCallback(async () => {
    const result = await applyRoute(originText, destText);
    if (result) {
      setData(result);
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
    applyRoute(originText, proposed)
      .then((result) => {
        if (result) setData(result);
      })
      .catch(logAsyncRejection('NavigationScreen', 'applyProposedDest'));
  }, [applyRoute, originText, pendingDestQuery]);

  const handleRejectProposedDest = useCallback(() => {
    setPendingDestQuery(null);
  }, []);

  const driveAssistOptions = useMemo(
    () => ({
      onProposeNavigationDestination: (proposed: string) => {
        setPendingDestQuery(proposed);
      },
    }),
    []
  );

  const { isRecording, isUploading, recordingDuration, handleMicrophonePress } =
    useDriveAssist(userId, driveAssistOptions);

  const handleMicrophonePressRef = useRef(handleMicrophonePress);
  handleMicrophonePressRef.current = handleMicrophonePress;

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_HANDS_FREE_ENABLED)
      .then((v) => {
        if (v === 'true') setHandsFreeEnabled(true);
      })
      .catch(() => {});
  }, []);

  const handsFreeUnavailable = wakeWordService.getUnavailableReason();

  useEffect(() => {
    logger.info('NavigationScreen', 'Hands-free availability', {
      unavailable: !!handsFreeUnavailable,
      reason: handsFreeUnavailable
        ? String(handsFreeUnavailable).slice(0, 120)
        : null,
    });
  }, [handsFreeUnavailable]);

  const startHandsFreeWake = useCallback(async () => {
    if (!handsFreeEnabledRef.current) return;
    if (handsFreeUnavailable) {
      logger.info('NavigationScreen', 'Hands-free unavailable', {
        reason: handsFreeUnavailable,
      });
      return;
    }
    try {
      await configureAudioSessionForHandsFree();
      await wakeWordService.start(() => {
        if (processingWakeRef.current) return;
        if (!handsFreeEnabledRef.current) return;
        if (audioRecordingService.getIsRecording()) return;
        processingWakeRef.current = true;
        handsFreeCaptureRef.current = true;
        logger.info('NavigationScreen', 'Hands-free wake detected');
        void (async () => {
          const previousVad = vadService.getConfig();
          handsFreeVadBeforeRef.current = previousVad;
          let maxTimer: ReturnType<typeof setTimeout> | null = null;
          let completed = false;
          const clearMaxTimer = () => {
            if (maxTimer) {
              clearTimeout(maxTimer);
              maxTimer = null;
            }
          };
          const restoreVadIfNeeded = () => {
            const snap = handsFreeVadBeforeRef.current;
            if (snap) {
              vadService.updateConfig(snap);
              handsFreeVadBeforeRef.current = null;
            }
          };
          const completeHandsFreeSegment = async () => {
            if (completed) return;
            completed = true;
            clearMaxTimer();
            vadService.stop();
            try {
              await handleMicrophonePressRef.current();
            } finally {
              restoreVadIfNeeded();
              await audioDuckingService.restore();
              processingWakeRef.current = false;
              handsFreeCaptureRef.current = false;
              await startHandsFreeWake();
            }
          };
          try {
            await wakeWordService.stop();
            vadService.updateConfig(getHandsFreeVadPartial());
            await audioDuckingService.duck();
            await handleMicrophonePressRef.current();
            await configureAudioSessionForHandsFreeCapture();
            const rec = audioRecordingService.getRecording();
            if (!rec) {
              clearMaxTimer();
              completed = true;
              restoreVadIfNeeded();
              await audioDuckingService.restore();
              processingWakeRef.current = false;
              handsFreeCaptureRef.current = false;
              await startHandsFreeWake();
              return;
            }
            maxTimer = setTimeout(() => {
              void completeHandsFreeSegment();
            }, HANDS_FREE_MAX_UTTERANCE_MS);
            vadService.start(() => {
              void completeHandsFreeSegment();
            }, rec);
          } catch (e) {
            logger.error('NavigationScreen', 'Hands-free pipeline failed', e);
            clearMaxTimer();
            if (!completed) {
              completed = true;
              vadService.stop();
              restoreVadIfNeeded();
              await audioDuckingService.restore();
              processingWakeRef.current = false;
              handsFreeCaptureRef.current = false;
              await startHandsFreeWake();
            }
          }
        })();
      });
      logger.info('NavigationScreen', 'Hands-free listening started');
    } catch (e) {
      logger.error('NavigationScreen', 'Hands-free start failed', e);
    }
  }, [handsFreeUnavailable]);

  const stopHandsFree = useCallback(async () => {
    processingWakeRef.current = false;
    vadService.stop();
    const vadSnap = handsFreeVadBeforeRef.current;
    if (vadSnap) {
      vadService.updateConfig(vadSnap);
      handsFreeVadBeforeRef.current = null;
    }
    await wakeWordService.stop();
    const isServiceRecording = audioRecordingService.getIsRecording();
    logger.info('NavigationScreen', 'Hands-free stop requested', {
      handsFreeEnabled: handsFreeEnabledRef.current,
      handsFreeCapture: handsFreeCaptureRef.current,
      isServiceRecording,
    });
    if (handsFreeCaptureRef.current && isServiceRecording) {
      await audioRecordingService.cancelRecording();
    }
    await audioDuckingService.restore();
    handsFreeCaptureRef.current = false;
    logger.info('NavigationScreen', 'Hands-free stopped');
  }, []);

  const onToggleHandsFree = useCallback(
    async (value: boolean) => {
      if (value && handsFreeUnavailable) {
        logger.info('NavigationScreen', 'Hands-free toggle blocked', {
          reason: handsFreeUnavailable,
        });
        Alert.alert('Hands-free', handsFreeUnavailable);
        return;
      }
      setHandsFreeEnabled(value);
      try {
        await AsyncStorage.setItem(
          STORAGE_HANDS_FREE_ENABLED,
          value ? 'true' : 'false'
        );
      } catch {}
      if (value) {
        await startHandsFreeWake();
      } else {
        await stopHandsFree();
      }
    },
    [handsFreeUnavailable, startHandsFreeWake, stopHandsFree]
  );

  useEffect(() => {
    if (!isDriving) return;
    if (!handsFreeEnabled) return;
    if (handsFreeUnavailable) return;
    startHandsFreeWake().catch(() => {});
  }, [isDriving, handsFreeEnabled, handsFreeUnavailable, startHandsFreeWake]);

  const handleExitDrivingUi = useCallback(() => {
    setIsDriving(false);
    void stopHandsFree();
  }, [stopHandsFree]);

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
      return () => {
        if (handsFreeEnabledRef.current || handsFreeCaptureRef.current) {
          stopHandsFree().catch(() => {});
        }
      };
    }, [refreshAuthInHeader, stopHandsFree])
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
                  applyRoute(o, loadDest)
                    .then((result) => {
                      if (result) setData(result);
                    })
                    .catch(
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
      try {
        await withTimeout(
          locationService.fetchLastLocationAndHydrate(userId),
          2500
        ).catch(() => false);
        if (cancelled) return;
        const stored = await withTimeout(loadNavigationQueries(), 1000).catch(
          () => ({ origin: '', dest: '' })
        );
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
        const { status } = await withTimeout(
          Location.requestForegroundPermissionsAsync(),
          2500
        ).catch(() => ({ status: 'undetermined' as const }));

        if (status === 'granted') {
          try {
            const pos = await withTimeout(
              Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
              }),
              6000
            );
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
          const lastLoc = await withTimeout(loadLastUserLocation(), 600).catch(
            () => null
          );
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
            const places = await withTimeout(
              Location.reverseGeocodeAsync({
                latitude: coordForMap.latitude,
                longitude: coordForMap.longitude,
              }),
              4500
            );
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
        }
      } finally {
        if (!cancelled) setBootstrapping(false);
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

          setDistanceToNextStep(metersToEnd);

          if (metersToEnd < 35 && nextIdx < steps.length - 1) {
            setActiveStepIndex(nextIdx + 1);
            setDistanceToNextStep(null);
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
        if (cancelled) return;
        await speakDriverLine(step.instruction);
      } catch (e) {
        if (!cancelled) {
          logAsyncError('NavigationScreen', 'speakTurnInstruction', e);
        }
      }
    })();
    return () => {
      cancelled = true;
      try {
        Speech.stop();
      } catch {}
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
          <NextTurnBanner
            step={activeStep}
            distanceMeters={distanceToNextStep}
            visible={!!data?.steps.length}
          />
          <View style={styles.bottomControlsRow}>
            <View style={styles.handsFreePill}>
              <Text style={styles.handsFreePillLabel}>Hands-free</Text>
              <Switch
                value={handsFreeEnabled}
                onValueChange={(v) => void onToggleHandsFree(v)}
                disabled={!!handsFreeUnavailable}
                trackColor={{ false: '#333333', true: '#3355aa' }}
                thumbColor={handsFreeEnabled ? '#ffffff' : '#888888'}
              />
            </View>
            <DriveAssistMicControls
              variant="inline"
              isRecording={isRecording}
              isUploading={isUploading}
              recordingDuration={recordingDuration}
              onPress={handleMicrophonePress}
              style={styles.micInline}
            />
            <TouchableOpacity
              style={styles.editPill}
              onPress={handleExitDrivingUi}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Edit route"
            >
              <Text style={styles.editPillText}>Edit</Text>
            </TouchableOpacity>
          </View>
          {handsFreeUnavailable ? (
            <View style={styles.handsFreeBanner}>
              <Text style={styles.handsFreeBannerText}>
                {handsFreeUnavailable}
              </Text>
            </View>
          ) : null}
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
  bottomControlsRow: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 172,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 35,
  },
  handsFreePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(10,10,20,0.92)',
    maxWidth: 160,
  },
  handsFreePillLabel: {
    color: '#f0f0f5',
    fontSize: 14,
    fontWeight: '700',
    marginRight: 10,
  },
  micInline: {
    flex: 1,
    alignItems: 'center',
  },
  editPill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(10,10,20,0.92)',
  },
  editPillText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  handsFreeBanner: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 120,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(10,10,20,0.92)',
    zIndex: 35,
  },
  handsFreeBannerText: {
    color: '#f0f0f5',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    textAlign: 'center',
  },
});
