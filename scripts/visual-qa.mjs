import { chromium } from "playwright";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const axeSource = await readFile(require.resolve("axe-core/axe.min.js"), "utf8");
const baseUrl = process.env.VISUAL_QA_BASE_URL || "http://127.0.0.1:3000";
const outputDir = path.resolve("visual-qa");
await mkdir(outputDir, { recursive: true });

const routes = [
  { name: "site-home", path: "/", fold: true },
  { name: "shop-home", path: "/shop", fold: true },
  { name: "garment-dossier", path: "/shop/products/coral-drift-dress", fold: true },
  { name: "studio-home", path: "/studio", fold: true },
  { name: "studio-wardrobe", path: "/studio/wardrobe" },
  { name: "studio-models", path: "/studio/models" },
  { name: "studio-operations", path: "/studio/operations" },
  { name: "studio-orders", path: "/studio/orders" },
];

const viewports = [
  { name: "desktop", width: 1440, height: 1000, isMobile: false },
  { name: "mobile", width: 390, height: 844, isMobile: true },
];

const themes = ["light", "dark"];
const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  runs: [],
  summary: {},
};

function safeName(value) {
  return value.replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

async function settle(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(900);
  await page.evaluate(async () => {
    const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    for (let y = 0; y < height; y += Math.max(420, window.innerHeight * 0.72)) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 45));
    }
    window.scrollTo(0, 0);
    await new Promise((resolve) => setTimeout(resolve, 350));
  });
  await page.evaluate(() => document.fonts?.ready);
}

async function contrastAudit(page) {
  return page.evaluate(() => {
    const parse = (value) => {
      const match = value?.match(/rgba?\(([^)]+)\)/i);
      if (!match) return null;
      const parts = match[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
      if (parts.length < 3 || parts.slice(0, 3).some(Number.isNaN)) return null;
      return { r: parts[0], g: parts[1], b: parts[2], a: Number.isFinite(parts[3]) ? parts[3] : 1 };
    };
    const blend = (top, bottom) => {
      const alpha = top.a + bottom.a * (1 - top.a);
      if (!alpha) return { r: 0, g: 0, b: 0, a: 0 };
      return {
        r: (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / alpha,
        g: (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / alpha,
        b: (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / alpha,
        a: alpha,
      };
    };
    const luminance = ({ r, g, b }) => {
      const channel = (value) => {
        const normalized = value / 255;
        return normalized <= 0.03928
          ? normalized / 12.92
          : Math.pow((normalized + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const ratio = (a, b) => {
      const l1 = luminance(a);
      const l2 = luminance(b);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none"
        && style.visibility !== "hidden"
        && Number(style.opacity) > 0.02
        && rect.width > 1
        && rect.height > 1;
    };
    const selector = (element) => {
      const parts = [];
      let current = element;
      while (current && current !== document.body && parts.length < 5) {
        let part = current.tagName.toLowerCase();
        if (current.id) {
          part += `#${CSS.escape(current.id)}`;
          parts.unshift(part);
          break;
        }
        const className = typeof current.className === "string"
          ? current.className.split(/\s+/).filter(Boolean).slice(0, 2)
          : [];
        if (className.length) part += `.${className.map((name) => CSS.escape(name)).join(".")}`;
        parts.unshift(part);
        current = current.parentElement;
      }
      return parts.join(" > ");
    };
    const background = (element) => {
      let current = element;
      let result = { r: 255, g: 255, b: 255, a: 1 };
      let complex = false;
      const layers = [];
      while (current && current instanceof HTMLElement) {
        const style = getComputedStyle(current);
        if (style.backgroundImage && style.backgroundImage !== "none") complex = true;
        const parsed = parse(style.backgroundColor);
        if (parsed && parsed.a > 0) layers.push(parsed);
        current = current.parentElement;
      }
      for (let index = layers.length - 1; index >= 0; index -= 1) {
        result = blend(layers[index], result);
      }
      return { color: result, complex };
    };

    const candidates = Array.from(document.body.querySelectorAll("*"))
      .filter((element) => element instanceof HTMLElement)
      .filter(visible)
      .filter((element) => Array.from(element.childNodes).some(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
      ));

    const findings = [];
    for (const element of candidates) {
      const text = Array.from(element.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent?.trim())
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .slice(0, 120);
      if (!text) continue;
      const style = getComputedStyle(element);
      const foreground = parse(style.color);
      if (!foreground) continue;
      const bg = background(element);
      if (bg.complex) continue;
      const composedForeground = foreground.a < 1 ? blend(foreground, bg.color) : foreground;
      const contrast = ratio(composedForeground, bg.color);
      const fontSize = Number.parseFloat(style.fontSize) || 16;
      const fontWeight = Number.parseInt(style.fontWeight, 10) || 400;
      const large = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
      const threshold = large ? 3 : 4.5;
      if (contrast + 0.05 < threshold) {
        findings.push({
          selector: selector(element),
          text,
          contrast: Number(contrast.toFixed(2)),
          threshold,
          foreground: style.color,
          background: `rgb(${Math.round(bg.color.r)}, ${Math.round(bg.color.g)}, ${Math.round(bg.color.b)})`,
          fontSize,
          fontWeight,
        });
      }
    }
    return findings;
  });
}

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of viewports) {
    for (const theme of themes) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: viewport.isMobile,
        hasTouch: viewport.isMobile,
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
        const response = await page.goto(`${baseUrl}${route.path}`, {
          waitUntil: "domcontentloaded",
          timeout: 45_000,
        });
        await settle(page);

        const screenshotPath = path.join(outputDir, `${id}-full.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        if (route.fold) {
          await page.screenshot({ path: path.join(outputDir, `${id}-fold.png`), fullPage: false });
        }

        const contrast = await contrastAudit(page);
        await page.addScriptTag({ content: axeSource });
        const axe = await page.evaluate(async () => {
          const result = await globalThis.axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] },
            resultTypes: ["violations"],
          });
          return result.violations.map((violation) => ({
            id: violation.id,
            impact: violation.impact,
            help: violation.help,
            description: violation.description,
            nodes: violation.nodes.slice(0, 12).map((node) => ({
              target: node.target,
              html: node.html.slice(0, 300),
              summary: node.failureSummary,
            })),
          }));
        });

        report.runs.push({
          id,
          route: route.path,
          finalUrl: page.url(),
          status: response?.status() ?? null,
          viewport,
          theme,
          title: await page.title(),
          documentHeight: await page.evaluate(() => document.documentElement.scrollHeight),
          contrast,
          axe,
          errors,
        });
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
  failedResponses: report.runs.filter((run) => !run.status || run.status >= 400).length,
  consoleErrors: report.runs.reduce((sum, run) => sum + run.errors.length, 0),
  contrastFindings: report.runs.reduce((sum, run) => sum + run.contrast.length, 0),
  axeViolations: report.runs.reduce((sum, run) => sum + run.axe.length, 0),
};

await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
await writeFile(
  path.join(outputDir, "summary.txt"),
  [
    `Runs: ${report.summary.runs}`,
    `Failed responses: ${report.summary.failedResponses}`,
    `Console errors: ${report.summary.consoleErrors}`,
    `Contrast findings: ${report.summary.contrastFindings}`,
    `Axe violations: ${report.summary.axeViolations}`,
  ].join("\n") + "\n",
);

console.log(JSON.stringify(report.summary, null, 2));
if (report.summary.failedResponses > 0) process.exitCode = 1;
