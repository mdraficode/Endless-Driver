import {
  BoxGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Object3D,
  Quaternion,
  StaticDrawUsage,
  Vector3,
} from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';

import { HINODE_TOUGE_ROCKFALLS } from '../config/touge';
import { collideCarWithStaticBoxes, type StaticBuildingBox } from './static-building-collision';
import type { RoadEdge, RoadNetwork } from './road-network';
import type { TerrainSampler } from './terrain-height';
import type { TownCarProbe, TownHit } from './town';

const LOCAL_RIGHT = new Vector3(1, 0, 0);
const LOCAL_UP = new Vector3(0, 1, 0);
const WORLD_UP_QUATERNION = new Quaternion();
const GUARDRAIL_OFFSET_METERS = 0.62;
const GUARDRAIL_HEIGHT_METERS = 0.84;
const GUARDRAIL_STEP_METERS = 3.4;

interface Transform {
  readonly position: Vector3;
  readonly rotation: Quaternion;
  readonly scale: Vector3;
}

export interface RockfallPlacement {
  readonly edgeId: string;
  readonly progress: number;
  readonly side: -1 | 1;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly radius: number;
}

function material(color: number, roughness: number, metalness = 0): MeshStandardNodeMaterial {
  const result = new MeshStandardNodeMaterial();
  result.color.setHex(color);
  result.roughness = roughness;
  result.metalness = metalness;
  return result;
}

