export type Suggestion = { placeId: string; main: string; secondary: string };

export type Place = { placeId: string; address: string; lat: number; lng: number };

export type RoofSegment = { areaSqft: number; pitchDegrees: number; azimuthDegrees: number };

export type BBox = { sw: { lat: number; lng: number }; ne: { lat: number; lng: number } };

export type RoofMeasurement = {
  source: "solar" | "fallback" | "demo";
  areaSqft: number; // sloped roof surface area
  footprintSqft: number; // ground area under the roof
  avgPitchDegrees: number; // area-weighted
  segments: RoofSegment[];
  imageryDate?: string;
  imageryQuality?: string;
  distanceMeters?: number; // how far the matched building is from the address pin
  bbox?: BBox;
  note?: string;
};
