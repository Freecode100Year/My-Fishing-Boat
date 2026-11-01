import * as THREE from 'three';
import { BOAT, BOOST, WORLD } from '../config/balance';
import { BoatModel, createBoatModel } from './BoatModel';
import { angleDelta, clamp, damp, shipForward } from '../utils/math';
import type { Input } from '../core/Input';
import type { Ocean } from '../world/Ocean';
import type { Islands } from '../world/Islands';

export interface BoatUpdateContext {
  input: Input;
  active: boolean;
  fuel: number;
  handlingPenalty: number;
  speedMultiplier: number;
  /** True while the Shift boost is engaged (energy is managed by the Game). */
  boost?: boolean;
}

export class Boat {
  readonly group: THREE.Group;
  readonly model: BoatModel;
  private courseRing: THREE.Group;

  heading = 0.2;
  speed = 0;
  throttle = 0;
  rudder = 0;
  pitch = 0;
  roll = 0;
  y = BOAT.bobOffset;
  currentSpeedMultiplier = 1;
  desiredHeading = 0.2;
  boosting = false;

  private collisionCooldown = 0;
  private flashTimer = 0;
  private onCollision?: (impact: number) => void;

  constructor(scene: THREE.Scene, onCollision?: (impact: number) => void) {
    this.model = createBoatModel();
    this.group = new THREE.Group();
    this.group.name = 'boat-root';
    this.group.rotation.order = 'YXZ';
    this.group.add(this.model.group);
    this.group.position.set(0, BOAT.bobOffset, 0);
    scene.add(this.group);
    this.onCollision = onCollision;

    // Heading marker around the boat
    this.courseRing = new THREE.Group();
    const ringGeo = new THREE.RingGeometry(5.6, 5.82, 48);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x45d8c5,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    this.courseRing.add(ringMesh);

    scene.add(this.courseRing);
  }

  reset(x = 0, z = 0, heading = 0.2): void {
    this.heading = heading;
    this.desiredHeading = heading;
    this.speed = 0;
    this.throttle = 0;
    this.rudder = 0;
    this.pitch = 0;
    this.roll = 0;
    this.group.position.set(x, BOAT.bobOffset, z);
    this.group.rotation.set(0, heading, 0);
    this.group.updateMatrixWorld(true);
  }

