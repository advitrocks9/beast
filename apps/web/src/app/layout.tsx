import type { Metadata } from "next";
import localFont from "next/font/local";
import { TRPCReactProvider } from "@/trpc/client";
import { cn } from "@/lib/utils";
import "./globals.css";

const archivo = localFont({
  src: [
    { path: "./fonts/Archivo-Variable.woff2", style: "normal" },
    { path: "./fonts/Archivo-VariableItalic.woff2", style: "italic" },
  ],
  variable: "--font-archivo",
  display: "swap",
  preload: true,
  adjustFontFallback: "Arial",
});

const fragmentMono = localFont({
  src: [
    { path: "./fonts/FragmentMono-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/FragmentMono-Italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-fragment",
  display: "swap",
  preload: false,
});

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://beast.team";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Beast - an autonomous AI company you manage",
    template: "%s - Beast",
  },
  description:
    "Brief it, agent employees do the work in bounded tool loops, deliverables land in your review queue, and your edits become the company's standing operating rules.",
  applicationName: "Beast",
  authors: [{ name: "Beast" }],
  openGraph: {
    type: "website",
    siteName: "Beast",
    url: SITE_URL,
    title: "Beast - an autonomous AI company you manage",
    description:
      "Agent employees run briefs in bounded tool loops. You review; the company learns your standards permanently.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Beast - an autonomous AI company you manage",
    description:
      "Agent employees run briefs in bounded tool loops. You review; the company learns your standards permanently.",
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
    <html lang="en" className={cn(archivo.variable, fragmentMono.variable)}>
      <body className="font-sans text-foreground bg-background antialiased">
        {/*
        THESIS: An AI company rendered as its own corporate identity program; the interface is the
        company's standards manual in use. Refuses the neon agent-ops dashboard and the shadcn admin.
        OWN-WORLD: white coated stock, ink #131311, identity #E8420C, paper-gray panels, 1px ink
        rules, Archivo (wdth 122/800 display) + Fragment Mono spec voice, squared chips, flat depth.
        STORY: visitor watches a run stamp through stations, commissions a job, edits a deliverable,
        sees the company amend its own manual with a confidence-scored candidate rule.
        FIRST VIEWPORT: masthead over ink rule; press floor: roster rail, production board with live
        run ticket + queue, review tray + latest amendments; primary action "Commission a job".
        FORM: Swiss corporate identity program / standards manual; own list candidate 4/7; seed 1bd9927c.
        FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review,
        the verdict, and DESIGN.md.
        */}
        <TRPCReactProvider>
          {children}
        </TRPCReactProvider>
      </body>
    </html>
  );
}
