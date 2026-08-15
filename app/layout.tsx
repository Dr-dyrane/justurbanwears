import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import {
  BRAND_ASSET_VERSION,
  BRAND_ASSETS,
  withBrandAssetVersion,
} from "../lib/brand/assets";
import { ServiceWorkerRegistration } from "../components/pwa/service-worker-registration";
import { ThemeProvider } from "../components/theme/theme-provider";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const playfairDisplay = Playfair_Display({
  variable: "--font-playfair-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.justurbanwears.com"),
  title: {
    default: "justurban wears · Urban ladies’ wear",
    template: "%s · justurban wears",
  },
  description:
    "Urban ladies’ wear curated in Lagos, with a private operator studio behind every clearly described piece.",
  applicationName: "justurban wears",
  formatDetection: { telephone: false },
  openGraph: {
    title: "justurban wears · Clothes with a second first impression.",
    description: "One-off urban womenswear from Lulu’s wardrobe, ready to move through the city.",
    siteName: "JustUrbanWears",
    type: "website",
    locale: "en_NG",
    images: [
      {
        url: withBrandAssetVersion(BRAND_ASSETS.social.og),
        width: BRAND_ASSETS.social.width,
        height: BRAND_ASSETS.social.height,
        alt: "JustUrbanWears by Lulu illuminated boutique wall signage.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "justurban wears · Clothes with a second first impression.",
    description: "One-off urban womenswear from Lulu’s wardrobe, ready to move through the city.",
    images: [withBrandAssetVersion(BRAND_ASSETS.social.og)],
  },
  icons: {
    shortcut: withBrandAssetVersion(BRAND_ASSETS.favicon.runtimeIco),
    icon: [
      {
        url: withBrandAssetVersion(BRAND_ASSETS.favicon.svg),
        type: "image/svg+xml",
        sizes: "any",
      },
      {
        url: withBrandAssetVersion(BRAND_ASSETS.favicon.runtimeIco),
        type: "image/x-icon",
        sizes: "16x16 32x32 48x48",
      },
      {
        url: withBrandAssetVersion(BRAND_ASSETS.app.icon192),
        type: "image/png",
        sizes: "192x192",
      },
      {
        url: withBrandAssetVersion(BRAND_ASSETS.app.icon512),
        type: "image/png",
        sizes: "512x512",
      },
    ],
    apple: [
      {
        url: withBrandAssetVersion(BRAND_ASSETS.app.appleTouch),
        type: "image/png",
        sizes: "180x180",
      },
    ],
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "justurban wears",
  },
  other: {
    "x-brand-system": BRAND_ASSET_VERSION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#dd6042" },
    { media: "(prefers-color-scheme: dark)", color: "#050303" },
  ],
};

const themeScript = `(() => {
  try {
    const key = "justurban-wears.theme";
    const stored = localStorage.getItem(key);
    const preference = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
    const resolved = preference === "system"
      ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : preference;
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.dataset.themePreference = preference;
    root.style.colorScheme = resolved;
  } catch (_) {
    const resolved = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themePreference = "system";
    document.documentElement.style.colorScheme = resolved;
  }
})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-NG" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${playfairDisplay.variable} antialiased`}
      >
        <ThemeProvider>
          <ServiceWorkerRegistration />
          {children}
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