  update(dt: number, ctx: BoatUpdateContext, ocean: Ocean, islands: Islands): void {
    const { input, active, fuel, handlingPenalty, speedMultiplier } = ctx;
    this.currentSpeedMultiplier = speedMultiplier;
    this.boosting = !!ctx.boost && active && fuel > 0.01;
    const boostSpeed = this.boosting ? BOOST.speedMultiplier : 1;
    const boostAccel = this.boosting ? BOOST.accelMultiplier : 1;
    this.collisionCooldown = Math.max(0, this.collisionCooldown - dt);
    this.flashTimer = Math.max(0, this.flashTimer - dt);
    this.model.muzzleFlash.visible = this.flashTimer > 0;
    if (this.flashTimer > 0) {
      const t = this.flashTimer / 0.075;
      this.model.muzzleFlash.material.opacity = t;
      this.model.muzzleFlash.scale.setScalar(1.1 + (1 - t) * 1.2);
      this.model.muzzleFlash.material.rotation += dt * 18;
    }

    // Boosting always pushes forward, even if W is not held.
    const targetThrottle = active ? (this.boosting ? 1 : input.throttle) : 0;
    const throttleRate = targetThrottle === 0 ? BOAT.throttleDecay : BOAT.throttleResponse;
    this.throttle = damp(this.throttle, targetThrottle, throttleRate * 2.2, dt);

    const maxFwd = BOAT.maxForwardSpeed * speedMultiplier * boostSpeed;
    const maxRev = BOAT.maxReverseSpeed * (1 + (speedMultiplier - 1) * 0.65);

    if (fuel > 0.01 && active) {
      if (this.throttle > 0.02) {
        this.speed += BOAT.acceleration * speedMultiplier * boostAccel * this.throttle * dt;
      } else if (this.throttle < -0.02) {
        if (this.speed > 0.15) {
          this.speed -= BOAT.brakePower * Math.abs(this.throttle) * dt;
        } else {
          this.speed += BOAT.reverseAcceleration * speedMultiplier * this.throttle * dt;
        }
      }
    }

    // Hydrodynamic drag: linear + quadratic.
    const drag = BOAT.dragForward * Math.abs(this.speed) + (0.021 / Math.max(1, speedMultiplier * 0.85)) * this.speed * this.speed;
    const dragSign = Math.sign(this.speed);
    this.speed -= dragSign * drag * dt;
    if (Math.abs(this.speed) < 0.025) this.speed = 0;

    // When the boost ends, bleed off excess speed smoothly instead of snapping.
    if (this.speed > maxFwd) {
      this.speed = Math.max(maxFwd, this.speed - BOAT.brakePower * 0.45 * dt);
    }
    this.speed = Math.max(this.speed, -maxRev);

    // Steering is controlled by the A/D rudder keys.
    const manualRudder = active ? input.rudder : 0;
    const turnPowerBoost = 1 + (speedMultiplier - 1) * 0.42;
    const steerAuthority = clamp(Math.abs(this.speed) / 5.5, BOAT.minSteerAuthority, 1.15);

    if (active && Math.abs(manualRudder) > 0.01) {
      this.rudder = damp(this.rudder, manualRudder, BOAT.rudderResponse * 2.5, dt);
      const reverseSign = this.speed < -0.25 ? -1 : 1;
      const turn = BOAT.turnRate * turnPowerBoost * this.rudder * steerAuthority * handlingPenalty * reverseSign;
      this.heading += turn * dt;
      this.desiredHeading = this.heading;
    } else {
      this.desiredHeading = this.heading;
      this.rudder = damp(this.rudder, 0, BOAT.rudderResponse * 2.2, dt);
    }

    // Keep heading normalized in [-PI, PI]
    while (this.heading > Math.PI) this.heading -= Math.PI * 2;
    while (this.heading < -Math.PI) this.heading += Math.PI * 2;

    const forward = shipForward(this.heading);
    this.group.position.x += forward.x * this.speed * dt;
    this.group.position.z += forward.z * this.speed * dt;

    this.resolveWorldCollisions(islands);

    const rightX = Math.cos(this.heading);
    const rightZ = -Math.sin(this.heading);
    const lx = BOAT.sampleHalfLength;
    const lz = BOAT.sampleHalfWidth;
    const px = this.group.position.x;
    const pz = this.group.position.z;

    const hBow = ocean.getHeight(px + forward.x * lx, pz + forward.z * lx);
    const hStern = ocean.getHeight(px - forward.x * lx, pz - forward.z * lx);
    const hStar = ocean.getHeight(px + rightX * lz, pz + rightZ * lz);
    const hPort = ocean.getHeight(px - rightX * lz, pz - rightZ * lz);
    const hCenter = ocean.getHeight(px, pz);

    const targetY = (hBow + hStern + hStar + hPort + hCenter * 2) / 6 + BOAT.bobOffset;
    const targetPitch = -Math.atan2(hBow - hStern, lx * 2) * BOAT.waveResponse;
    const targetRoll =
      Math.atan2(hStar - hPort, lz * 2) * BOAT.waveResponse +
      Math.sin(ocean.time * 1.4) * 0.014 * (0.3 + Math.abs(this.speed) / 12) -
      this.rudder * clamp(Math.abs(this.speed) / 16, 0.01, 0.06);

    this.y = damp(this.y, targetY, 4.5, dt);
    this.pitch = damp(this.pitch, targetPitch, 5.0, dt);
    this.roll = damp(this.roll, targetRoll, 3.6, dt);

    this.group.position.y = this.y;
    this.group.rotation.set(this.pitch, this.heading, this.roll);

    // A subtle bow lift while accelerating, and squat at speed.
    this.group.rotation.x += this.throttle * 0.012;

    this.model.propeller.rotation.z += (4 + Math.abs(this.speed) * 2.2 + Math.abs(this.throttle) * 6 + Math.abs(this.rudder) * 3) * dt;
    this.model.radar.rotation.y += dt * 2.2;
    this.model.lantern.intensity = 7.5 + Math.sin(ocean.time * 7.2) * 1.2;
    this.model.spotlight.target.position.set(Math.sin(this.heading) * 30, 0, Math.cos(this.heading) * 30);
    this.model.spotlight.target.updateMatrixWorld();

    // Update 360° tactical course ring
    this.courseRing.visible = active;
    if (active) {
      this.courseRing.position.set(px, this.y - BOAT.bobOffset + 0.18, pz);
      this.courseRing.rotation.y = this.desiredHeading;
    }

    this.group.updateMatrixWorld(true);
  }

