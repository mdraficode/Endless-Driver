export const TRAFFIC_VEHICLE_CLASSES = [
  'passenger-car',
  'city-bus',
  'rigid-truck',
  'semi-trailer-rig',
  'farm-tractor',
] as const;

export type TrafficVehicleClass = (typeof TRAFFIC_VEHICLE_CLASSES)[number];

export interface TrafficVehicleSpec {
  readonly lengthMeters: number;
  readonly widthMeters: number;
  readonly heightMeters: number;
  readonly massKg: number;
  readonly minimumSpeedMetersPerSecond: number;
  readonly maximumSpeedMetersPerSecond: number;
  readonly bodyColor: number;
}

/** Bounded, dimensioned city-traffic archetypes; totals remain controlled by the tier budget. */
export const TRAFFIC_VEHICLE_SPECS: Readonly<Record<TrafficVehicleClass, TrafficVehicleSpec>> = {
  'passenger-car': {
    lengthMeters: 4.5,
    widthMeters: 2.05,
    heightMeters: 1.65,
    massKg: 1_350,
    minimumSpeedMetersPerSecond: 7.4,
    maximumSpeedMetersPerSecond: 10.2,
    bodyColor: 0x9daab7,
  },
  'city-bus': {
    lengthMeters: 12,
    widthMeters: 2.6,
    heightMeters: 3.6,
    massKg: 7_200,
    minimumSpeedMetersPerSecond: 5.4,
    maximumSpeedMetersPerSecond: 7.8,
    bodyColor: 0x347a90,
  },
  'rigid-truck': {
    lengthMeters: 8,
    widthMeters: 2.6,
    heightMeters: 3.05,
    massKg: 10_500,
    minimumSpeedMetersPerSecond: 5.8,
    maximumSpeedMetersPerSecond: 8.2,
    bodyColor: 0xd6d2c5,
  },
  'semi-trailer-rig': {
    lengthMeters: 15,
    widthMeters: 2.65,
    heightMeters: 4.25,
    massKg: 14_000,
    minimumSpeedMetersPerSecond: 5.2,
    maximumSpeedMetersPerSecond: 7.3,
    bodyColor: 0x87918b,
  },
  'farm-tractor': {
    lengthMeters: 3.8,
    widthMeters: 2.4,
    heightMeters: 2.45,
    massKg: 3_600,
    minimumSpeedMetersPerSecond: 2.8,
    maximumSpeedMetersPerSecond: 4.8,
    bodyColor: 0x597e3b,
  },
};
