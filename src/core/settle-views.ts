/**
 * The off-screen warm-up views for the startup settle.
 *
 * Why a sweep: the settle renders the real first frame's context, but from one camera — the
 * chase cam at spawn. Everything that first becomes visible *while driving* (the far city
 * blocks, the tower faces, the street furniture on the far side of the grid, the casters that
 * only sit inside the shadow frustum from another angle) paid its pipeline-creation cost on its
 * first gameplay frame — the "stutter while driving a bit" residue. Sweeping a bounded set of
 * views around the spawn point before the first frame makes the playable area's pipelines exist
 * when the player can first see them, without a second full-scene compile.
 *
 * The geometry is a pure function here (spawn point, district centre, a height query) so the
 * view layout is unit-testable without a renderer: the ring views stand on terrain at a fixed
 * radius and look back at the spawn point, and the two high views look down over the district
 * so its far corners and the tower tops are in frame from each side.
 */

/** One off-screen settle render: stand here, look there. World coordinates, metres. */
export interface PrewarmView {
  readonly position: readonly [number, number, number];
  readonly lookAt: readonly [number, number, number];
}

export interface SettleViewOptions {
  /** The spawn (car) position the gameplay starts from. */
  readonly spawn: { readonly x: number; readonly y: number; readonly z: number };
  /** The district centre the high views aim over (Aohara's grid centre). */
  readonly districtCenter: { readonly x: number; readonly z: number };
  /** Terrain height query (world XZ in, metres out). */
  readonly heightAt: (x: number, z: number) => number;
  /** Ring-view count around the spawn. Default 8. */
  readonly ringViews?: number;
  /** Ring-view stand-off distance from the spawn. Default 220 m. */
  readonly ringRadiusMeters?: number;
  /** Ring-view eye height above local terrain. Default 18 m. */
  readonly ringEyeMeters?: number;
  /** High-view eye height above the district-centre terrain. Default 380 m. */
  readonly highEyeMeters?: number;
  /** High-view stand-off distance from the district centre, on either side. Default 260 m. */
  readonly highStandoffMeters?: number;
}

const RING_VIEWS = 8;
const RING_RADIUS_METERS = 220;
const RING_EYE_METERS = 18;
const HIGH_EYE_METERS = 380;
const HIGH_STANDOFF_METERS = 260;
/** The look target is slightly above the road so horizon content stays in the frustum. */
const LOOK_TARGET_LIFT_METERS = 2;

export function buildSettleViews(options: SettleViewOptions): readonly PrewarmView[] {
  const { spawn, districtCenter, heightAt } = options;
  const ringViews = options.ringViews ?? RING_VIEWS;
  const ringRadius = options.ringRadiusMeters ?? RING_RADIUS_METERS;
  const ringEye = options.ringEyeMeters ?? RING_EYE_METERS;
  const highEye = options.highEyeMeters ?? HIGH_EYE_METERS;
  const highStandoff = options.highStandoffMeters ?? HIGH_STANDOFF_METERS;

  const views: PrewarmView[] = [];
  const spawnLook: readonly [number, number, number] = [
    spawn.x,
    spawn.y + LOOK_TARGET_LIFT_METERS,
    spawn.z,
  ];

  // Ring views: stand at a fixed radius around the spawn, on terrain, looking back at it. Eight
  // directions at 220 m cover the district core from every side a player can first approach it
  // from; each one pulls its side of the blocks, facades and street furniture into frame.
  for (let index = 0; index < ringViews; index += 1) {
    const angle = (index / ringViews) * Math.PI * 2;
    const x = spawn.x + Math.sin(angle) * ringRadius;
    const z = spawn.z + Math.cos(angle) * ringRadius;
    views.push({
      position: [x, heightAt(x, z) + ringEye, z],
      lookAt: spawnLook,
    });
  }

  // High views: one on each side of the district, high enough that the whole 640 m grid fits
  // the frustum — the tower tops and the far-block casters that no ring view sees from below.
  // The pair stands on the line spawn-to-centre, on opposite sides, so between the two renders
  // every part of the district has faced a shadow-casting render at least once.
  const directionX = districtCenter.x - spawn.x;
  const directionZ = districtCenter.z - spawn.z;
  const directionLength = Math.hypot(directionX, directionZ);
  if (directionLength > 1) {
    const unitX = directionX / directionLength;
    const unitZ = directionZ / directionLength;
    for (const side of [-1, 1]) {
      const x = districtCenter.x + unitX * highStandoff * side;
      const z = districtCenter.z + unitZ * highStandoff * side;
      views.push({
        position: [x, heightAt(x, z) + highEye, z],
        lookAt: [
          districtCenter.x,
          heightAt(districtCenter.x, districtCenter.z) + 20,
          districtCenter.z,
        ],
      });
    }
  }

  return views;
}
