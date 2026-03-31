export interface GeocodeResultDto {
  query: string;
  formatted: string;
  latitude: number;
  longitude: number;
}

export interface RoutePointDto {
  latitude: number;
  longitude: number;
}

export interface RouteStepDto {
  instruction: string;
  distance_meters: number;
  duration_seconds: number;
  start: RoutePointDto;
  end: RoutePointDto;
}

export interface RouteResultDto {
  origin: GeocodeResultDto;
  destination: GeocodeResultDto;
  distance_meters: number;
  duration_seconds: number;
  polyline: RoutePointDto[];
  steps: RouteStepDto[];
}
