import type { ActiveRouteDto } from '../../../types/loads';

export function coerceActiveRoute(raw: unknown): ActiveRouteDto | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.dest_city !== 'string' && typeof o.origin_city !== 'string') {
    return null;
  }
  return {
    driver_id: String(o.driver_id ?? ''),
    origin_city: String(o.origin_city ?? ''),
    dest_city: String(o.dest_city ?? ''),
    weight_kg: Number(o.weight_kg ?? 0),
    volume_m3: Number(o.volume_m3 ?? 0),
    status: String(o.status ?? 'active'),
    created_at: String(o.created_at ?? ''),
    updated_at: String(o.updated_at ?? ''),
  };
}
