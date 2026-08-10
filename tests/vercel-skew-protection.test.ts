import assert from "node:assert/strict";
import test from "node:test";
import {
  appendVercelDeploymentId,
  rewriteClientChunkImports,
  rewriteVinextDeploymentSeam,
  vercelSkewProtection,
} from "../build/vercel-skew-protection.ts";

const DEPLOYMENT_ID = "dpl_test/value";

test("appends a deployment ID only to Next static URLs", () => {
  assert.equal(
    appendVercelDeploymentId("/_next/static/chunks/app.js", DEPLOYMENT_ID),
    "/_next/static/chunks/app.js?dpl=dpl_test%2Fvalue",
  );
  assert.equal(
    appendVercelDeploymentId(
      "https://cdn.example/base/_next/static/app.css?theme=dark#sheet",
      DEPLOYMENT_ID,
    ),
    "https://cdn.example/base/_next/static/app.css?theme=dark&dpl=dpl_test%2Fvalue#sheet",
  );
  assert.equal(
    appendVercelDeploymentId("/_next/static/app.css?dpl=already", DEPLOYMENT_ID),
    "/_next/static/app.css?dpl=already",
  );
  assert.equal(
    appendVercelDeploymentId("/images/app.css", DEPLOYMENT_ID),
    "/images/app.css",
  );
});

test("installs URL wrapping in Vite's application-level config lifecycle", () => {
  const plugin = vercelSkewProtection(DEPLOYMENT_ID);
  assert.equal(typeof plugin.config, "function");
  assert.equal(typeof plugin.applyToEnvironment, "function");
});

test("rewrites static and lazy client chunk imports without touching other strings", () => {
  const source = [
    'import "./shared.js";',
    'export { value } from "../chunks/value.js?mode=1#part";',
    "const lazy = import(`./lazy.js`);",
    'const tagged = import("./tagged.js?dpl=already");',
    'const packageImport = import("react");',
    'const text = "./not-an-import.js";',
  ].join("\n");
  const rewritten = rewriteClientChunkImports(
    source,
    "_next/static/chunks/routes/entry.js",
    DEPLOYMENT_ID,
  );

  assert.match(rewritten, /\.\/shared\.js\?dpl=dpl_test%2Fvalue/);
  assert.match(
    rewritten,
    /\.\.\/chunks\/value\.js\?mode=1&dpl=dpl_test%2Fvalue#part/,
  );
  assert.match(rewritten, /\.\/lazy\.js\?dpl=dpl_test%2Fvalue/);
  assert.match(rewritten, /\.\/tagged\.js\?dpl=already/);
  assert.match(rewritten, /import\("react"\)/);
  assert.match(rewritten, /const text = "\.\/not-an-import\.js"/);
  assert.equal(
    rewriteClientChunkImports(
      rewritten,
      "_next/static/chunks/routes/entry.js",
      DEPLOYMENT_ID,
    ),
    rewritten,
  );
});

test("patches Vinext preload seams idempotently", () => {
  const appSource =
    "function VinextFlightRoot(){for(const moduleUrl of pagesClientAssets.appBootstrapPreinitModules ?? []) preinitModule(moduleUrl, {as:'script'});}";
  const dynamicSource =
    "function DynamicPreloadChunks(){ReactDOM.preload(assetHref, preloadOptions);}";

  const appRewritten = rewriteVinextDeploymentSeam(
    appSource,
    "app-bootstrap-preinit",
  );
  const dynamicRewritten = rewriteVinextDeploymentSeam(
    dynamicSource,
    "dynamic-js-preload",
  );
  assert.match(
    appRewritten,
    /preinitModule\(appendAssetDeploymentIdQuery\(moduleUrl\),/,
  );
  assert.match(
    dynamicRewritten,
    /ReactDOM\.preload\(appendAssetDeploymentIdQuery\(assetHref\), preloadOptions\)/,
  );
  assert.equal(
    rewriteVinextDeploymentSeam(appRewritten, "app-bootstrap-preinit"),
    appRewritten,
  );
  assert.equal(
    rewriteVinextDeploymentSeam(dynamicRewritten, "dynamic-js-preload"),
    dynamicRewritten,
  );
});

test("fails fast when a recognizable Vinext seam drifts", () => {
  assert.throws(
    () =>
      rewriteVinextDeploymentSeam(
        "function VinextFlightRoot(){pagesClientAssets.appBootstrapPreinitModules;preinitModule(changedUrl, {});}",
        "app-bootstrap-preinit",
      ),
    /Vinext app-bootstrap-preinit seam changed/,
  );
  assert.throws(
    () =>
      rewriteVinextDeploymentSeam(
        "function DynamicPreloadChunks(){ReactDOM.preload(changedHref, preloadOptions);}",
        "dynamic-js-preload",
      ),
    /Vinext dynamic-js-preload seam changed/,
  );
});
