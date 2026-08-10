import { readFileSync } from "node:fs";
import { dirname, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseAst,
  type Plugin,
  type RenderBuiltAssetUrl,
} from "vite";

const PLUGIN_NAME = "justurbanwears:vercel-skew-protection";
const VINEXT_RENDER_WRAPPER = Symbol("justurbanwears:vinext-render-wrapper");

type AstNode = {
  type: string;
  start?: number;
  end?: number;
  source?: AstNode | null;
  expressions?: AstNode[];
  quasis?: Array<{ value?: { cooked?: string | null; raw?: string } }>;
  value?: unknown;
  [key: string]: unknown;
};

type VinextSeam = "app-bootstrap-preinit" | "dynamic-js-preload";

const VINEXT_SEAMS: Record<
  VinextSeam,
  {
    moduleSuffix: string;
    anchor: RegExp;
    before: RegExp;
    after: RegExp;
    replacement: string;
  }
> = {
  "app-bootstrap-preinit": {
    moduleSuffix: "/vinext/dist/server/app-ssr-entry.js",
    anchor: /pagesClientAssets\.appBootstrapPreinitModules|function\s+VinextFlightRoot/,
    before: /preinitModule\s*\(\s*moduleUrl\s*,/g,
    after:
      /preinitModule\s*\(\s*appendAssetDeploymentIdQuery\s*\(\s*moduleUrl\s*\)\s*,/,
    replacement: "preinitModule(appendAssetDeploymentIdQuery(moduleUrl),",
  },
  "dynamic-js-preload": {
    moduleSuffix: "/vinext/dist/shims/dynamic-preload-chunks.js",
    anchor: /function\s+DynamicPreloadChunks|ReactDOM\.preload/,
    before: /ReactDOM\.preload\s*\(\s*assetHref\s*,\s*preloadOptions\s*\)/g,
    after:
      /ReactDOM\.preload\s*\(\s*appendAssetDeploymentIdQuery\s*\(\s*assetHref\s*\)\s*,\s*preloadOptions\s*\)/,
    replacement:
      "ReactDOM.preload(appendAssetDeploymentIdQuery(assetHref), preloadOptions)",
  },
};

function appendDeploymentQuery(value: string, deploymentId: string): string {
  const hashIndex = value.indexOf("#");
  const withoutHash = hashIndex === -1 ? value : value.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : value.slice(hashIndex);
  const parsed = new URL(withoutHash, "https://vinext.local");

  if (parsed.searchParams.has("dpl")) return value;

  const separator = withoutHash.includes("?") ? "&" : "?";
  return `${withoutHash}${separator}dpl=${encodeURIComponent(deploymentId)}${hash}`;
}

export function appendVercelDeploymentId(
  value: string,
  deploymentId: string,
): string {
  const pathname = new URL(value, "https://vinext.local").pathname;
  if (!pathname.includes("/_next/static/")) return value;
  return appendDeploymentQuery(value, deploymentId);
}

function clientImportTargetsNextStatic(
  specifier: string,
  importerFileName: string,
): boolean {
  const pathOnly = specifier.split(/[?#]/, 1)[0];
  let pathname: string;

  if (pathOnly.startsWith("./") || pathOnly.startsWith("../")) {
    const importerPath = importerFileName.startsWith("/")
      ? importerFileName
      : `/${importerFileName}`;
    pathname = posix.resolve(posix.dirname(importerPath), pathOnly);
  } else {
    pathname = new URL(specifier, "https://vinext.local").pathname;
  }

  return pathname.includes("/_next/static/") && pathname.endsWith(".js");
}

function staticImportSpecifier(node: AstNode | null | undefined): string | undefined {
  if (!node) return undefined;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;

  if (node.type === "TemplateLiteral" && node.expressions?.length === 0) {
    return node.quasis?.[0]?.value?.cooked ?? node.quasis?.[0]?.value?.raw;
  }

  return undefined;
}

function importSourceNode(node: AstNode): AstNode | undefined {
  if (
    node.type === "ImportDeclaration" ||
    node.type === "ExportNamedDeclaration" ||
    node.type === "ExportAllDeclaration" ||
    node.type === "ImportExpression"
  ) {
    return node.source ?? undefined;
  }

  return undefined;
}

function visitAst(node: unknown, visitor: (node: AstNode) => void): void {
  if (Array.isArray(node)) {
    for (const child of node) visitAst(child, visitor);
    return;
  }
  if (!node || typeof node !== "object") return;

  const candidate = node as AstNode;
  if (typeof candidate.type === "string") visitor(candidate);
  for (const [key, child] of Object.entries(candidate)) {
    if (key === "loc") continue;
    visitAst(child, visitor);
  }
}

export function rewriteClientChunkImports(
  source: string,
  importerFileName: string,
  deploymentId: string,
): string {
  const replacements: Array<{ start: number; end: number; value: string }> = [];
  const seenRanges = new Set<string>();
  const ast = parseAst(source) as unknown as AstNode;

  visitAst(ast, (node) => {
    const sourceNode = importSourceNode(node);
    const specifier = staticImportSpecifier(sourceNode);
    if (
      !sourceNode ||
      specifier === undefined ||
      !clientImportTargetsNextStatic(specifier, importerFileName)
    ) {
      return;
    }

    const start = sourceNode.start;
    const end = sourceNode.end;
    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      throw new Error(`[${PLUGIN_NAME}] Vite AST omitted an import source range.`);
    }

    const range = `${start}:${end}`;
    if (seenRanges.has(range)) return;
    seenRanges.add(range);
    replacements.push({
      start: start as number,
      end: end as number,
      value: JSON.stringify(appendDeploymentQuery(specifier, deploymentId)),
    });
  });

  let rewritten = source;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    rewritten =
      rewritten.slice(0, replacement.start) +
      replacement.value +
      rewritten.slice(replacement.end);
  }
  return rewritten;
}

export function rewriteVinextDeploymentSeam(
  source: string,
  seamName: VinextSeam,
  allowProxyModule = false,
): string {
  const seam = VINEXT_SEAMS[seamName];
  if (seam.after.test(source)) return source;

  const matches = [...source.matchAll(seam.before)];
  if (matches.length === 1) return source.replace(seam.before, seam.replacement);

  if (allowProxyModule && !seam.anchor.test(source)) return source;

  throw new Error(
    `[${PLUGIN_NAME}] Vinext ${seamName} seam changed (found ${matches.length}); ` +
      "review the pinned vinext upgrade before deploying.",
  );
}

function assertInstalledVinextSeams(): void {
  const vinextDist = dirname(fileURLToPath(import.meta.resolve("vinext")));

  for (const [seamName, seam] of Object.entries(VINEXT_SEAMS) as Array<
    [VinextSeam, (typeof VINEXT_SEAMS)[VinextSeam]]
  >) {
    const modulePath = resolve(
      vinextDist,
      seam.moduleSuffix.replace("/vinext/dist/", ""),
    );
    rewriteVinextDeploymentSeam(readFileSync(modulePath, "utf8"), seamName);
  }
}

function seamForModuleId(id: string): VinextSeam | undefined {
  const normalizedId = id.split("?", 1)[0].replaceAll("\\", "/");
  return (Object.entries(VINEXT_SEAMS) as Array<
    [VinextSeam, (typeof VINEXT_SEAMS)[VinextSeam]]
  >).find(([, seam]) => normalizedId.endsWith(seam.moduleSuffix))?.[0];
}

function wrapRenderBuiltUrl(
  renderer: RenderBuiltAssetUrl,
  deploymentId: string,
): RenderBuiltAssetUrl {
  const taggedRenderer = renderer as RenderBuiltAssetUrl & {
    [VINEXT_RENDER_WRAPPER]?: boolean;
  };
  if (taggedRenderer[VINEXT_RENDER_WRAPPER]) return renderer;

  const wrapped: RenderBuiltAssetUrl = (filename, context) => {
    const rendered = renderer(filename, context);
    return typeof rendered === "string"
      ? appendVercelDeploymentId(rendered, deploymentId)
      : rendered;
  };
  Object.assign(wrapped, { [VINEXT_RENDER_WRAPPER]: true });
  return wrapped;
}

/**
 * Finish Vinext's deployment-ID coverage for assets that Vite or Vinext emit
 * outside Next's navigation/RSC URL helpers.
 */
export function vercelSkewProtection(deploymentId?: string): Plugin {
  if (deploymentId) assertInstalledVinextSeams();

  return {
    name: PLUGIN_NAME,
    enforce: "post",
    config(config) {
      if (!deploymentId) return;
      const renderer = config.experimental?.renderBuiltUrl;
      if (typeof renderer !== "function") {
        throw new Error(
          `[${PLUGIN_NAME}] Vinext did not install experimental.renderBuiltUrl.`,
        );
      }

      return {
        experimental: {
          renderBuiltUrl: wrapRenderBuiltUrl(renderer, deploymentId),
        },
      };
    },
    configResolved(config) {
      if (deploymentId && config.environments.client.build.sourcemap) {
        throw new Error(
          `[${PLUGIN_NAME}] client sourcemaps require mapping the post-hash import rewrite.`,
        );
      }
    },
    applyToEnvironment(environment) {
      if (!deploymentId) return false;
      const isClient = environment.name === "client";

      return {
        name: `${PLUGIN_NAME}:${environment.name}`,
        enforce: "post",
        transform(source, id) {
          const seamName = seamForModuleId(id);
          if (!seamName) return null;

          const rewritten = rewriteVinextDeploymentSeam(source, seamName, true);
          return rewritten === source ? null : { code: rewritten, map: null };
        },
        generateBundle: {
          order: "post",
          handler(_options, bundle) {
            if (!isClient) return;
            for (const output of Object.values(bundle)) {
              if (output.type !== "chunk") continue;
              output.code = rewriteClientChunkImports(
                output.code,
                output.fileName,
                deploymentId,
              );
            }
          },
        },
      };
    },
  };
}
