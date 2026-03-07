export interface ActiveRouteDto {
  driver_id: string;
  origin_city: string;
  dest_city: string;
  weight_kg: number;
  volume_m3: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface FreightLoadDto {
  id: string;
  origin_city: string;
  dest_city: string;
  weight_kg?: number;
  volume_m3?: number;
  rate_amount: number;
  currency: string;
  distance_km?: number;
  source?: string;
}

export interface ApiLoadsResponse {
  loads: FreightLoadDto[];
}

export interface ApiRouteResponse {
  data: ActiveRouteDto;
}

export interface ApiSuccessResponse<T> {
  status: string;
  data: T;
  message?: string;
}
