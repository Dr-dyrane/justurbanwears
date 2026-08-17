import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.MOBILE_VISUAL_QA_BASE_URL || "http://localhost:3000";
const outputDir = path.resolve("mobile-visual-qa");
await mkdir(outputDir, { recursive: true });

const routes = [
  { name: "shop", path: "/shop", kind: "shop" },
  { name: "product", path: "/shop/products/coral-drift-dress", kind: "product" },
  { name: "studio-home", path: "/studio?scenario=lifecycle", kind: "studio-home" },
  { name: "studio-wardrobe", path: "/studio/wardrobe?scenario=lifecycle", kind: "studio" },
  { name: "studio-dossier", path: "/studio/wardrobe/scenario-garment-live?scenario=lifecycle", kind: "studio" },
  { name: "studio-operations", path: "/studio/operations?scenario=lifecycle&view=inventory", kind: "studio" },
];

const viewports = [
  { name: "mobile-360", width: 360, height: 800, mobile: true },
  { name: "mobile-390", width: 390, height: 844, mobile: true },
  { name: "mobile-430", width: 430, height: 932, mobile: true },
  { name: "desktop-1440", width: 1440, height: 1000, mobile: false },
];

const themes = ["light", "dark"];
const report = { generatedAt: new Date().toISOString(), baseUrl, runs: [], summary: {} };
const failures = [];

function safeName(value) {
  return value.replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

async function settle(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(900);
  await page.evaluate(async () => {
    const max = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    for (let y = 0; y < max; y += Math.max(420, window.innerHeight * 0.72)) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 35));
    }
    window.scrollTo(0, 0);
    await document.fonts?.ready;
    await new Promise((resolve) => setTimeout(resolve, 250));
  });
}

