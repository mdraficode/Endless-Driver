import type { TownCarProbe, TownHit } from './town';

/** Planar OBB used for town and high-rise collision, in world metres. */
export interface StaticBuildingBox {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly halfWidth: number;
  readonly halfDepth: number;
}

const CAR_CIRCLE_OFFSET = 1.05;
const CAR_CIRCLE_RADIUS = 1.18;

/**
 * Shared analytic broadphase/contact for static building footprints. This is the existing town
 * prop response path, not a second physics solver: returned impulses are applied to the Rapier car.
 */
export function collideCarWithStaticBoxes(
  car: TownCarProbe,
  boxes: readonly StaticBuildingBox[],
): TownHit[] {
  const hits: TownHit[] = [];
  const cos = Math.cos(car.yaw);
  const sin = Math.sin(car.yaw);
  const forwardX = -sin;
  const forwardZ = -cos;
  const circles = [
    { x: car.x + forwardX * CAR_CIRCLE_OFFSET, z: car.z + forwardZ * CAR_CIRCLE_OFFSET },
    { x: car.x - forwardX * CAR_CIRCLE_OFFSET, z: car.z - forwardZ * CAR_CIRCLE_OFFSET },
  ];

  const testCircleVsBox = (
    cx: number,
    cz: number,
    box: StaticBuildingBox,
  ): { normalX: number; normalZ: number; penetration: number } | null => {
    const dx = cx - box.x;
    const dz = cz - box.z;
    const bcos = Math.cos(box.yaw);
    const bsin = Math.sin(box.yaw);
    const lx = dx * bcos - dz * bsin;
    const lz = dx * bsin + dz * bcos;
    const closestX = Math.max(-box.halfWidth, Math.min(box.halfWidth, lx));
    const closestZ = Math.max(-box.halfDepth, Math.min(box.halfDepth, lz));
    const offX = lx - closestX;
    const offZ = lz - closestZ;
    const distSq = offX * offX + offZ * offZ;
    if (distSq >= CAR_CIRCLE_RADIUS * CAR_CIRCLE_RADIUS) {
      return null;
    }
    let nlx: number;
    let nlz: number;
    let penetration: number;
    if (distSq > 1e-9) {
      const dist = Math.sqrt(distSq);
      nlx = offX / dist;
      nlz = offZ / dist;
      penetration = CAR_CIRCLE_RADIUS - dist;
    } else {
      // Circle centre inside the box: exit along the shallowest face.
      if (box.halfWidth - Math.abs(lx) < box.halfDepth - Math.abs(lz)) {
        nlx = lx >= 0 ? 1 : -1;
        nlz = 0;
        penetration = box.halfWidth - Math.abs(lx) + CAR_CIRCLE_RADIUS;
      } else {
        nlx = 0;
        nlz = lz >= 0 ? 1 : -1;
        penetration = box.halfDepth - Math.abs(lz) + CAR_CIRCLE_RADIUS;
      }
    }
    return {
      normalX: nlx * bcos + nlz * bsin,
      normalZ: -nlx * bsin + nlz * bcos,
      penetration,
    };
  };

  for (const box of boxes) {
    if ((box.x - car.x) ** 2 + (box.z - car.z) ** 2 > 900) {
      continue;
    }
    for (const circle of circles) {
      const contact = testCircleVsBox(circle.x, circle.z, box);
      if (contact === null) {
        continue;
      }
      const vn = car.velocityX * contact.normalX + car.velocityZ * contact.normalZ;
      hits.push({
        ...contact,
        absorbedSpeed: Math.max(0, -vn),
        solid: true,
        impact: false,
        impactSpeed: Math.max(0, -vn),
        lateralOffset: (circle.x - car.x) * cos - (circle.z - car.z) * sin,
      });
      break;
    }
  }
  return hits;
}
