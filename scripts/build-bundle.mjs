import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const rootDir = process.cwd();

function collectTsFiles(dir, list = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectTsFiles(full, list);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) list.push(full);
  }
  return list;
}

function resolveModId(fromId, req) {
  if (!req.startsWith('.')) return req;
  const baseParts = fromId.split('/').slice(0, -1);
  const reqParts = req.replace(/\.(ts|js)$/, '').split('/');
  for (const p of reqParts) {
    if (p === '.' || p === '') continue;
    if (p === '..') baseParts.pop();
    else baseParts.push(p);
  }
  return baseParts.join('/');
}

const glbPath = path.join(rootDir, 'public/models/supply_crate.glb');
const glbBase64 = fs.existsSync(glbPath)
  ? 'data:model/gltf-binary;base64,' + fs.readFileSync(glbPath).toString('base64')
  : '';

function collectFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(full, files);
    else files.push(full);
  }
  return files;
}

const versionHash = createHash('sha256');
const versionInputs = [
  path.join(rootDir, 'index.html'),
  path.join(rootDir, 'package.json'),
  path.join(rootDir, 'package-lock.json'),
  path.join(rootDir, 'scripts/build-bundle.mjs'),
  ...collectFiles(path.join(rootDir, 'src')),
  ...collectFiles(path.join(rootDir, 'public')),
].sort();
for (const file of versionInputs) {
  versionHash.update(path.relative(rootDir, file));
  versionHash.update(fs.readFileSync(file));
}
const buildVersion = versionHash.digest('hex').slice(0, 16);

