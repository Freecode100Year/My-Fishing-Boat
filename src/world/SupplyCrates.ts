import * as THREE from 'three';
import type { Ocean } from './Ocean';
import type { GLTFAssetLoader } from '../assets/GLTFAssetLoader';

interface FloatingCrate {
  object: THREE.Object3D;
  x: number;
  z: number;
  phase: number;
  spin: number;
  respawnTimer: number;
}

const CRATE_SPOTS = [
  { x: 30, z: 38, scale: 1.7 },
  { x: -44, z: 25, scale: 1.35 },
  { x: 62, z: -24, scale: 1.5 },
  { x: -20, z: -56, scale: 1.25 },
  { x: 112, z: 96, scale: 1.8 },
];

/**
 * Interactive GLB salvage crates floating in the world.
 *
 * Loaded through THREE.GLTFLoader from public/models/supply_crate.glb. When
 * the asset is unavailable, low-poly procedural crates are used instead so
 * the scene never breaks. Sailing near a crate automatically salvages supplies!
 */
export class SupplyCrates {
  readonly group = new THREE.Group();
  private ocean: Ocean;
  private crates: FloatingCrate[] = [];
  private onSalvage?: (x: number, z: number) => void;

  constructor(
    scene: THREE.Scene,
    ocean: Ocean,
    assets: GLTFAssetLoader,
    baseUrl: string,
    onSalvage?: (x: number, z: number) => void,
  ) {
    this.ocean = ocean;
    this.onSalvage = onSalvage;
    this.group.name = 'supply-crates';
    scene.add(this.group);
    void this.load(assets, `${baseUrl}models/supply_crate.glb`);
  }

  private async load(assets: GLTFAssetLoader, url: string): Promise<void> {
    const model = await assets.loadScene(url);
    if (model) {
      this.buildFromModel(model);
      return;
    }
    this.buildFallback();
  }

  private buildFromModel(model: THREE.Group): void {
    CRATE_SPOTS.forEach((spot, index) => {
      const crate = model.clone(true);
      crate.scale.setScalar(spot.scale);
      crate.position.set(spot.x, this.ocean.getHeight(spot.x, spot.z) + 0.38, spot.z);
      crate.rotation.y = (index / CRATE_SPOTS.length) * Math.PI * 2;
      this.group.add(crate);
      this.crates.push({
        object: crate,
        x: spot.x,
        z: spot.z,
        phase: index * 1.7 + 0.4,
        spin: 0.08 + index * 0.012,
        respawnTimer: 0,
      });
    });
  }

  private buildFallback(): void {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4e3c2c, roughness: 0.72, metalness: 0.55 });
    const bandMat = new THREE.MeshStandardMaterial({ color: 0x8c703d, roughness: 0.55, metalness: 0.7 });
    CRATE_SPOTS.forEach((spot, index) => {
      const crate = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.82, 1.15), bodyMat);
      body.castShadow = true;
      body.receiveShadow = true;
      crate.add(body);
      for (const x of [-0.54, 0.54]) {
        for (const z of [-0.54, 0.54]) {
          const brace = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.1), bandMat);
          brace.position.set(x, 0, z);
          brace.castShadow = true;
          crate.add(brace);
        }
      }
      crate.scale.setScalar(spot.scale);
      crate.position.set(spot.x, this.ocean.getHeight(spot.x, spot.z) + 0.38, spot.z);
      crate.rotation.y = (index / CRATE_SPOTS.length) * Math.PI * 2;
      this.group.add(crate);
      this.crates.push({
        object: crate,
        x: spot.x,
        z: spot.z,
        phase: index * 1.7 + 0.4,
        spin: 0.08 + index * 0.012,
        respawnTimer: 0,
      });
    });
  }

  update(dt: number, time: number, playerPos?: THREE.Vector3, active = false): void {
    for (const crate of this.crates) {
      if (crate.respawnTimer > 0) {
        crate.respawnTimer = Math.max(0, crate.respawnTimer - dt);
        if (crate.respawnTimer <= 0) {
          crate.object.visible = true;
        } else {
          continue;
        }
      }

      const wave = this.ocean.getHeight(crate.x, crate.z);
      const bob = Math.sin(time * 0.72 + crate.phase) * 0.16;
      crate.object.position.y = wave + 0.34 + bob;
      crate.object.rotation.y += dt * crate.spin;
      crate.object.rotation.z = Math.sin(time * 0.5 + crate.phase) * 0.055;
      crate.object.rotation.x = Math.cos(time * 0.43 + crate.phase * 1.3) * 0.045;

      if (active && playerPos) {
        const dx = playerPos.x - crate.x;
        const dz = playerPos.z - crate.z;
        if (dx * dx + dz * dz < 12.5 * 12.5) {
          crate.respawnTimer = 45;
          crate.object.visible = false;
          this.onSalvage?.(crate.x, crate.z);
        }
      }
    }
  }
}