function buildInstances(
  root: Group,
  name: string,
  geometry: BoxGeometry | IcosahedronGeometry,
  surface: MeshStandardNodeMaterial,
  transforms: readonly Transform[],
): void {
  if (transforms.length === 0) return;
  const mesh = new InstancedMesh(geometry, surface, transforms.length);
  mesh.name = name;
  mesh.instanceMatrix.setUsage(StaticDrawUsage);
  const scratch = new Object3D();
  transforms.forEach((transform, index) => {
    scratch.position.copy(transform.position);
    scratch.quaternion.copy(transform.rotation);
    scratch.scale.copy(transform.scale);
    scratch.updateMatrix();
    mesh.setMatrixAt(index, scratch.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  root.add(mesh);
}

function pointAtProgress(
  edge: RoadEdge,
  progress: number,
): {
  readonly point: RoadEdge['points'][number];
  readonly tangentX: number;
  readonly tangentZ: number;
} | null {
  const points = edge.points;
  if (points.length < 3) return null;
  const index = Math.max(
    1,
    Math.min(points.length - 2, Math.round(progress * (points.length - 1))),
  );
  const previous = points[index - 1]!;
  const point = points[index]!;
  const next = points[index + 1]!;
  const tangentX = next.x - previous.x;
  const tangentZ = next.z - previous.z;
  const length = Math.hypot(tangentX, tangentZ);
  if (length < 1e-6) return null;
  return { point, tangentX: tangentX / length, tangentZ: tangentZ / length };
}

function makeTransform(
  x: number,
  y: number,
  z: number,
  rotation: Quaternion,
  sx: number,
  sy: number,
  sz: number,
): Transform {
  return {
    position: new Vector3(x, y, z),
    rotation: rotation.clone(),
    scale: new Vector3(sx, sy, sz),
  };
}

/**
 * Mountain-road presentation and analytic static collision: outer-edge guardrails, reflective
 * markers, and sparse rockfall debris. Collisions use the same response contract as town props,
 * so the Rapier car receives an impulse and the existing impact animation plays without mesh damage.
 */
export class HinodeTougeWorld {
  readonly root = new Group();
  readonly #colliders: StaticBuildingBox[] = [];
  readonly #rockfalls: RockfallPlacement[] = [];
  #guardrailSegments = 0;

  constructor(network: RoadNetwork, terrain: TerrainSampler) {
    this.root.name = 'hinode-touge-hazards';
    const tougeEdges = network.edges.filter((edge) => edge.roadClass === 'touge');
    if (tougeEdges.length === 0) return;

    const railTransforms: Transform[] = [];
    const postTransforms: Transform[] = [];
    const reflectorTransforms: Transform[] = [];
    this.#buildGuardrails(tougeEdges, terrain, railTransforms, postTransforms, reflectorTransforms);
    this.#buildRockfalls(network, terrain);

    const railGeometry = new BoxGeometry(1, 1, 1);
    const postGeometry = new BoxGeometry(1, 1, 1);
    const reflectorGeometry = new BoxGeometry(1, 1, 1);
    const rockGeometry = new IcosahedronGeometry(1, 1);
    const signBoardGeometry = new BoxGeometry(1, 1, 1);
    const signStripeGeometry = new BoxGeometry(1, 1, 1);
    const postMaterial = material(0x535b5d, 0.55, 0.55);
    const railMaterial = material(0x92999a, 0.42, 0.68);
    const reflectorMaterial = material(0xe5c56e, 0.35, 0.1);
    const rockMaterial = material(0x62635e, 0.96);
    const signMaterial = material(0xdba83b, 0.62);
    const stripeMaterial = material(0x202321, 0.78);

    buildInstances(this.root, 'touge-guardrail-posts', postGeometry, postMaterial, postTransforms);
    // Two rails share one batched mesh; each section contributes an upper and a lower run.
    const pairedRails = railTransforms.flatMap((transform) => [
      makeTransform(
        transform.position.x,
        transform.position.y - 0.16,
        transform.position.z,
        transform.rotation,
        transform.scale.x,
        transform.scale.y,
        transform.scale.z,
      ),
      transform,
    ]);
    buildInstances(this.root, 'touge-guardrail-runs', railGeometry, railMaterial, pairedRails);
    buildInstances(
      this.root,
      'touge-guardrail-reflectors',
      reflectorGeometry,
      reflectorMaterial,
      reflectorTransforms,
    );

    const rockTransforms = this.#rockfalls.map((rock, index) => {
      const rotation = new Quaternion().setFromAxisAngle(LOCAL_UP, rock.yaw + index * 0.37);
      return makeTransform(
        rock.x,
        rock.y + rock.radius * 0.92,
        rock.z,
        rotation,
        rock.radius * 1.45,
        rock.radius * 1.1,
        rock.radius * 1.32,
      );
    });
    buildInstances(this.root, 'touge-rockfall-debris', rockGeometry, rockMaterial, rockTransforms);

    const signBoards: Transform[] = [];
    const signPosts: Transform[] = [];
    const signStripes: Transform[] = [];
    for (const rock of this.#rockfalls) {
      const edge = tougeEdges.find((candidate) => candidate.id === rock.edgeId);
      const tangent = edge === undefined ? null : pointAtProgress(edge, rock.progress);
      if (edge === undefined || tangent === null) continue;
      const normalX = -tangent.tangentZ * rock.side;
      const normalZ = tangent.tangentX * rock.side;
      const offset = edge.halfWidthMeters + edge.shoulderMeters + 1.15;
      const x = tangent.point.x + normalX * offset;
      const z = tangent.point.z + normalZ * offset;
      const groundY = terrain.heightAt(x, z);
      const faceTowardRoad = Math.atan2(-normalX, -normalZ);
      const signRotation = new Quaternion().setFromAxisAngle(LOCAL_UP, faceTowardRoad);
      signPosts.push(makeTransform(x, groundY + 0.54, z, WORLD_UP_QUATERNION, 0.09, 1.08, 0.09));
      signBoards.push(makeTransform(x, groundY + 1.24, z, signRotation, 0.92, 0.68, 0.11));
      for (const offsetX of [-0.22, 0.22]) {
        const stripeRotation = signRotation
          .clone()
          .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -0.55));
        const stripePosition = new Vector3(x, groundY + 1.24, z).add(
          new Vector3(offsetX, 0, 0).applyQuaternion(signRotation),
        );
        signStripes.push({
          position: stripePosition.add(new Vector3(0, 0, 0.075).applyQuaternion(signRotation)),
          rotation: stripeRotation,
          scale: new Vector3(0.13, 0.55, 0.035),
        });
      }
    }
    buildInstances(
      this.root,
      'touge-rockfall-warning-posts',
      postGeometry,
      postMaterial,
      signPosts,
    );
    buildInstances(
      this.root,
      'touge-rockfall-warning-boards',
      signBoardGeometry,
      signMaterial,
      signBoards,
    );
    buildInstances(
      this.root,
      'touge-rockfall-warning-chevrons',
      signStripeGeometry,
      stripeMaterial,
      signStripes,
    );
  }

  /** Resolve contacts with a static collision response; impacts animate but never deform the car. */
  collide(car: TownCarProbe): TownHit[] {
    return collideCarWithStaticBoxes(car, this.#colliders).map((hit) => ({
      ...hit,
      impact: hit.absorbedSpeed >= 1.35,
      impactSpeed: hit.absorbedSpeed,
    }));
  }

  getContentStats(): Readonly<Record<string, number>> {
    return {
      hinodeTougeGuardrailSegments: this.#guardrailSegments,
      hinodeTougeRockfallHazards: this.#rockfalls.length,
      hinodeTougeWarningSigns: this.#rockfalls.length,
    };
  }

  get rockfallPlacements(): readonly RockfallPlacement[] {
    return this.#rockfalls;
  }

  #buildGuardrails(
    edges: readonly RoadEdge[],
    terrain: TerrainSampler,
    rails: Transform[],
    posts: Transform[],
    reflectors: Transform[],
  ): void {
    for (const edge of edges) {
      const points = edge.points;
      for (let index = 2; index < points.length - 2; index += 2) {
        const before = points[index - 1]!;
        const centre = points[index]!;
        const after = points[index + 1]!;
        const incomingX = centre.x - before.x;
        const incomingZ = centre.z - before.z;
        const outgoingX = after.x - centre.x;
        const outgoingZ = after.z - centre.z;
        const turn = incomingX * outgoingZ - incomingZ * outgoingX;
        const turnStrength =
          Math.abs(turn) /
          Math.max(1e-6, Math.hypot(incomingX, incomingZ) * Math.hypot(outgoingX, outgoingZ));
        if (turnStrength < 0.018) continue;

        const tangentX = after.x - before.x;
        const tangentZ = after.z - before.z;
        const tangentLength = Math.hypot(tangentX, tangentZ);
        if (tangentLength < 1) continue;
        const directionX = tangentX / tangentLength;
        const directionZ = tangentZ / tangentLength;
        const outerSide = turn > 0 ? -1 : 1;
        const offset = edge.halfWidthMeters + edge.shoulderMeters + GUARDRAIL_OFFSET_METERS;
        const normalX = -directionZ * outerSide;
        const normalZ = directionX * outerSide;
        const x = centre.x + normalX * offset;
        const z = centre.z + normalZ * offset;
        const y = terrain.heightAt(x, z);
        const tangent3 = new Vector3(
          after.x - before.x,
          after.y - before.y,
          after.z - before.z,
        ).normalize();
        const rotation = new Quaternion().setFromUnitVectors(LOCAL_RIGHT, tangent3);
        const groundY = y;
        const length = Math.min(tangentLength + 0.3, GUARDRAIL_STEP_METERS * 5.2);

        // Each rail bay is a slender, collision-enabled steel run with posts at regular intervals.
        rails.push(
          makeTransform(x, groundY + GUARDRAIL_HEIGHT_METERS, z, rotation, length, 0.13, 0.13),
        );
        for (let along = -length * 0.5; along <= length * 0.5; along += GUARDRAIL_STEP_METERS) {
          const postX = x + directionX * along;
          const postZ = z + directionZ * along;
          const postGround = terrain.heightAt(postX, postZ);
          posts.push(
            makeTransform(
              postX,
              postGround + GUARDRAIL_HEIGHT_METERS * 0.5,
              postZ,
              WORLD_UP_QUATERNION,
              0.14,
              GUARDRAIL_HEIGHT_METERS,
              0.14,
            ),
          );
          reflectors.push(
            makeTransform(
              postX,
              postGround + GUARDRAIL_HEIGHT_METERS + 0.01,
              postZ,
              rotation,
              0.12,
              0.1,
              0.045,
            ),
          );
        }
        const yaw = Math.atan2(directionZ, directionX);
        this.#colliders.push({
          x,
          z,
          yaw,
          halfWidth: length * 0.5 + 0.12,
          halfDepth: 0.15,
        });
        this.#guardrailSegments += 1;
      }
    }
  }

  #buildRockfalls(network: RoadNetwork, terrain: TerrainSampler): void {
    for (const config of HINODE_TOUGE_ROCKFALLS) {
      const edge = network.edges.find((candidate) => candidate.id === config.edgeId);
      if (edge === undefined) continue;
      const sample = pointAtProgress(edge, config.progress);
      if (sample === null) continue;
      const normalX = -sample.tangentZ * config.side;
      const normalZ = sample.tangentX * config.side;
      const offset = edge.halfWidthMeters + edge.shoulderMeters * 0.66;
      const x = sample.point.x + normalX * offset;
      const z = sample.point.z + normalZ * offset;
      const y = terrain.heightAt(x, z);
      const yaw = Math.atan2(sample.tangentZ, sample.tangentX);
      this.#rockfalls.push({
        edgeId: edge.id,
        progress: config.progress,
        side: config.side,
        x,
        y,
        z,
        yaw,
        radius: config.radius,
      });
      this.#colliders.push({
        x,
        z,
        yaw,
        halfWidth: config.radius * 0.78,
        halfDepth: config.radius * 0.72,
      });
    }
  }
}
