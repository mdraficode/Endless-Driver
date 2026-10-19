/**
 * Phase 2 vehicle tuning.
 *
 * All handling numbers live here, never inline in the controller, so handling can be tuned
 * (and regression-tested) without touching simulation code. The selected target is forgiving arcade:
 * a 1200 kg rear-drive car that accelerates, brakes and corners plausibly while remaining predictable
 * under ordinary steering and easy to recover when the rear steps out.
 *
 * Loads and forces are in SI units. Forward is -Z, up is +Y, right is +X (see docs/ARCHITECTURE.md).
 */
export interface ChassisConfig {
  /** Collision box half extents (x, y, z) in meters; the body origin is the box center. */
  readonly halfExtents: readonly [number, number, number];
  readonly mass: number;
  /** Center of mass offset from the body origin, in body space. Lower = more stable. */
  readonly centerOfMass: readonly [number, number, number];
  /** Multipliers on the box-derived principal inertia (pitch, yaw, roll). */
  readonly inertiaScale: readonly [number, number, number];
  readonly linearDamping: number;
  readonly angularDamping: number;
  /** Continuous collision detection; prevents tunneling at high speed. */
  readonly ccd: boolean;
  /** Automatic reset if the car falls out of the arena. */
  readonly outOfBoundsY: number;
}

export interface WheelConfig {
  readonly radius: number;
  readonly width: number;
  readonly halfTrack: number;
  /** Front axle z in body space (negative is forward). */
  readonly frontZ: number;
  /** Rear axle z in body space. */
  readonly rearZ: number;
  /** Suspension anchor height in body space. */
  readonly anchorY: number;
  /** Uncompressed suspension length from anchor to wheel center. */
  readonly restLength: number;
  /** Hard travel limits; the wheel is clamped into this range. */
  readonly minLength: number;
  readonly maxLength: number;
  readonly stiffness: number;
  readonly compressionDamping: number;
  readonly reboundDamping: number;
  /** Per-wheel suspension force ceiling. */
  readonly maxForce: number;
  /** Anti-roll bar stiffness per axle in N/m of compression difference. */
  readonly antiRollStiffness: number;
  /**
   * Damper blow-off speed (m/s of compression velocity): damping force saturates
   * beyond it instead of growing linearly, so landing from a crest cannot produce a
   * 20 kN one-step spike. Real dampers blow off for the same reason.
   */
  readonly dampingBlowoffSpeed: number;
  /**
   * Time constant (s) for smoothing the measured compression before the spring sees
   * it: triangulated ground makes the raw measurement step at facet edges, and a
   * 30 ms lag removes the steps without making real bumps feel soft.
   */
  readonly compressionSmoothingSeconds: number;
  /**
   * Maximum rate of change of suspension force (N/s). A force that cannot change
   * faster than this cannot kick the chassis in a single step, however hard the
   * landing; real damper/spring stacks have the same effective limit.
   */
  readonly maxForceRatePerSecond: number;
}

export interface TireConfig {
  /** Peak friction coefficient on dry asphalt. */
  readonly frictionCoefficient: number;
  /** Load sensitivity: fraction of grip lost when load doubles (0.12 = -12%). */
  readonly loadSensitivity: number;
  /**
   * Pacejka-style magic formula coefficients for lateral force.
   *
   * `lateralCurvature` (E) must stay well below 1: as E approaches 1 the formula degenerates into
   * a curve with no peak at all, so the tire would keep gaining grip with slip angle and could
   * never break away — the opposite of the drift behaviour this game is built around. At E = 0.15
   * the lateral force peaks near 10 degrees of slip and retains roughly 80% of peak at 45 degrees,
   * which is the "bite, slide, and recover" shape a sim-cade car needs.
   */
  readonly lateralStiffness: number;
  readonly lateralShape: number;
  readonly lateralCurvature: number;
  /** Speed used as the slip-angle denominator floor, preventing noise at low speed. */
  readonly slipAngleReferenceSpeed: number;
  /**
   * Tire relaxation length in metres: lateral force builds over this much rolling
   * distance instead of appearing instantly. Real tires do this; in the model it is
   * also the filter that stops per-step load spikes on faceted ground from kicking
   * the chassis sideways dozens of times a second.
   */
  readonly relaxationLengthMeters: number;
  /** Rear grip multiplier while the handbrake is held. */
  readonly handbrakeGripScale: number;
  /** Rolling resistance as a fraction of wheel load. */
  readonly rollingResistance: number;
  /** Fraction of the friction circle reserved before longitudinal force saturates. */
  readonly longitudinalSaturation: number;
  /** Below this speed with no throttle, velocity is actively damped to stop creep. */
  readonly holdSpeed: number;
  readonly holdDamping: number;
}

