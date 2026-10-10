// Maps Deno-style `npm:@base44/sdk@x` imports to the in-memory mock.
import { register } from "node:module";
register("data:text/javascript," + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec.startsWith("npm:@base44/sdk")) {
    return next(new URL("./tests/mocks/base44sdk.ts", "file://" + process.cwd() + "/").href, ctx);
  }
  return next(spec, ctx);
}`));
