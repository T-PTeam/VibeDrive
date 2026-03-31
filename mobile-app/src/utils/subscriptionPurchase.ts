import type {
  MutationRequestPurchaseArgs,
  ProductSubscription,
} from 'expo-iap';
import type { PaidPlanId } from '../constants/subscriptions';
import { SUBSCRIPTION_SKUS } from '../constants/subscriptions';

export function skuForPaidPlan(planId: PaidPlanId): string {
  return SUBSCRIPTION_SKUS[planId];
}

export function isPaidPlanId(planId: string): planId is PaidPlanId {
  return planId === 'plus' || planId === 'pro';
}

export function buildSubscriptionPurchaseParams(
  sku: string,
  subscriptions: ProductSubscription[]
): MutationRequestPurchaseArgs {
  const subscription = subscriptions.find((s) => s.id === sku);
  const subscriptionOffers =
    subscription?.subscriptionOffers
      ?.filter((offer) => offer.offerTokenAndroid)
      .map((offer) => ({
        sku: subscription.id,
        offerToken: offer.offerTokenAndroid!,
      })) ?? [];

  const google =
    subscriptionOffers.length > 0
      ? { skus: [sku], subscriptionOffers }
      : { skus: [sku] };

  return {
    type: 'subs',
    request: {
      apple: { sku },
      google,
    },
  };
}
