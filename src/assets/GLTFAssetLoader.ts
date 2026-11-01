import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Thin wrapper around THREE.GLTFLoader with graceful fallback.
 *
 * RAT TIDE is fully playable with procedural meshes. If a GLB/GLTF file is
 * present it is loaded and used; if it is missing or invalid the caller keeps
 * its procedural version and the game keeps running.
 */
export class GLTFAssetLoader {
  private loader = new GLTFLoader();
  private cache = new Map<string, Promise<GLTF | null>>();

  load(url: string): Promise<GLTF | null> {
    const cached = this.cache.get(url);
    if (cached) return cached;

    const request = new Promise<GLTF | null>((resolve) => {
      this.loader.load(
        url,
        (gltf) => resolve(gltf),
        undefined,
        (error) => {
          console.warn(`[RAT TIDE] Optional GLTF asset unavailable: ${url}`, error);
          resolve(null);
        },
      );
    });

    this.cache.set(url, request);
    return request;
  }

  async loadScene(url: string): Promise<THREE.Group | null> {
    const gltf = await this.load(url);
    if (!gltf) return null;
    gltf.scene.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    return gltf.scene;
  }
}