function transpileAndRewrite(rawCode, moduleId, fileName = 'module.ts') {
  const result = ts.transpileModule(rawCode, {
    fileName,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      allowJs: true,
      removeComments: true,
    },
  });
  let out = result.outputText;
  // Rewrite require("...") calls so relative paths are pre-resolved and never use raw require("./...")
  out = out.replace(/\brequire\(\s*(["'])([^"']+)\1\s*\)/g, (_m, _q, spec) => {
    const resolved = resolveModId(moduleId, spec);
    return `__load(${JSON.stringify(resolved)})`;
  });
  return out;
}

const appModules = new Map();
const srcDir = path.join(rootDir, 'src');
const tsFiles = collectTsFiles(srcDir);

for (const file of tsFiles) {
  const rel = 'src/' + path.relative(srcDir, file).replace(/\\/g, '/').replace(/\.ts$/, '');
  let raw = fs.readFileSync(file, 'utf8');
  raw = raw.replace(/import\.meta\.env\.BASE_URL/g, '"./"');
  raw = raw.replace(/import\.meta\.env\.DEV/g, 'false');
  raw = raw.replace(/import\s+['"]\.\/styles\.css['"];?/g, '');
  if (rel === 'src/world/SupplyCrates' && glbBase64) {
    raw = raw.replace(
      '`${baseUrl}models/supply_crate.glb`',
      `${JSON.stringify(glbBase64)}`,
    );
  }
  appModules.set(rel, transpileAndRewrite(raw, rel, file));
}

// Also transpile Three.js & GLTFLoader for standalone dist/ bundle
const vendorModules = new Map();
{
  const coreRaw = fs.readFileSync(path.join(rootDir, 'node_modules/three/build/three.core.js'), 'utf8');
  vendorModules.set('three/core', transpileAndRewrite(coreRaw, 'three/core', 'three.core.js'));

  let threeModRaw = fs.readFileSync(path.join(rootDir, 'node_modules/three/build/three.module.js'), 'utf8');
  threeModRaw = threeModRaw.replace(/from\s+['"]\.\/three\.core\.js['"]/g, "from 'three/core'");
  vendorModules.set('three', transpileAndRewrite(threeModRaw, 'three', 'three.module.js'));

  const bguRaw = fs.readFileSync(
    path.join(rootDir, 'node_modules/three/examples/jsm/utils/BufferGeometryUtils.js'),
    'utf8',
  );
  vendorModules.set(
    'three/examples/jsm/utils/BufferGeometryUtils',
    transpileAndRewrite(bguRaw, 'three/examples/jsm/utils/BufferGeometryUtils', 'BufferGeometryUtils.js'),
  );

  const suRaw = fs.readFileSync(
    path.join(rootDir, 'node_modules/three/examples/jsm/utils/SkeletonUtils.js'),
    'utf8',
  );
  vendorModules.set(
    'three/examples/jsm/utils/SkeletonUtils',
    transpileAndRewrite(suRaw, 'three/examples/jsm/utils/SkeletonUtils', 'SkeletonUtils.js'),
  );

  let gltfRaw = fs.readFileSync(
    path.join(rootDir, 'node_modules/three/examples/jsm/loaders/GLTFLoader.js'),
    'utf8',
  );
  gltfRaw = gltfRaw
    .replace(/from\s+['"]\.\.\/utils\/BufferGeometryUtils\.js['"]/g, "from 'three/examples/jsm/utils/BufferGeometryUtils'")
    .replace(/from\s+['"]\.\.\/utils\/SkeletonUtils\.js['"]/g, "from 'three/examples/jsm/utils/SkeletonUtils'");
  vendorModules.set(
    'three/examples/jsm/loaders/GLTFLoader.js',
    transpileAndRewrite(gltfRaw, 'three/examples/jsm/loaders/GLTFLoader.js', 'GLTFLoader.js'),
  );
}

// 1. Build full standalone dist/ bundle
{
  const allEntries = [];
  for (const [id, code] of vendorModules.entries()) {
    allEntries.push(`${JSON.stringify(id)}: function(module, exports, __load) {\n${code}\n}`);
  }
  for (const [id, code] of appModules.entries()) {
    allEntries.push(`${JSON.stringify(id)}: function(module, exports, __load) {\n${code}\n}`);
  }

  const distBundleJs = `(function() {
  const __modules = {
${allEntries.join(',\n')}
  };
  const __cache = {};
  function __load(id) {
    const key = __modules[id] ? id : (__modules[id + '.js'] ? id + '.js' : id.replace(/\\.js$/, ''));
    if (__cache[key]) return __cache[key].exports;
    if (!__modules[key]) throw new Error('Module not found: ' + id);
    const mod = { exports: {} };
    __cache[key] = mod;
    __modules[key](mod, mod.exports, __load);
    return mod.exports;
  }
  __load('src/main');
})();
`;

  const distDir = path.join(rootDir, 'dist');
  const assetsDir = path.join(distDir, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });
  // Remove previous bundles: asset names are content-hashed, so stale files would pile up.
  for (const f of fs.readdirSync(assetsDir)) {
    fs.unlinkSync(path.join(assetsDir, f));
  }
  const cssContent = fs.readFileSync(path.join(srcDir, 'styles.css'), 'utf8');

  // /assets/* is served as immutable (see public/_headers), so every build MUST
  // use new file names. Otherwise browsers keep running last year's JS/CSS
  // against the new index.html and the game breaks.
  const jsFilename = `index-${buildVersion}.js`;
  const cssFilename = `index-${buildVersion}.css`;

  fs.writeFileSync(path.join(assetsDir, jsFilename), distBundleJs, 'utf8');
  fs.writeFileSync(path.join(assetsDir, cssFilename), cssContent, 'utf8');

  const pubModels = path.join(rootDir, 'public/models');
  const distModels = path.join(distDir, 'models');
  fs.mkdirSync(distModels, { recursive: true });
  for (const f of fs.readdirSync(pubModels)) {
    fs.copyFileSync(path.join(pubModels, f), path.join(distModels, f));
  }
  const publicHeaders = path.join(rootDir, 'public/_headers');
  if (fs.existsSync(publicHeaders)) fs.copyFileSync(publicHeaders, path.join(distDir, '_headers'));

  let indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  indexHtml = indexHtml.replace('<meta name="app-version" content="dev" />', `<meta name="app-version" content="${buildVersion}" />`);
  indexHtml = indexHtml.replace(
    '<script type="module" src="/src/main.ts"></script>',
    () => `<link rel="stylesheet" crossorigin href="./assets/${cssFilename}">\n    <script defer src="./assets/${jsFilename}"></script>`,
  );
  fs.writeFileSync(path.join(distDir, 'index.html'), indexHtml, 'utf8');
  fs.writeFileSync(path.join(distDir, 'version.json'), JSON.stringify({ version: buildVersion }) + '\n', 'utf8');
  console.log('Dist bundle built:', distBundleJs.length, 'bytes');
}

// 2. Build single-file Canvas HTML (loads Three.js + GLTFLoader from cdn.jsdelivr.net so file size is ~175KB!)
const canvasOutArg = process.argv[2];
if (canvasOutArg) {
  const appEntries = [];
  for (const [id, code] of appModules.entries()) {
    appEntries.push(`${JSON.stringify(id)}: function(module, exports, __load) {\n${code}\n}`);
  }
  const cssContent = fs.readFileSync(path.join(srcDir, 'styles.css'), 'utf8');
  let canvasHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

  const inlineModuleScript = `<style>\n${cssContent}\n</style>
    <script type="module">
import * as THREE_NS from 'https://cdn.jsdelivr.net/npm/three@0.170.0/+esm';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js/+esm';

const __external = {
  'three': THREE_NS,
  'three/examples/jsm/loaders/GLTFLoader.js': { GLTFLoader },
  'three/examples/jsm/loaders/GLTFLoader': { GLTFLoader }
};

const __modules = {
${appEntries.join(',\n')}
};
const __cache = {};
function __load(id) {
  if (__external[id]) return __external[id];
  const key = __modules[id] ? id : (__modules[id + '.js'] ? id + '.js' : id.replace(/\\.js$/, ''));
  if (__cache[key]) return __cache[key].exports;
  if (!__modules[key]) throw new Error('Module not found: ' + id);
  const mod = { exports: {} };
  __cache[key] = mod;
  __modules[key](mod, mod.exports, __load);
  return mod.exports;
}
__load('src/main');
    </script>`;

  canvasHtml = canvasHtml.replace('<script type="module" src="/src/main.ts"></script>', () => inlineModuleScript);
  fs.writeFileSync(canvasOutArg, canvasHtml, 'utf8');
  console.log('Canvas single-file HTML built:', canvasHtml.length, 'bytes ->', canvasOutArg);
}