async function geometryAudit(page, route, viewport) {
  return page.evaluate(({ kind, mobile, width, height }) => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none"
        && style.visibility !== "hidden"
        && Number(style.opacity) > 0.02
        && rect.width > 1
        && rect.height > 1;
    };
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement) || !visible(element)) return null;
      const box = element.getBoundingClientRect();
      return {
        top: Number(box.top.toFixed(1)),
        right: Number(box.right.toFixed(1)),
        bottom: Number(box.bottom.toFixed(1)),
        left: Number(box.left.toFixed(1)),
        width: Number(box.width.toFixed(1)),
        height: Number(box.height.toFixed(1)),
      };
    };
    const findings = [];
    const documentWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    if (documentWidth > window.innerWidth + 2) {
      findings.push(`horizontal overflow ${documentWidth}px > ${window.innerWidth}px`);
    }

    const heading = document.querySelector("main h1, .page-canvas h1");
    if (heading instanceof HTMLElement && visible(heading)) {
      const box = heading.getBoundingClientRect();
      if (box.left < -1 || box.right > window.innerWidth + 1 || heading.scrollWidth > heading.clientWidth + 2) {
        findings.push(`heading clipped: ${heading.textContent?.trim().slice(0, 80)}`);
      }
    }

    const importantText = Array.from(document.querySelectorAll(
      ".studio-garment-disclosure strong, .studio-garment-disclosure small, .studio-inventory-copy strong, .studio-inventory-copy small, .studio-recent-copy strong, .studio-recent-copy small, .shop-detail-facts dd, .shop-detail-price",
    )).filter(visible);
    const undersized = importantText.filter((element) => Number.parseFloat(getComputedStyle(element).fontSize) < 10);
    if (undersized.length) findings.push(`${undersized.length} operational labels below 10px`);

    if (mobile) {
      const shell = document.querySelector(".shop-mobile-shell");
      const dockHeight = shell instanceof HTMLElement && visible(shell)
        ? shell.getBoundingClientRect().height
        : 0;
      const content = kind.startsWith("studio")
        ? document.querySelector(".studio-shell .page-canvas")
        : document.querySelector(".shop-shell > main, .shop-product-page");
      const paddingBottom = content instanceof HTMLElement
        ? Number.parseFloat(getComputedStyle(content).paddingBottom)
        : 0;
      if (dockHeight > 0 && paddingBottom + 2 < dockHeight + 16) {
        findings.push(`dock clearance ${paddingBottom.toFixed(1)}px < ${(dockHeight + 16).toFixed(1)}px`);
      }

      if (kind.startsWith("studio")) {
        const context = document.querySelector(".studio-mobile-context");
        const fab = document.querySelector(".studio-mobile-fab");
        const visibleActions = [context, fab].filter(visible).length;
        if (visibleActions !== 1) findings.push(`Studio exposes ${visibleActions} visible primary actions`);
      }

      for (const element of document.querySelectorAll(".studio-filter-bar, .studio-segmented-view")) {
        if (!(element instanceof HTMLElement) || element.scrollWidth <= element.clientWidth + 2) continue;
        const style = getComputedStyle(element);
        const mask = style.maskImage || style.webkitMaskImage || "";
        if (!mask || mask === "none") findings.push("overflowing filter row has no continuation cue");
      }

      if (kind === "studio-home") {
        const hero = document.querySelector(".studio-atelier-hero");
        const task = document.querySelector(".studio-attention-primary");
        if (hero instanceof HTMLElement && visible(hero)) findings.push("Studio editorial hero still occupies mobile home");
        if (!(task instanceof HTMLElement) || !visible(task)) {
          findings.push("Studio primary task is not visible");
        } else if (task.getBoundingClientRect().top > Math.min(360, height * 0.44)) {
          findings.push(`Studio task begins too low at ${task.getBoundingClientRect().top.toFixed(1)}px`);
        }
      }

      if (kind === "product") {
        const intro = document.querySelector(".shop-detail-intro");
        const facts = document.querySelector(".shop-detail-facts");
        const actions = document.querySelector(".shop-purchase-actions");
        const utility = document.querySelector(".shop-detail-utility-row");
        if (![intro, facts, actions, utility].every((element) => element instanceof HTMLElement)) {
          findings.push("product buying hierarchy is incomplete");
        } else {
          const positions = [intro, facts, actions, utility].map((element) => element.getBoundingClientRect().top);
          if (!(positions[0] <= positions[1] && positions[1] <= positions[2] && positions[2] <= positions[3])) {
            findings.push(`product order is wrong: ${positions.map((value) => value.toFixed(1)).join(" / ")}`);
          }
          if (positions[2] > height * 1.08) {
            findings.push(`purchase action begins too low at ${positions[2].toFixed(1)}px`);
          }
        }
      }
    }

    return {
      findings,
      documentWidth,
      viewportWidth: width,
      heading: rect("main h1, .page-canvas h1"),
      island: rect(".shop-mobile-shell"),
      primaryAction: rect(kind.startsWith("studio") ? ".studio-mobile-context" : ".shop-purchase-actions .shop-action"),
      task: rect(".studio-attention-primary"),
    };
  }, { kind: route.kind, mobile: viewport.mobile, width: viewport.width, height: viewport.height });
}

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of viewports) {
    for (const theme of themes) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: viewport.mobile,
        hasTouch: viewport.mobile,
        deviceScaleFactor: 1,
        colorScheme: theme,
        reducedMotion: "no-preference",
      });
      await context.addInitScript((preferredTheme) => {
        localStorage.setItem("justurban-wears.theme", preferredTheme);
      }, theme);

      for (const route of routes) {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push({ type: "pageerror", message: error.message }));
        page.on("console", (message) => {
          if (message.type() === "error") errors.push({ type: "console", message: message.text() });
        });
        const id = safeName(`${route.name}-${viewport.name}-${theme}`);
        let response;
        try {
          response = await page.goto(`${baseUrl}${route.path}`, {
            waitUntil: "domcontentloaded",
            timeout: 45_000,
          });
          await settle(page);
        } catch (error) {
          failures.push(`${id}: navigation failed: ${error.message}`);
          await page.close();
          continue;
        }

        await page.screenshot({ path: path.join(outputDir, `${id}-fold.png`), fullPage: false });
        await page.screenshot({ path: path.join(outputDir, `${id}-full.png`), fullPage: true });
        const geometry = await geometryAudit(page, route, viewport);
        const status = response?.status() ?? null;
        const run = {
          id,
          route: route.path,
          finalUrl: page.url(),
          status,
          viewport,
          theme,
          title: await page.title(),
          documentHeight: await page.evaluate(() => document.documentElement.scrollHeight),
          geometry,
          errors,
        };
        report.runs.push(run);
        if (!status || status >= 400) failures.push(`${id}: HTTP ${status}`);
        for (const finding of geometry.findings) failures.push(`${id}: ${finding}`);
        for (const error of errors) failures.push(`${id}: ${error.type}: ${error.message}`);
        await page.close();
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}

report.summary = {
  runs: report.runs.length,
  failures: failures.length,
  failedResponses: report.runs.filter((run) => !run.status || run.status >= 400).length,
  consoleErrors: report.runs.reduce((sum, run) => sum + run.errors.length, 0),
  geometryFindings: report.runs.reduce((sum, run) => sum + run.geometry.findings.length, 0),
};
report.failures = failures;
await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
await writeFile(
  path.join(outputDir, "summary.txt"),
  [
    `Runs: ${report.summary.runs}`,
    `Failures: ${report.summary.failures}`,
    `Failed responses: ${report.summary.failedResponses}`,
    `Console errors: ${report.summary.consoleErrors}`,
    `Geometry findings: ${report.summary.geometryFindings}`,
    ...failures.map((failure) => `- ${failure}`),
  ].join("\n") + "\n",
);
console.log(JSON.stringify(report.summary, null, 2));
if (failures.length) process.exitCode = 1;
