import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const source = await readFile(
  path.join(projectRoot, "web/diagram-viewport.js"),
  "utf8",
);
const context = vm.createContext({});
vm.runInContext(source, context);
const viewport = context.AssetAtlasViewport;

assert.equal(viewport.minScale, 0.25);
assert.equal(viewport.maxScale, 4);

assert.deepEqual(
  { ...viewport.fitTransform({ width: 1000, height: 700 }, { width: 800, height: 400 }) },
  { scale: 1, x: 100, y: 150 },
);
assert.deepEqual(
  { ...viewport.fitTransform({ width: 1000, height: 700 }, { width: 1600, height: 1000 }) },
  { scale: 0.565, x: 48.00000000000006, y: 67.5 },
);

const centeredZoom = viewport.zoomAtPoint(
  { scale: 1, x: 100, y: 50 },
  2,
  { x: 300, y: 250 },
);
assert.deepEqual({ ...centeredZoom }, { scale: 2, x: -100, y: -150 });
assert.equal(
  viewport.zoomAtPoint(centeredZoom, 99, { x: 0, y: 0 }).scale,
  viewport.maxScale,
);
assert.equal(
  viewport.zoomAtPoint(centeredZoom, 0.01, { x: 0, y: 0 }).scale,
  viewport.minScale,
);

assert.deepEqual(
  { ...viewport.panTransform({ scale: 1, x: 20, y: 30 }, { x: -7, y: 12 }) },
  { scale: 1, x: 13, y: 42 },
);

assert.equal(viewport.wheelScaleFactor(0), 1);
assert.ok(viewport.wheelScaleFactor(5) > 0.997);
assert.ok(viewport.wheelScaleFactor(5) < 1);
assert.ok(viewport.wheelScaleFactor(100) > 0.94);
assert.ok(viewport.wheelScaleFactor(100) < 0.95);
assert.equal(viewport.wheelScaleFactor(1000), viewport.wheelScaleFactor(120));
assert.ok(
  Math.abs(
    viewport.wheelScaleFactor(100) * viewport.wheelScaleFactor(-100) - 1,
  ) < Number.EPSILON,
);
assert.equal(viewport.wheelScaleFactor(3, 1), viewport.wheelScaleFactor(48));
assert.equal(viewport.wheelScaleFactor(1, 2, 900), viewport.wheelScaleFactor(120));

assert.deepEqual(
  {
    ...viewport.pinchTransform(
      { scale: 1, x: 0, y: 0 },
      { x: 100, y: 100 },
      { x: 120, y: 110 },
      100,
      200,
    ),
  },
  { scale: 2, x: -80, y: -90 },
);

assert.deepEqual(
  {
    ...viewport.constrainTransform(
      { scale: 1, x: -5000, y: 5000 },
      { width: 900, height: 600 },
      { width: 1200, height: 900 },
    ),
  },
  { scale: 1, x: -1120, y: 520 },
);

process.stdout.write("Diagram viewport math tests passed.\n");