export interface DrivetrainConfig {
  readonly idleRpm: number;
  readonly maxRpm: number;
  readonly shiftUpRpm: number;
  readonly shiftDownRpm: number;
  readonly gearRatios: readonly number[];
  readonly reverseRatio: number;
  readonly finalDrive: number;
  readonly efficiency: number;
  /** Engine torque curve as (rpm, Nm) points; interpolated linearly. */
  readonly torqueCurve: readonly (readonly [number, number])[];
  /** Seconds for delivered drive force to reach the requested force. */
  readonly responseSeconds: number;
  readonly shiftDurationSeconds: number;
  /** Drive force multiplier while shifting. */
  readonly shiftTorqueFactor: number;
  /** Car speed below which holding brake engages reverse. */
  readonly reverseEngageSpeed: number;
  /** Time the brake must be held before reverse engages. */
  readonly reverseEngageSeconds: number;
  /** Drivetrain layout; rear-drive keeps the car loose and drift-friendly. */
  readonly drivenWheels: 'rear' | 'all';
}

/**
 * Electronic stability assist (sim-cade, always on except during handbrake drifts).
 *
 * The assist damps the car's yaw rate toward the rate the steering is actually asking
 * for (bicycle model, capped by the tires' cornering budget). It does not steer the
 * car and it cannot create grip; it removes the excess rotation that turns a slide
 * into a spin, which is exactly the assistance every accessible arcade-sim ships.
 */
export interface StabilityConfig {
  /** How aggressively yaw error is corrected, per second (error fraction removed). */
  readonly yawResponsePerSecond: number;
  /** Below this forward speed (m/s) the assist stays out of parking-speed manoeuvres. */
  readonly minSpeedMps: number;
  /**
   * Extra gravity (as a fraction of g) applied while fully airborne at speed. Crests
   * at 140 km/h launch any honest suspension; extra fall gravity shortens the flight
   * and lands the car sooner and flatter instead of floating into a spin.
   */
  readonly airborneGravityScale: number;
}

export interface BrakeConfig {
  readonly frontForce: number;
  readonly rearForce: number;
  readonly handbrakeForce: number;
}

/**
 * Steering geometry and authority. Rate limiting and input smoothing are NOT here: they are
 * digital-input concerns and live in `config/input.ts`.
 */
export interface SteeringConfig {
  /** Absolute steering-angle ceiling at the road wheels, in radians. */
  readonly maxAngle: number;
  /** Floor for the speed-scaled limit, so the car can always make small corrections. */
  readonly minAngle: number;
  /**
   * Cornering budget used to derive the speed-scaled steering limit, as a multiple of the tire's
   * friction limit (1.2 = ask for 20% more lateral acceleration than the tires can deliver).
   *
   * Steady-state cornering needs a wheel angle of `atan(wheelbase * a / v^2)`, which falls off with
   * the square of speed. Deriving the limit from that budget — instead of a hand-tuned linear
   * falloff — keeps full steering lock at the tire's limit at every speed, so a keyboard player
   * holding full lock corners on the edge rather than plowing straight on with saturated tires.
   */
  readonly gripBudgetFactor: number;
  /**
   * Extra steering authority per radian of chassis slip angle, on top of the cornering budget.
   *
   * Without it, a slide could not be caught: the wheel angle needed to point the front tires along
   * the direction of travel grows with the slip angle, so a fixed speed-based limit would make
   * counter-steering impossible and every drift a spin.
   */
  readonly slipReliefFactor: number;
  /** Ackermann-style inner-wheel bias; 0 disables. */
  readonly ackermann: number;
}

