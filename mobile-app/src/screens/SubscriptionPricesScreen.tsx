import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useIAP, finishTransaction, ErrorCode, type Purchase } from 'expo-iap';
import { RootStackParamList } from '../../App';
import LegalAgreement from '../components/LegalAgreement';
import { saveLegalAccepted, getLegalAccepted } from '../utils/legal';
import { ALL_SUBSCRIPTION_SKUS } from '../constants/subscriptions';
import {
  buildSubscriptionPurchaseParams,
  isPaidPlanId,
  skuForPaidPlan,
} from '../utils/subscriptionPurchase';
import { logAsyncError, logAsyncRejection } from '../utils/asyncErrors';

type SubscriptionPricesScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'SubscriptionPrices'
>;

interface Props {
  navigation: SubscriptionPricesScreenNavigationProp;
}

interface SubscriptionPlan {
  id: string;
  name: string;
  price: string;
  period: string;
  features: string[];
  popular?: boolean;
  ctaLabel: string;
}

const plans: SubscriptionPlan[] = [
  {
    id: 'free',
    name: 'Free',
    price: 'Free',
    period: '',
    features: [
      'AI alerts for drowsiness and falling asleep (limited)',
      'Limited voice sessions per month',
      'Basic music voice commands',
    ],
    ctaLabel: 'Continue with Free',
  },
  {
    id: 'plus',
    name: 'Plus',
    price: '$3',
    period: 'month',
    features: [
      'AI alerts for drowsiness and falling asleep',
      'More voice sessions each month',
      'Music and assistant voice commands',
    ],
    ctaLabel: 'Choose Plus',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$5',
    period: 'month',
    features: [
      'Everything in Plus',
      'Cargo tracking',
      'Directions and routing to your destination',
      'Highest voice session allowance',
    ],
    popular: true,
    ctaLabel: 'Choose Pro',
  },
];

export default function SubscriptionPricesScreen({ navigation }: Props) {
  const [legalChecked, setLegalChecked] = useState(false);
  const [legalError, setLegalError] = useState(false);
  const [iapBusy, setIapBusy] = useState(false);

  const handlePurchaseSuccess = useCallback(
    async (purchase: Purchase) => {
      try {
        await finishTransaction({ purchase, isConsumable: false });
        navigation.goBack();
      } catch (e) {
        logAsyncError('SubscriptionPricesScreen', 'handlePurchaseSuccess', e);
        Alert.alert(
          'Purchase',
          'Could not complete the purchase. Please try again.'
        );
      } finally {
        setIapBusy(false);
      }
    },
    [navigation]
  );

  const { connected, subscriptions, fetchProducts, requestPurchase } = useIAP({
    onPurchaseSuccess: handlePurchaseSuccess,
    onPurchaseError: (error) => {
      setIapBusy(false);
      if (error.code === ErrorCode.UserCancelled) {
        return;
      }
      Alert.alert('Purchase failed', error.message || 'Please try again.');
    },
  });

  useEffect(() => {
    getLegalAccepted()
      .then((accepted) => {
        if (accepted) setLegalChecked(true);
      })
      .catch(logAsyncRejection('SubscriptionPricesScreen', 'getLegalAccepted'));
  }, []);

  useEffect(() => {
    if (!connected) return;
    fetchProducts({ skus: ALL_SUBSCRIPTION_SKUS, type: 'subs' }).catch(
      logAsyncRejection('SubscriptionPricesScreen', 'fetchProducts')
    );
  }, [connected, fetchProducts]);

  const handleToggleLegal = () => {
    setLegalChecked((prev) => !prev);
    setLegalError(false);
  };

  const planPriceLabel = (plan: SubscriptionPlan) => {
    if (plan.id === 'free') {
      return { main: plan.price, suffix: plan.period };
    }
    if (!isPaidPlanId(plan.id)) {
      return { main: plan.price, suffix: plan.period };
    }
    const sku = skuForPaidPlan(plan.id);
    const sub = subscriptions.find((s) => s.id === sku);
    return {
      main: sub?.displayPrice ?? plan.price,
      suffix: plan.period,
    };
  };

  const handleSelectPlan = async (planId: string) => {
    if (!legalChecked) {
      setLegalError(true);
      return;
    }
    await saveLegalAccepted();
    if (planId === 'free') {
      navigation.goBack();
      return;
    }
    if (!isPaidPlanId(planId)) {
      return;
    }
    if (Platform.OS === 'web') {
      Alert.alert(
        'Not available',
        'Subscriptions can only be purchased in the iOS or Android app.'
      );
      return;
    }
    if (!connected) {
      Alert.alert('Store unavailable', 'Check your connection and try again.');
      return;
    }
    const sku = skuForPaidPlan(planId);
    setIapBusy(true);
    try {
      await requestPurchase(
        buildSubscriptionPurchaseParams(sku, subscriptions)
      );
    } catch (e) {
      logAsyncError('SubscriptionPricesScreen', 'requestPurchase', e);
      setIapBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.title}>Subscription Plans</Text>
        <Text style={styles.subtitle}>Choose the plan that works for you</Text>

        <LegalAgreement
          checked={legalChecked}
          onToggle={handleToggleLegal}
          showError={legalError}
        />

        {plans.map((plan) => {
          const priceLabel = planPriceLabel(plan);
          return (
            <View
              key={plan.id}
              style={[styles.planCard, plan.popular && styles.planCardPopular]}
            >
              {plan.popular && (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularBadgeText}>POPULAR</Text>
                </View>
              )}
              <View style={styles.planHeader}>
                <Text style={styles.planName}>{plan.name}</Text>
                <View style={styles.priceContainer}>
                  <Text style={styles.price}>{priceLabel.main}</Text>
                  {priceLabel.suffix ? (
                    <Text style={styles.period}>/{priceLabel.suffix}</Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.featuresContainer}>
                {plan.features.map((feature, index) => (
                  <View key={index} style={styles.featureRow}>
                    <Text style={styles.featureIcon}>✓</Text>
                    <Text style={styles.featureText}>{feature}</Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity
                style={[
                  styles.selectButton,
                  plan.popular && styles.selectButtonPopular,
                  iapBusy && styles.selectButtonDisabled,
                ]}
                onPress={() => handleSelectPlan(plan.id)}
                disabled={iapBusy}
              >
                <Text
                  style={[
                    styles.selectButtonText,
                    plan.popular && styles.selectButtonTextPopular,
                  ]}
                >
                  {plan.ctaLabel}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666666',
    marginBottom: 32,
    textAlign: 'center',
  },
  planCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    padding: 24,
    marginBottom: 20,
    position: 'relative',
  },
  planCardPopular: {
    borderColor: '#000000',
    borderWidth: 3,
  },
  popularBadge: {
    position: 'absolute',
    top: -12,
    right: 24,
    backgroundColor: '#000000',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  popularBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  planHeader: {
    marginBottom: 20,
  },
  planName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 8,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  price: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#000000',
  },
  period: {
    fontSize: 16,
    color: '#666666',
    marginLeft: 4,
  },
  featuresContainer: {
    marginBottom: 24,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  featureIcon: {
    fontSize: 16,
    color: '#000000',
    marginRight: 12,
    fontWeight: 'bold',
  },
  featureText: {
    fontSize: 14,
    color: '#333333',
    flex: 1,
  },
  selectButton: {
    height: 50,
    backgroundColor: '#000000',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectButtonPopular: {
    backgroundColor: '#000000',
  },
  selectButtonDisabled: {
    opacity: 0.5,
  },
  selectButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  selectButtonTextPopular: {
    color: '#ffffff',
  },
});
