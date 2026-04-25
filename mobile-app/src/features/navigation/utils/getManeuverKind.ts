export type ManeuverKind =
  | 'straight'
  | 'turn-left'
  | 'turn-right'
  | 'slight-left'
  | 'slight-right'
  | 'sharp-left'
  | 'sharp-right'
  | 'u-turn'
  | 'roundabout'
  | 'arrive'
  | 'depart';

export function getManeuverKind(instruction: string): ManeuverKind {
  const t = instruction.toLowerCase();
  if (t.includes('arrive') || t.includes('you have arrived')) return 'arrive';
  if (t.includes('u-turn') || t.includes('u turn') || t.includes('make a u'))
    return 'u-turn';
  if (
    t.includes('roundabout') ||
    t.includes('rotary') ||
    t.includes('traffic circle')
  )
    return 'roundabout';
  if (t.startsWith('head ') || t.includes('depart')) return 'depart';
  if (t.includes('sharp left')) return 'sharp-left';
  if (t.includes('sharp right')) return 'sharp-right';
  if (
    t.includes('slight left') ||
    t.includes('bear left') ||
    t.includes('keep left') ||
    t.includes('stay left')
  )
    return 'slight-left';
  if (
    t.includes('slight right') ||
    t.includes('bear right') ||
    t.includes('keep right') ||
    t.includes('stay right')
  )
    return 'slight-right';
  if (t.includes('turn left') || t.includes('make a left')) return 'turn-left';
  if (t.includes('turn right') || t.includes('make a right'))
    return 'turn-right';
  if (/(^| )left( |,|\.|$)/.test(t)) return 'turn-left';
  if (/(^| )right( |,|\.|$)/.test(t)) return 'turn-right';
  return 'straight';
}

export function formatStepDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  if (meters >= 100) {
    return `${Math.round(meters / 10) * 10} m`;
  }
  return `${Math.round(meters)} m`;
}