  private resolveWorldCollisions(islands: Islands): void {
    const px = this.group.position.x;
    const pz = this.group.position.z;

    for (const c of islands.colliders) {
      const dx = px - c.x;
      const dz = pz - c.z;
      const minDist = c.radius + 3.1;
      const distSq = dx * dx + dz * dz;
      if (distSq < minDist * minDist) {
        const dist = Math.max(Math.sqrt(distSq), 0.01);
        const nx = dx / dist;
        const nz = dz / dist;
        this.group.position.x = c.x + nx * minDist;
        this.group.position.z = c.z + nz * minDist;
        const impact = Math.abs(this.speed);
        if (impact > 2.8 && this.collisionCooldown <= 0) {
          this.collisionCooldown = 1.2;
          this.onCollision?.(impact);
        }
        this.speed *= 0.24;
        // Nudge heading away from the shore.
        const shoreHeading = Math.atan2(nx, nz);
        const delta = angleDelta(this.heading, shoreHeading);
        this.heading += clamp(delta, -0.045, 0.045);
      }
    }

    const distFromOrigin = Math.hypot(px, pz);
    if (distFromOrigin > WORLD.playRadius) {
      const scale = WORLD.playRadius / distFromOrigin;
      this.group.position.x *= scale;
      this.group.position.z *= scale;
      this.speed *= 0.55;
    }
  }

  aimAt(worldPoint: THREE.Vector3, dt = 1 / 60): void {
    const turretWorld = new THREE.Vector3();
    this.model.turretYaw.getWorldPosition(turretWorld);
    const dir = worldPoint.clone().sub(turretWorld);
    if (dir.lengthSq() < 0.01) return;
    dir.normalize();

    const targetWorldYaw = Math.atan2(dir.x, dir.z);
    const localYaw = angleDelta(this.heading, targetWorldYaw);

    const horizontal = Math.hypot(dir.x, dir.z);
    const targetPitch = -Math.atan2(dir.y, Math.max(horizontal, 0.001));
    const clampedPitch = clamp(targetPitch, -0.26, 0.62);

    // Smooth 360° shortest-arc interpolation for turret yaw
    const currentYaw = this.model.turretYaw.rotation.y;
    const yawDiff = angleDelta(currentYaw, localYaw);
    let nextYaw = currentYaw + yawDiff * (1 - Math.exp(-14 * dt));
    while (nextYaw > Math.PI) nextYaw -= Math.PI * 2;
    while (nextYaw < -Math.PI) nextYaw += Math.PI * 2;

    this.model.turretYaw.rotation.y = nextYaw;
    this.model.turretPitch.rotation.x = damp(this.model.turretPitch.rotation.x, clampedPitch, 14, dt);
    this.model.turretYaw.updateMatrixWorld(true);
  }

  getMuzzleWorld(out = new THREE.Vector3()): THREE.Vector3 {
    this.group.updateMatrixWorld(true);
    return this.model.muzzle.getWorldPosition(out);
  }

  getTurretWorld(out = new THREE.Vector3()): THREE.Vector3 {
    return this.model.turretYaw.getWorldPosition(out);
  }

  flashMuzzle(): void {
    this.flashTimer = 0.075;
    this.model.muzzleFlash.visible = true;
    this.model.muzzleFlash.material.opacity = 1;
    this.model.muzzleFlash.material.rotation = Math.random() * Math.PI;
  }

  get forward(): { x: number; z: number } {
    return shipForward(this.heading);
  }

  get speedRatio(): number {
    const maxFwd = BOAT.maxForwardSpeed * this.currentSpeedMultiplier;
    return clamp(Math.abs(this.speed) / Math.max(1, maxFwd), 0, 1);
  }
}
