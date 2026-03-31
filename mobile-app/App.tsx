import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import LoginScreen from './src/screens/LoginScreen';
import DriveScreen from './src/screens/DriveScreen';
import SubscriptionPricesScreen from './src/screens/SubscriptionPricesScreen';
import NavigationScreen from './src/screens/NavigationScreen';
import RouteSetupScreen from './src/screens/RouteSetupScreen';
import { signalRService } from './src/services/SignalRService';
import { loadsService } from './src/services/LoadsService';
import { getApiUrl, getPhpApiUrl } from './src/config/api';
import { logger } from './src/services/LoggerService';

try {
  const WebBrowser = require('expo-web-browser');
  if (WebBrowser?.maybeCompleteAuthSession) {
    WebBrowser.maybeCompleteAuthSession();
  }
} catch (error) {
  logger.warn('App', 'expo-web-browser not available (Expo Go limitation)');
}

export type RootStackParamList = {
  Login: undefined;
  Drive: { userId?: string };
  SubscriptionPrices: undefined;
  RouteSetup: { userId?: string };
  Navigation: { originQuery: string; destQuery: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7716/ingest/ff433432-e388-46b7-ab8e-9455eee41c7e', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': '13d3c9',
      },
      body: JSON.stringify({
        sessionId: '13d3c9',
        runId: 'pre-fix',
        hypothesisId: 'H1-H3',
        location: 'mobile-app/App.tsx:App.useEffect',
        message: 'Expo config icon/adaptiveIcon at runtime',
        data: {
          appOwnership: Constants.appOwnership ?? null,
          executionEnvironment: Constants.executionEnvironment ?? null,
          icon: Constants.expoConfig?.icon ?? null,
          androidAdaptiveIcon:
            (Constants.expoConfig as any)?.android?.adaptiveIcon ?? null,
          iosBundleIdentifier:
            (Constants.expoConfig as any)?.ios?.bundleIdentifier ?? null,
          androidPackage:
            (Constants.expoConfig as any)?.android?.package ?? null,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion agent log

    const apiUrl = getApiUrl();
    signalRService.setBaseUrl(apiUrl);
    loadsService.setBaseUrl(getPhpApiUrl());
    signalRService.onStateChange((state) => {
      logger.debug('App', 'SignalR state changed', { state });
    });
    logger.info('App', 'SignalR service initialized', { url: apiUrl });
  }, []);

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Login"
          screenOptions={{
            headerShown: true,
          }}
        >
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{
              title: 'Login',
            }}
          />
          <Stack.Screen
            name="Drive"
            component={DriveScreen}
            options={{
              title: 'Drive',
            }}
          />
          <Stack.Screen
            name="SubscriptionPrices"
            component={SubscriptionPricesScreen}
            options={{
              title: 'Subscription Plans',
            }}
          />
          <Stack.Screen
            name="RouteSetup"
            component={RouteSetupScreen}
            options={{
              title: 'Route Setup',
            }}
          />
          <Stack.Screen
            name="Navigation"
            component={NavigationScreen}
            options={{
              title: 'Navigation',
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
