import type { Metadata, Viewport } from "next";
import "@fontsource-variable/bodoni-moda";
import "@fontsource-variable/manrope";
import { ServiceWorkerRegistration } from "../components/pwa/service-worker-registration";
import "./globals.css";
import "./foundation.css";

const siteUrl = new URL("https://justurbanwears.com");
const socialImage = new URL("/og.png", siteUrl).toString();

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light",
  themeColor: "#dd6042",
};

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
      { url: "/favicon.ico", sizes: "any" },
      { url: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [
      {
        url: "/brand/apple-touch-icon.png",
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
    <html lang="en-NG">
      <body className="antialiased">
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
