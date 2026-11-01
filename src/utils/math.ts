export const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number): number => (v - a) / (b - a);
export const smoothstep = (a: number, b: number, t: number): number => {
  const x = clamp((t - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
};
export const damp = (a: number, b: number, lambda: number, dt: number): number =>
  lerp(a, b, 1 - Math.exp(-lambda * dt));

export const randRange = (min: number, max: number, rng: () => number = Math.random): number =>
  min + (max - min) * rng();

export const randInt = (min: number, max: number, rng: () => number = Math.random): number =>
  Math.floor(randRange(min, max + 1, rng));

export const pick = <T>(arr: readonly T[], rng: () => number = Math.random): T =>
  arr[Math.floor(rng() * arr.length) % arr.length];

export const angleDelta = (a: number, b: number): number => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

/** Mulberry32 — deterministic, tiny PRNG for island generation. */
export function seededRandom(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function segmentIntersectsSphere(
  start: { x: number; y: number; z: number },
  end: { x: number; y: number; z: number },
  center: { x: number; y: number; z: number },
  radius: number,
): boolean {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const fx = start.x - center.x;
  const fy = start.y - center.y;
  const fz = start.z - center.z;
  const a = dx * dx + dy * dy + dz * dz;
  const b = 2 * (fx * dx + fy * dy + fz * dz);
  const c = fx * fx + fy * fy + fz * fz - radius * radius;
  if (a <= 0.000001) return c <= 0;
  if (c <= 0) return true;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return false;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1;
}

export function shipForward(heading: number): { x: number; z: number } {
  return { x: Math.sin(heading), z: Math.cos(heading) };
}

export function localToWorld(x: number, z: number, heading: number): { x: number; z: number } {
  const s = Math.sin(heading);
  const c = Math.cos(heading);
  return { x: x * c + z * s, z: -x * s + z * c };
}
