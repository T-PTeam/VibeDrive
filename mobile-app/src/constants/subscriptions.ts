export const SUBSCRIPTION_SKUS = {
  plus: 'com.vibedrive.mobile.plus.monthly',
  pro: 'com.vibedrive.mobile.pro.monthly',
} as const;

export type PaidPlanId = keyof typeof SUBSCRIPTION_SKUS;

export const ALL_SUBSCRIPTION_SKUS: string[] = [
  SUBSCRIPTION_SKUS.plus,
  SUBSCRIPTION_SKUS.pro,
];
