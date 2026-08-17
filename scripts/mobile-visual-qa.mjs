import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.VISUAL_QA_BASE_URL || "http://127.0.0.1:3000";
const out = path.resolve("mobile-visual-qa");
await mkdir(out, { recursive: true });

const routes = [
  { name: "shop", path: "/shop" },
  { name: "product", path: "/shop/products/coral-drift-dress" },
  { name: "studio-home", path: "/studio?scenario=lifecycle" },
  { name: "studio-wardrobe", path: "/studio/wardrobe?scenario=lifecycle" },
  { name: "studio-piece", path: "/studio/wardrobe/scenario-garment-live?scenario=lifecycle" },
  { name: "studio-ops", path: "/studio/operations?scenario=lifecycle" },
];
const viewports = [
  { name: "iphone", width: 390, height: 844 },
  { name: "narrow", width: 360, height: 800 },
];
const themes = ["light", "dark"];
const report = [];

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of viewports) {
    for (const theme of themes) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 1,
        colorScheme: theme,
      });
      await context.addInitScript((value) => {
        localStorage.setItem("justurban-wears.theme", value);
      }, theme);
      for (const route of routes) {
        const page = await context.newPage();
        const consoleErrors = [];
        page.on("pageerror", (error) => consoleErrors.push(error.message));
        page.on("console", (message) => {
          if (message.type() === "error") consoleErrors.push(message.text());
        });
        const response = await page.goto(`${baseUrl}${route.path}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
        await page.waitForTimeout(1400);
        await page.evaluate(() => document.fonts?.ready);
        const id = `${route.name}-${viewport.name}-${theme}`;
        await page.screenshot({ path: path.join(out, `${id}-fold.png`), fullPage: false });
        await page.screenshot({ path: path.join(out, `${id}-full.png`), fullPage: true });
        const metrics = await page.evaluate(() => {
          const rect = (selector) => {
            const element = document.querySelector(selector);
            if (!(element instanceof HTMLElement)) return null;
            const value = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return {
              top: Math.round(value.top), bottom: Math.round(value.bottom), left: Math.round(value.left), right: Math.round(value.right),
              width: Math.round(value.width), height: Math.round(value.height), display: style.display, visibility: style.visibility,
              text: element.innerText.trim().replace(/\s+/g, " ").slice(0, 140),
              scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
            };
          };
          const visible = (selector) => Array.from(document.querySelectorAll(selector)).filter((element) => {
            if (!(element instanceof HTMLElement)) return false;
            const style = getComputedStyle(element);
            const value = element.getBoundingClientRect();
            return style.display !== "none" && style.visibility !== "hidden" && value.width > 1 && value.height > 1;
          }).length;
          return {
            url: location.href,
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: document.documentElement.clientWidth,
            bodyHeight: document.documentElement.scrollHeight,
            h1: rect("h1"),
            dock: rect(".shop-mobile-shell"),
            contextAction: rect(".shop-mobile-context"),
            visibleStudioFabs: visible(".studio-mobile-fab"),
            task: rect(".studio-attention-primary"),
            wardrobeFilters: rect(".studio-filter-bar"),
            segmented: rect(".studio-segmented-view"),
            productMedia: rect(".shop-detail-stage"),
            productFacts: rect(".shop-detail-facts"),
            productBuy: rect(".shop-purchase-actions"),
          };
        });
        report.push({ id, status: response?.status() ?? null, title: await page.title(), consoleErrors, metrics });
        await page.close();
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}
await writeFile(path.join(out, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ runs: report.length, responses: report.filter((r) => !r.status || r.status >= 400).length, overflow: report.filter((r) => r.metrics.documentWidth > r.metrics.viewportWidth + 1).length, consoleErrors: report.reduce((n, r) => n + r.consoleErrors.length, 0) }, null, 2));
