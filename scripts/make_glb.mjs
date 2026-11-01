/**
 * Builds the optional GLB props used by the game.
 *
 * The runtime never depends on these files: if a model is missing, the
 * procedural fallback is used. They exist so the project exercises a real
 * GLTFLoader path with committed binary assets.
 *
 * Usage: node scripts/make_glb.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** @typedef {{center:[number,number,number], size:[number,number,number], color:[number,number,number]}} Box */

/** @type {Box[]} */
const boxes = [];

const body = [0.42, 0.33, 0.25];
const brace = [0.2, 0.24, 0.24];
const trim = [0.62, 0.48, 0.26];

// Main cargo box.
boxes.push({ center: [0, 0, 0], size: [1.16, 0.82, 1.16], color: body });
// Top lid plate.
boxes.push({ center: [0, 0.44, 0], size: [1.24, 0.1, 1.24], color: brace });
// Corner braces.
for (const x of [-0.54, 0.54]) {
  for (const z of [-0.54, 0.54]) {
    boxes.push({ center: [x, 0, z], size: [0.11, 0.9, 0.11], color: brace });
  }
}
// Horizontal bands on all four sides.
for (const z of [-0.58, 0.58]) {
  boxes.push({ center: [0, 0.18, z], size: [1.2, 0.09, 0.06], color: trim });
  boxes.push({ center: [0, -0.2, z], size: [1.2, 0.07, 0.06], color: trim });
}
for (const x of [-0.58, 0.58]) {
  boxes.push({ center: [x, 0.18, 0], size: [0.06, 0.09, 1.2], color: trim });
  boxes.push({ center: [x, -0.2, 0], size: [0.06, 0.07, 1.2], color: trim });
}
// Small amber hazard caps on top.
for (const x of [-0.32, 0.32]) {
  boxes.push({ center: [x, 0.5, 0.38], size: [0.12, 0.1, 0.12], color: [0.9, 0.52, 0.14] });
}

/** @type {number[]} */
const positions = [];
/** @type {number[]} */
const normals = [];
/** @type {number[]} */
const colors = [];
/** @type {number[]} */
const indices = [];

const faces = [
  { normal: [1, 0, 0], corners: [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]] },
  { normal: [-1, 0, 0], corners: [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]] },
  { normal: [0, 1, 0], corners: [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]] },
  { normal: [0, -1, 0], corners: [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]] },
  { normal: [0, 0, 1], corners: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { normal: [0, 0, -1], corners: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
];

for (const [boxIndex, box] of boxes.entries()) {
  const base = positions.length / 3;
  const hx = box.size[0] / 2;
  const hy = box.size[1] / 2;
  const hz = box.size[2] / 2;
  const shade = 0.84 + ((boxIndex * 37) % 19) / 100;

  for (const face of faces) {
    // Slight per-face shade keeps the low-poly crate readable without a texture.
    const faceShade = face.normal[1] > 0 ? 1.08 : face.normal[1] < 0 ? 0.68 : 0.94;
    for (const corner of face.corners) {
      positions.push(
        box.center[0] + corner[0] * hx,
        box.center[1] + corner[1] * hy,
        box.center[2] + corner[2] * hz,
      );
      normals.push(face.normal[0], face.normal[1], face.normal[2]);
      colors.push(
        Math.min(1, box.color[0] * shade * faceShade),
        Math.min(1, box.color[1] * shade * faceShade),
        Math.min(1, box.color[2] * shade * faceShade),
        1,
      );
    }
  }

  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  indices.push(base + 4, base + 6, base + 5, base + 4, base + 7, base + 6);
  indices.push(base + 8, base + 9, base + 10, base + 8, base + 10, base + 11);
  indices.push(base + 12, base + 14, base + 13, base + 12, base + 15, base + 14);
  indices.push(base + 16, base + 17, base + 18, base + 16, base + 18, base + 19);
  indices.push(base + 20, base + 22, base + 21, base + 20, base + 23, base + 22);
}

function pad4(buffer) {
  const remainder = buffer.length % 4;
  return remainder === 0 ? buffer : Buffer.concat([buffer, Buffer.alloc(4 - remainder)]);
}

const positionBuffer = Buffer.from(new Float32Array(positions).buffer);
const normalBuffer = Buffer.from(new Float32Array(normals).buffer);
const colorBuffer = Buffer.from(new Float32Array(colors).buffer);
const indexBuffer = pad4(Buffer.from(new Uint16Array(indices).buffer));

const chunks = [positionBuffer, normalBuffer, colorBuffer, indexBuffer];
const views = [];
const accessors = [];
let offset = 0;

function addView(buffer, target) {
  const view = { buffer: 0, byteOffset: offset, byteLength: buffer.length };
  if (target) view.target = target;
  views.push(view);
  offset += buffer.length;
  return views.length - 1;
}

const positionView = addView(positionBuffer, 34962);
const normalView = addView(normalBuffer, 34962);
const colorView = addView(colorBuffer, 34962);
const indexView = addView(indexBuffer, 34963);

const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < positions.length; i += 3) {
  for (let axis = 0; axis < 3; axis++) {
    min[axis] = Math.min(min[axis], positions[i + axis]);
    max[axis] = Math.max(max[axis], positions[i + axis]);
  }
}

accessors.push({
  bufferView: positionView,
  componentType: 5126,
  count: positions.length / 3,
  type: 'VEC3',
  min,
  max,
});
accessors.push({
  bufferView: normalView,
  componentType: 5126,
  count: normals.length / 3,
  type: 'VEC3',
});
accessors.push({
  bufferView: colorView,
  componentType: 5126,
  count: colors.length / 4,
  type: 'VEC4',
});
accessors.push({
  bufferView: indexView,
  componentType: 5123,
  count: indices.length,
  type: 'SCALAR',
});

const gltf = {
  asset: { version: '2.0', generator: 'RAT TIDE asset pipeline' },
  scene: 0,
  scenes: [{ nodes: [0], name: 'SupplyCrate' }],
  nodes: [{ mesh: 0, name: 'SupplyCrate' }],
  meshes: [
    {
      name: 'SupplyCrate',
      primitives: [
        {
          attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 },
          indices: 3,
          material: 0,
          mode: 4,
        },
      ],
    },
  ],
  materials: [
    {
      name: 'CrateMetal',
      pbrMetallicRoughness: {
        baseColorFactor: [1, 1, 1, 1],
        metallicFactor: 0.62,
        roughnessFactor: 0.58,
      },
      doubleSided: true,
    },
  ],
  accessors,
  bufferViews: views,
  buffers: [{ byteLength: offset }],
};

const bin = Buffer.concat(chunks);
const json = pad4(Buffer.from(JSON.stringify(gltf), 'utf8'));
const total = 12 + 8 + json.length + 8 + bin.length;

const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0); // glTF
header.writeUInt32LE(2, 4);
header.writeUInt32LE(total, 8);

const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(json.length, 0);
jsonHeader.writeUInt32LE(0x4e4f534a, 4); // JSON

const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(bin.length, 0);
binHeader.writeUInt32LE(0x004e4942, 4); // BIN

const outDir = resolve(ROOT, 'public/models');
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, 'supply_crate.glb');
writeFileSync(outPath, Buffer.concat([header, jsonHeader, json, binHeader, bin]));
console.log(`Wrote ${outPath} (${total} bytes, ${positions.length / 3} vertices)`);
