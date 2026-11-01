import * as THREE from 'three';
import { CAMERA } from '../config/balance';
import { angleDelta, clamp, damp } from '../utils/math';
import type { Boat } from '../boat/Boat';
import type { Input } from '../core/Input';
import type { Ocean } from '../world/Ocean';

export class FollowCamera {
  readonly camera: THREE.PerspectiveCamera;
  /** World-space camera yaw (azimuth from boat to camera). */
  orbitYaw = Math.PI;
  orbitPitch = CAMERA.defaultPitch;
  distance = CAMERA.distance;
  sensitivity = 1;

  private smoothTarget = new THREE.Vector3();
  private smoothYaw = Math.PI;
  private smoothPitch = CAMERA.defaultPitch;
  private smoothDist = CAMERA.distance;
  private trauma = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, aspect, CAMERA.near, CAMERA.far);
    this.camera.position.set(0, 8, -16);
  }

  reset(boat: Boat): void {
    this.orbitYaw = boat.heading + Math.PI;
    this.smoothYaw = this.orbitYaw;
    this.orbitPitch = CAMERA.defaultPitch;
    this.smoothPitch = this.orbitPitch;
    this.distance = CAMERA.distance;
    this.smoothDist = this.distance;
    this.trauma = 0;

    this.smoothTarget.set(
      boat.group.position.x,
      boat.group.position.y + 2.05,
      boat.group.position.z,
    );
    this.applyCameraTransform(boat);
  }

  /** Forward direction of the camera on the XZ plane (from camera toward target). */
  get forwardYaw(): number {
    return this.smoothYaw - Math.PI;
  }

  addShake(amount: number): void {
    // Cap trauma so rapid combat never causes violent screen shaking
    this.trauma = Math.min(0.28, this.trauma + amount * 0.45);
  }

  update(dt: number, boat: Boat, input: Input, ocean: Ocean, active: boolean): void {
    if (active && input.rightDown) {
      // Unrestricted 360° camera rotation around the ship
      this.orbitYaw -= input.dragX * 0.0065 * this.sensitivity;
      while (this.orbitYaw > Math.PI) this.orbitYaw -= Math.PI * 2;
      while (this.orbitYaw < -Math.PI) this.orbitYaw += Math.PI * 2;
      this.orbitPitch = clamp(
        this.orbitPitch - input.dragY * 0.0048 * this.sensitivity,
        CAMERA.minPitch,
        CAMERA.maxPitch,
      );
    } else if (active) {
      // Gently follow behind the boat when driving
      if (Math.abs(input.throttle) > 0.1 || Math.abs(input.rudder) > 0.1) {
        const behindBoat = boat.heading + Math.PI;
        this.orbitYaw += angleDelta(this.orbitYaw, behindBoat) * (1 - Math.exp(-1.8 * dt));
      }
    }

    if (input.wheelDelta !== 0) {
      this.distance = clamp(this.distance + input.wheelDelta * 1.2, CAMERA.zoomMin, CAMERA.zoomMax);
    }

    // Smoothly interpolate spherical camera coordinates
    this.smoothYaw += angleDelta(this.smoothYaw, this.orbitYaw) * (1 - Math.exp(-10 * dt));
    while (this.smoothYaw > Math.PI) this.smoothYaw -= Math.PI * 2;
    while (this.smoothYaw < -Math.PI) this.smoothYaw += Math.PI * 2;

    this.smoothPitch = damp(this.smoothPitch, this.orbitPitch, 10, dt);
    this.smoothDist = damp(this.smoothDist, this.distance, 10, dt);

    // Lock X/Z tightly to the boat to prevent pos/lookAt desync jitter at high speeds; smooth Y bobbing
    this.smoothTarget.x = boat.group.position.x;
    this.smoothTarget.z = boat.group.position.z;
    this.smoothTarget.y = damp(this.smoothTarget.y, boat.group.position.y + 2.05, 4.0, dt);

    this.applyCameraTransform(boat, ocean);

    // Exponential decay of trauma every frame (never gets stuck)
    if (this.trauma > 0) {
      const intensity = this.trauma * this.trauma;
      const t = performance.now() * 0.001;
      this.camera.position.x += Math.sin(t * 45.1) * 0.14 * intensity;
      this.camera.position.y += Math.cos(t * 39.7) * 0.1 * intensity;
      this.camera.position.z += Math.sin(t * 51.3) * 0.14 * intensity;
      this.trauma = Math.max(0, this.trauma - dt * 3.8);
    }
  }

  private applyCameraTransform(boat: Boat, ocean?: Ocean): void {
    const horizontal = Math.cos(this.smoothPitch) * this.smoothDist;
    const camX = this.smoothTarget.x + Math.sin(this.smoothYaw) * horizontal;
    const camZ = this.smoothTarget.z + Math.cos(this.smoothYaw) * horizontal;
    let camY = this.smoothTarget.y + CAMERA.height * 0.32 + Math.sin(this.smoothPitch) * this.smoothDist;

    if (ocean) {
      const wave = ocean.getHeight(camX, camZ);
      camY = Math.max(camY, wave + 1.5, 2.0);
    }

    this.camera.position.set(camX, camY, camZ);

    const lookY = this.smoothTarget.y + 0.35 - this.smoothPitch * 1.1;
    this.camera.lookAt(this.smoothTarget.x, lookY, this.smoothTarget.z);
    this.camera.rotation.z += boat.roll * 0.03;
  }
}
