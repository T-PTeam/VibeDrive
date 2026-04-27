import type { LocationGeocodedAddress } from 'expo-location';

export function formatGeocodedAddress(a: LocationGeocodedAddress): string {
  const fa = a.formattedAddress?.trim();
  if (fa) {
    return fa;
  }
  const line1 = [a.streetNumber, a.street].filter(Boolean).join(' ').trim();
  const parts = [
    a.name?.trim() || null,
    line1 || null,
    a.city?.trim() || a.district?.trim() || null,
    a.region?.trim() || null,
    a.country?.trim() || null,
  ].filter((x): x is string => !!x && x.length > 0);
  return [...new Set(parts)].join(', ');
}
