import type { Metadata, Viewport } from "next";
import "@fontsource-variable/bodoni-moda";
import "@fontsource-variable/manrope";
import { ServiceWorkerRegistration } from "../components/pwa/service-worker-registration";
import { ThemeProvider } from "../components/theme/theme-provider";
import { BRAND_ASSETS } from "../lib/brand/assets";
import "./globals.css";
import "./foundation.css";

const siteUrl = new URL("https://www.justurbanwears.com");
const socialImage = new URL("/og.png", siteUrl).toString();

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#dd6042" },
    { media: "(prefers-color-scheme: dark)", color: "#050303" },
  ],
};

const themeBootScript = `(() => {
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

export const metadata: Metadata = {
  metadataBase: siteUrl,
  applicationName: "justurban wears",
  title: {
    default: "justurban wears · Urban ladies’ wear",
    template: "%s · justurban wears",
  },
  description:
    "Urban ladies’ wear curated in Lagos, with a private operator studio behind every clearly described piece.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: BRAND_ASSETS.favicon.runtimeSvg, sizes: "any", type: "image/svg+xml" },
      { url: BRAND_ASSETS.favicon.runtimeIco, sizes: "16x16 32x32 48x48", type: "image/x-icon" },
      { url: BRAND_ASSETS.icon.runtimeApp192, sizes: "192x192", type: "image/png" },
      { url: BRAND_ASSETS.icon.runtimeApp512, sizes: "512x512", type: "image/png" },
    ],
    shortcut: {
      url: BRAND_ASSETS.favicon.runtimeIco,
      sizes: "16x16 32x32 48x48",
      type: "image/x-icon",
    },
    apple: [
      {
        url: BRAND_ASSETS.icon.runtimeAppleTouch,
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "justurban wears",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
  openGraph: {
    title: "justurban wears · Clothes with a second first impression.",
    description: "A Lagos edit of clearly described urban ladies’ wear.",
    siteName: "justurban wears",
    locale: "en_NG",
    images: [
      {
        url: socialImage,
        width: 1536,
        height: 1024,
        alt: "justurban wears urban ladies’ wear editorial image",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "justurban wears · Clothes with a second first impression.",
    description: "A Lagos edit of clearly described urban ladies’ wear.",
    images: [socialImage],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-NG" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <ServiceWorkerRegistration />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
