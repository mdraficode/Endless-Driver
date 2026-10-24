import { Group, SpotLight } from 'three';

/**
 * A fixed pair of broad player-car flood/low beams. The spots are intentionally unshadowed and are
 * not multiplied across traffic vehicles; they are two vehicle-attached lights, enabled only at
 * night. Aohara's tier-capped city point-light budgets remain unchanged.
 */
export const PLAYER_HEADLIGHT_CONFIG = {
  colorHex: 0xffefd2,
  intensityCandela: 11_500,
  rangeMeters: 86,
  /** Wide flood cone; together with the outboard splay this approaches the chase-camera FOV. */
  beamHalfAngleRadians: 0.89,
  beamSplayRadians: 0.19,
  penumbra: 0.82,
  decay: 2,
  mountY: 0.27,
  mountZ: -2.06,
  halfSpacing: 0.55,
  aimDistanceMeters: 52,
  downwardAimMeters: 0.93,
  steeringRatio: 0.55,
  maxSteeringAngleRadians: 0.2,
} as const;

export interface PlayerHeadlightRig {
  /** Reparented from the authored fallback to the hero root when the loaded car becomes active. */
  readonly root: Group;
  /** Small adaptive-front-lighting pivot; its parent follows the car's physics pose. */
  readonly aim: Group;
  readonly lights: readonly [SpotLight, SpotLight];
}

/** Creates two powerful, broad, soft-edged, non-shadowing spotlights mounted at the player car's nose. */
export function createPlayerHeadlightRig(): PlayerHeadlightRig {
  const root = new Group();
  root.name = 'player-headlights';

  const aim = new Group();
  aim.name = 'player-headlight-aim';
  aim.position.y = PLAYER_HEADLIGHT_CONFIG.mountY;
  root.add(aim);

  const left = createHeadlight(-1, 'player-headlight-left');
  const right = createHeadlight(1, 'player-headlight-right');
  aim.add(left, left.target, right, right.target);

  return { root, aim, lights: [left, right] };
}

/** Night mood and natural night-time clocks share this gate. */
export function setPlayerHeadlightsEnabled(rig: PlayerHeadlightRig, enabled: boolean): void {
  for (const light of rig.lights) {
    light.visible = enabled;
  }
}

/**
 * Adds a restrained steering-following angle, like adaptive front lighting. Chassis yaw, pitch,
 * roll, and suspension movement already come from the rig's parent pose; this only aims into turns.
 */
export function setAdaptiveHeadlightSteering(rig: PlayerHeadlightRig, steeringAngle: number): void {
  const finiteAngle = Number.isFinite(steeringAngle) ? steeringAngle : 0;
  const yaw = finiteAngle * PLAYER_HEADLIGHT_CONFIG.steeringRatio;
  rig.aim.rotation.y = Math.max(
    -PLAYER_HEADLIGHT_CONFIG.maxSteeringAngleRadians,
    Math.min(PLAYER_HEADLIGHT_CONFIG.maxSteeringAngleRadians, yaw),
  );
}

function createHeadlight(side: -1 | 1, name: string): SpotLight {
  const light = new SpotLight(
    PLAYER_HEADLIGHT_CONFIG.colorHex,
    PLAYER_HEADLIGHT_CONFIG.intensityCandela,
    PLAYER_HEADLIGHT_CONFIG.rangeMeters,
    PLAYER_HEADLIGHT_CONFIG.beamHalfAngleRadians,
    PLAYER_HEADLIGHT_CONFIG.penumbra,
    PLAYER_HEADLIGHT_CONFIG.decay,
  );
  light.name = name;
  light.position.set(side * PLAYER_HEADLIGHT_CONFIG.halfSpacing, 0, PLAYER_HEADLIGHT_CONFIG.mountZ);
  light.castShadow = false;
  light.visible = false;
  light.target.name = `${name}-target`;
  const beamSplayMeters =
    Math.tan(PLAYER_HEADLIGHT_CONFIG.beamSplayRadians) * PLAYER_HEADLIGHT_CONFIG.aimDistanceMeters;
  light.target.position.set(
    side * (PLAYER_HEADLIGHT_CONFIG.halfSpacing + beamSplayMeters),
    -PLAYER_HEADLIGHT_CONFIG.downwardAimMeters,
    -PLAYER_HEADLIGHT_CONFIG.aimDistanceMeters,
  );
  return light;
}
