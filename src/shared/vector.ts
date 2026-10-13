/**
 * Engine-independent 3D math on plain `{ x, y, z }` / `{ x, y, z, w }` objects.
 *
 * Rapier's `Vector` and `Rotation` are structurally identical to these types, so physics and
 * vehicle code can use them without importing Rapier, Three.js, or any DOM type. Functions are
 * allocation-light: out-parameters are used where hot paths would otherwise create garbage.
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function cloneVec3(v: Vec3): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

export function setVec3(out: Vec3, x: number, y: number, z: number): Vec3 {
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

export function copyVec3(out: Vec3, v: Vec3): Vec3 {
  out.x = v.x;
  out.y = v.y;
  out.z = v.z;
  return out;
}

export function addVec3(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  out.x = a.x + b.x;
  out.y = a.y + b.y;
  out.z = a.z + b.z;
  return out;
}

export function subtractVec3(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  out.x = a.x - b.x;
  out.y = a.y - b.y;
  out.z = a.z - b.z;
  return out;
}

export function scaleVec3(out: Vec3, v: Vec3, scalar: number): Vec3 {
  out.x = v.x * scalar;
  out.y = v.y * scalar;
  out.z = v.z * scalar;
  return out;
}

export function addScaledVec3(out: Vec3, a: Vec3, b: Vec3, scalar: number): Vec3 {
  out.x = a.x + b.x * scalar;
  out.y = a.y + b.y * scalar;
  out.z = a.z + b.z * scalar;
  return out;
}

export function dotVec3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function crossVec3(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  const x = a.y * b.z - a.z * b.y;
  const y = a.z * b.x - a.x * b.z;
  const z = a.x * b.y - a.y * b.x;
  return setVec3(out, x, y, z);
}

export function lengthVec3(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

export function lengthSquaredVec3(v: Vec3): number {
  return v.x * v.x + v.y * v.y + v.z * v.z;
}

export function normalizeVec3(out: Vec3, v: Vec3): Vec3 {
  const length = lengthVec3(v);
  if (length <= 1e-9) {
    return setVec3(out, 0, 0, 0);
  }
  return scaleVec3(out, v, 1 / length);
}

export function lerpVec3(out: Vec3, a: Vec3, b: Vec3, t: number): Vec3 {
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  out.z = a.z + (b.z - a.z) * t;
  return out;
}

export function identityQuat(): Quat {
  return { x: 0, y: 0, z: 0, w: 1 };
}

export function quatFromYaw(yaw: number): Quat {
  const half = yaw * 0.5;
  return { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
}

export function multiplyQuat(out: Quat, a: Quat, b: Quat): Quat {
  const { x: ax, y: ay, z: az, w: aw } = a;
  const { x: bx, y: by, z: bz, w: bw } = b;
  out.x = aw * bx + ax * bw + ay * bz - az * by;
  out.y = aw * by - ax * bz + ay * bw + az * bx;
  out.z = aw * bz + ax * by - ay * bx + az * bw;
  out.w = aw * bw - ax * bx - ay * by - az * bz;
  return out;
}

export function conjugateQuat(out: Quat, q: Quat): Quat {
  out.x = -q.x;
  out.y = -q.y;
  out.z = -q.z;
  out.w = q.w;
  return out;
}

/** Rotates `v` by quaternion `q` (v' = q * v * q^-1) into `out`. */
export function rotateVec3ByQuat(out: Vec3, v: Vec3, q: Quat): Vec3 {
  const { x: qx, y: qy, z: qz, w: qw } = q;
  // t = 2 * (q_vec x v)
  const tx = 2 * (qy * v.z - qz * v.y);
  const ty = 2 * (qz * v.x - qx * v.z);
  const tz = 2 * (qx * v.y - qy * v.x);
  // v' = v + qw * t + q_vec x t
  return setVec3(
    out,
    v.x + qw * tx + (qy * tz - qz * ty),
    v.y + qw * ty + (qz * tx - qx * tz),
    v.z + qw * tz + (qx * ty - qy * tx),
  );
}

export function lerpQuat(out: Quat, a: Quat, b: Quat, t: number): Quat {
  let bx = b.x;
  let by = b.y;
  let bz = b.z;
  let bw = b.w;
  // Take the shorter arc.
  if (a.x * bx + a.y * by + a.z * bz + a.w * bw < 0) {
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  out.x = a.x + (bx - a.x) * t;
  out.y = a.y + (by - a.y) * t;
  out.z = a.z + (bz - a.z) * t;
  out.w = a.w + (bw - a.w) * t;
  return normalizeQuat(out, out);
}

export function normalizeQuat(out: Quat, q: Quat): Quat {
  const length = Math.hypot(q.x, q.y, q.z, q.w);
  if (length <= 1e-9) {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    out.w = 1;
    return out;
  }
  const inverse = 1 / length;
  out.x = q.x * inverse;
  out.y = q.y * inverse;
  out.z = q.z * inverse;
  out.w = q.w * inverse;
  return out;
}

/**
 * Frame-rate-independent smoothing factor.
 *
 * Returns the fraction of the remaining gap to close this frame for a given exponential time
 * constant, so behaviour does not change with display refresh rate.
 */
export function smoothingFactor(deltaSeconds: number, timeConstantSeconds: number): number {
  if (!(timeConstantSeconds > 0)) {
    return 1;
  }
  const delta = deltaSeconds > 0 ? deltaSeconds : 0;
  return 1 - Math.exp(-delta / timeConstantSeconds);
}

/** Yaw (rotation about +Y) extracted from a quaternion. */
export function yawFromQuat(q: Quat): number {
  const siny = 2 * (q.w * q.y + q.x * q.z);
  const cosy = 1 - 2 * (q.y * q.y + q.x * q.x);
  return Math.atan2(siny, cosy);
}
