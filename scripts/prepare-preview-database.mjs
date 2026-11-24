import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export function shouldPreparePreviewDatabase(environment) {
  return environment.VERCEL_ENV === "preview"
    && environment.VERCEL_GIT_COMMIT_REF === "paddle-sandbox-preview";
}

function runNode(args, environment = process.env) {
  const result = spawnSync(process.execPath, args, {
    env: environment,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Preview database preparation failed: ${args.join(" ")} (exit ${result.status ?? "unknown"}).`);
  }
}

const isDirectExecution = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution && shouldPreparePreviewDatabase(process.env)) {
  runNode(["node_modules/prisma/build/index.js", "migrate", "deploy"]);
  runNode(
    ["--env-file-if-exists=.env", "prisma/seed.ts"],
    { ...process.env, ENABLE_LOCAL_DEMO: "false" },
  );
}
