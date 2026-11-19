import Module from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    request = path.join(root, "src", request.slice(2));
  }
  if (request.endsWith(".css")) {
    return request.startsWith("/") ? request : path.resolve(path.dirname(parent?.filename ?? root), request);
  }
  try {
    return originalResolveFilename.call(this, request, parent, isMain, options);
  } catch (error) {
    if (request.startsWith("/") || request.startsWith(".")) {
      for (const extension of [".ts", ".tsx", ".js", ".jsx"]) {
        const candidate = request.endsWith(extension) ? request : `${request}${extension}`;
        if (fs.existsSync(candidate)) return candidate;
      }
      for (const extension of ["/index.ts", "/index.tsx", "/index.js", "/index.jsx"]) {
        const candidate = request + extension;
        if (fs.existsSync(candidate)) return candidate;
      }
    }
    throw error;
  }
};

for (const extension of [".ts", ".tsx"]) {
  Module._extensions[extension] = (module, filename) => {
    const source = fs.readFileSync(filename, "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: filename,
    }).outputText;
    module._compile(output, filename);
  };
}

Module._extensions[".css"] = (module) => {
  module.exports = {};
};

const serverOnlyModule = { exports: {} };
Module._load = ((originalLoad) => function load(request, parent, isMain) {
  if (request === "server-only") return serverOnlyModule.exports;
  if (request === "react/jsx-runtime") {
    return originalLoad("react/jsx-runtime", parent, isMain);
  }
  return originalLoad(request, parent, isMain);
})(Module._load);
