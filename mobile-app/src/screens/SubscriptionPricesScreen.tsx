import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';

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
}

const plans: SubscriptionPlan[] = [
  {
    id: 'basic',
    name: 'Basic',
    price: '$9.99',
    period: 'per month',
    features: [
      'Up to 10 hours of recording per month',
      'Basic voice commands',
      'Standard support',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$19.99',
    period: 'per month',
    features: [
      'Unlimited recording',
      'Advanced voice commands',
      'Priority support',
      'Cloud storage (50GB)',
      'Analytics dashboard',
    ],
    popular: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: '$49.99',
    period: 'per month',
    features: [
      'Everything in Pro',
      'Custom integrations',
      'Dedicated support',
      'Unlimited cloud storage',
      'Team management',
      'API access',
    ],
  },
];

export default function SubscriptionPricesScreen({ navigation }: Props) {
  const handleSelectPlan = (planId: string) => {};

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.title}>Subscription Plans</Text>
        <Text style={styles.subtitle}>Choose the plan that works for you</Text>

        {plans.map((plan) => (
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
                <Text style={styles.price}>{plan.price}</Text>
                <Text style={styles.period}>/{plan.period}</Text>
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
              ]}
              onPress={() => handleSelectPlan(plan.id)}
            >
              <Text
                style={[
                  styles.selectButtonText,
                  plan.popular && styles.selectButtonTextPopular,
                ]}
              >
                Select Plan
              </Text>
            </TouchableOpacity>
          </View>
        ))}
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
  selectButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  selectButtonTextPopular: {
    color: '#ffffff',
  },
});
