import type { Metadata } from "next";
import localFont from "next/font/local";
import { TRPCReactProvider } from "@/trpc/client";
import { cn } from "@/lib/utils";
import "./globals.css";

const satoshi = localFont({
  src: [
    { path: "./fonts/Satoshi-Regular.woff2", weight: "400" },
    { path: "./fonts/Satoshi-Medium.woff2", weight: "500" },
    { path: "./fonts/Satoshi-Bold.woff2", weight: "700" },
  ],
  variable: "--font-body",
  display: "swap",
  preload: true,
  adjustFontFallback: "Arial",
});

// Cabinet Grotesk paints the H1 (LCP candidate) on /, /pricing, and
// /vs/sintra. Bold-only preload because Extrabold is below the fold.
const cabinetGrotesk = localFont({
  src: [
    { path: "./fonts/CabinetGrotesk-Bold.woff2", weight: "700" },
    { path: "./fonts/CabinetGrotesk-Extrabold.woff2", weight: "800" },
  ],
  variable: "--font-display",
  display: "swap",
  preload: true,
  adjustFontFallback: "Arial",
});

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://beast.team";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Beast - AI employees for non-technical CEOs",
    template: "%s - Beast",
  },
  description:
    "AI marketing, sales, and support employees that produce real deliverables, learn your voice, and keep you accountable. Built for 10-50 person companies.",
  applicationName: "Beast",
  keywords: [
    "AI employees",
    "AI marketing manager",
    "AI SDR",
    "AI support agent",
    "AI for SMB",
    "Sintra alternative",
    "Lindy alternative",
  ],
  authors: [{ name: "Beast" }],
  openGraph: {
    type: "website",
    siteName: "Beast",
    url: SITE_URL,
    title: "Beast - AI employees for non-technical CEOs",
    description:
      "Hire Alex (Marketing), Jordan (Sales), Sam (Support). Real deliverables, learns your voice, weekly accountability.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Beast - AI employees for non-technical CEOs",
    description:
      "AI marketing, sales, and support that finishes work. Built for 10-50 person companies.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={cn(satoshi.variable, cabinetGrotesk.variable)}>
      <body className="font-(--font-body) text-foreground bg-background antialiased">
        <TRPCReactProvider>
          {children}
        </TRPCReactProvider>
      </body>
    </html>
  );
}