export interface AeroConfig {
  /** Downforce in newtons per (m/s)^2 of speed, split evenly across the wheels. */
  readonly downforceCoefficient: number;
  /** Aerodynamic drag in newtons per (m/s)^2. */
  readonly dragCoefficient: number;
}

export interface SpawnConfig {
  readonly position: readonly [number, number, number];
  /** Yaw in radians. */
  readonly yaw: number;
}

export interface VehicleConfig {
  readonly chassis: ChassisConfig;
  readonly wheels: WheelConfig;
  readonly tires: TireConfig;
  readonly drivetrain: DrivetrainConfig;
  readonly brakes: BrakeConfig;
  readonly steering: SteeringConfig;
  readonly stability: StabilityConfig;
  readonly aero: AeroConfig;
  readonly spawn: SpawnConfig;
}

export const VEHICLE_CONFIG: VehicleConfig = {
  chassis: {
    halfExtents: [0.9, 0.35, 2.05],
    mass: 1200,
    centerOfMass: [0, -0.05, 0],
    inertiaScale: [1, 1, 1],
    linearDamping: 0,
    angularDamping: 0.35,
    ccd: true,
    outOfBoundsY: -20,
  },
  wheels: {
    radius: 0.34,
    width: 0.24,
    halfTrack: 0.78,
    frontZ: -1.35,
    rearZ: 1.35,
    anchorY: 0,
    restLength: 0.37,
    minLength: 0.12,
    maxLength: 0.5,
    stiffness: 33000,
    compressionDamping: 3000,
    reboundDamping: 3600,
    maxForce: 22000,
    antiRollStiffness: 14000,
    dampingBlowoffSpeed: 2.2,
    compressionSmoothingSeconds: 0.03,
    maxForceRatePerSecond: 420_000,
  },
  tires: {
    frictionCoefficient: 1.25,
    loadSensitivity: 0.12,
    lateralStiffness: 9.5,
    lateralShape: 1.55,
    lateralCurvature: 0.15,
    slipAngleReferenceSpeed: 1.5,
    relaxationLengthMeters: 0.45,
    handbrakeGripScale: 0.58,
    rollingResistance: 0.015,
    longitudinalSaturation: 0.98,
    holdSpeed: 0.6,
    holdDamping: 4200,
  },
  drivetrain: {
    idleRpm: 900,
    maxRpm: 7200,
    shiftUpRpm: 6300,
    shiftDownRpm: 2800,
    gearRatios: [3.15, 2.05, 1.5, 1.15, 0.94, 0.78],
    reverseRatio: 3.4,
    finalDrive: 3.7,
    efficiency: 0.9,
    torqueCurve: [
      [1000, 230],
      [2000, 340],
      [3000, 405],
      [4200, 420],
      [5000, 395],
      [6000, 330],
      [6800, 250],
      [7200, 120],
    ],
    responseSeconds: 0.12,
    shiftDurationSeconds: 0.22,
    shiftTorqueFactor: 0.15,
    reverseEngageSpeed: 0.8,
    reverseEngageSeconds: 0.25,
    drivenWheels: 'rear',
  },
  brakes: {
    frontForce: 3400,
    rearForce: 2200,
    handbrakeForce: 2600,
  },
  stability: {
    yawResponsePerSecond: 5.6,
    minSpeedMps: 4,
    airborneGravityScale: 0.6,
  },
  steering: {
    maxAngle: 0.55,
    minAngle: 0.015,
    gripBudgetFactor: 1.25,
    slipReliefFactor: 0.7,
    ackermann: 0.25,
  },
  aero: {
    downforceCoefficient: 2.4,
    dragCoefficient: 1,
  },
  spawn: {
    position: [0, 0.7, 0],
    yaw: 0,
  },
};
