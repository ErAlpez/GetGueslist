import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(root, "src/lib/background-job-batches.ts"), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = { exports: {} };
new Function("module", "exports", output)(loaded, loaded.exports);

test("invitation batches advance without overlap and cap the final batch", () => {
  let processedItems = 0;
  const ranges = [];
  while (processedItems < 25) {
    const end = loaded.exports.getBackgroundJobBatchEnd(processedItems, 25, 10);
    ranges.push([processedItems, end]);
    processedItems = end;
  }

  assert.deepEqual(ranges, [[0, 10], [10, 20], [20, 25]]);
});
