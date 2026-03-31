import type { RouteSetupParseResult } from '../../../services/RouteSetupParseService';

type ApplyRouteSetupParseResultParams = {
  parsed: RouteSetupParseResult;
  setCity: (value: string) => void;
  setWeight: (value: string) => void;
  setVolume: (value: string) => void;
  setAiHint: (value: string) => void;
};

export function applyRouteSetupParseResult({
  parsed,
  setCity,
  setWeight,
  setVolume,
  setAiHint,
}: ApplyRouteSetupParseResultParams) {
  if (
    parsed.dest_city != null &&
    typeof parsed.dest_city === 'string' &&
    parsed.dest_city.trim()
  ) {
    setCity(parsed.dest_city.trim());
  }

  if (
    typeof parsed.weight_kg === 'number' &&
    Number.isFinite(parsed.weight_kg)
  ) {
    setWeight(String(parsed.weight_kg));
  }

  if (
    typeof parsed.volume_m3 === 'number' &&
    Number.isFinite(parsed.volume_m3)
  ) {
    setVolume(String(parsed.volume_m3));
  }

  if (
    parsed.ai_message != null &&
    typeof parsed.ai_message === 'string' &&
    parsed.ai_message.trim()
  ) {
    setAiHint(parsed.ai_message.trim());
  }
}
