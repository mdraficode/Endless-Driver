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

/** Radius of each of the car's two contact circles (front axle, rear axle), in metres. */
export const CAR_CIRCLE_RADIUS_METERS = 1.18;

/** A car contact plus how hard the car is driving into the element it hit. */
export interface CarCircleContact {
  /** Unit normal pointing from the element toward the car (the push-out direction). */
  readonly normalX: number;
  readonly normalZ: number;
  /** How deep the car's circle is inside the element, in metres. */
  readonly penetration: number;
  /** `-(velocity · normal)`; positive when the car is still closing on the element. */
  readonly closing: number;
  /** Signed distance of the contacting circle from the car centre (forward positive). */
  readonly lateralOffset: number;
}

/** The car's two contact circles (front/rear axle), in world metres. */
export function carContactCircles(car: TownCarProbe): Array<{ x: number; z: number }> {
  const sin = Math.sin(car.yaw);
  const cos = Math.cos(car.yaw);
  const forwardX = -sin;
  const forwardZ = -cos;
  return [
    { x: car.x + forwardX * CAR_CIRCLE_OFFSET, z: car.z + forwardZ * CAR_CIRCLE_OFFSET },
    { x: car.x - forwardX * CAR_CIRCLE_OFFSET, z: car.z - forwardZ * CAR_CIRCLE_OFFSET },
  ];
}

/**
 * The car's contact circles against a world-space circle (a lamp pole, a street actor, a
 * cart wheel). Returns the deepest contact, with the normal pointing from the element toward
 * the car and `closing` positive while the car is still driving into it. This is the shared
 * broadphase for every dynamic street element — the same two circles that hit buildings.
 */
export function testCarCirclesVsCircle(
  car: TownCarProbe,
  x: number,
  z: number,
  radius: number,
): CarCircleContact | null {
  const totalRadius = CAR_CIRCLE_RADIUS_METERS + radius;
  const cos = Math.cos(car.yaw);
  const sin = Math.sin(car.yaw);
  let best: CarCircleContact | null = null;
  for (const circle of carContactCircles(car)) {
    const dx = circle.x - x;
    const dz = circle.z - z;
    const distSq = dx * dx + dz * dz;
    if (distSq >= totalRadius * totalRadius) {
      continue;
    }
    const dist = Math.sqrt(distSq);
    let normalX: number;
    let normalZ: number;
    let penetration: number;
    if (dist > 1e-9) {
      normalX = dx / dist;
      normalZ = dz / dist;
      penetration = totalRadius - dist;
    } else {
      // The circle centre sits on the element centre: push along the car's forward axis.
      const cos = Math.cos(car.yaw);
      const sin = Math.sin(car.yaw);
      normalX = -sin;
      normalZ = -cos;
      penetration = totalRadius;
    }
    const closing = -(car.velocityX * normalX + car.velocityZ * normalZ);
    // Rightward offset of the contacting circle, same convention as the building path
    // (positive = car's right) — this is the side an impact roll should lean toward.
    const contact: CarCircleContact = {
      normalX,
      normalZ,
      penetration,
      closing,
      lateralOffset: (circle.x - car.x) * cos - (circle.z - car.z) * sin,
    };
    if (best === null || contact.penetration > best.penetration) {
      best = contact;
    }
  }
  return best;
}

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
  const circles = carContactCircles(car);

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
    if (distSq >= CAR_CIRCLE_RADIUS_METERS * CAR_CIRCLE_RADIUS_METERS) {
      return null;
    }
    let nlx: number;
    let nlz: number;
    let penetration: number;
    if (distSq > 1e-9) {
      const dist = Math.sqrt(distSq);
      nlx = offX / dist;
      nlz = offZ / dist;
      penetration = CAR_CIRCLE_RADIUS_METERS - dist;
    } else {
      // Circle centre inside the box: exit along the shallowest face.
      if (box.halfWidth - Math.abs(lx) < box.halfDepth - Math.abs(lz)) {
        nlx = lx >= 0 ? 1 : -1;
        nlz = 0;
        penetration = box.halfWidth - Math.abs(lx) + CAR_CIRCLE_RADIUS_METERS;
      } else {
        nlx = 0;
        nlz = lz >= 0 ? 1 : -1;
        penetration = box.halfDepth - Math.abs(lz) + CAR_CIRCLE_RADIUS_METERS;
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
