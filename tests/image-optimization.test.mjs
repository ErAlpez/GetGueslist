import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function loadTypeScript(file) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", output)(require, loaded, loaded.exports);
  return loaded.exports;
}

const { convertImageToAvif } = loadTypeScript("src/lib/image-optimization.ts");
const { detectEventAttachmentContentType } = loadTypeScript("src/lib/event-attachment.ts");

test("resizes valid raster input and emits a decodable AVIF image", async () => {
  const png = await sharp({
    create: {
      width: 800,
      height: 400,
      channels: 3,
      background: { r: 240, g: 80, b: 40 },
    },
  }).png().toBuffer();

  const avif = await convertImageToAvif(png, { maxDimension: 128, quality: 50 });
  const metadata = await sharp(avif).metadata();

  assert.equal(detectEventAttachmentContentType(avif), "image/avif");
  assert.ok(metadata.width <= 128);
  assert.ok(metadata.height <= 128);
});

test("rejects invalid image bytes instead of returning a success-shaped fallback", async () => {
  await assert.rejects(
    convertImageToAvif(Buffer.from("not an image"), { maxDimension: 128 }),
  );
});
