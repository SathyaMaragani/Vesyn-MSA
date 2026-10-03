// The phone app's own root layout. Next allows one root layout per top-level route group, so the
// assistant gets its own document - its own viewport, its own metadata, its own installable manifest -
// without the laptop app's 3D hero shell loading on a phone. The two share lib/ and nothing else.
import type { Metadata, Viewport } from "next";
import "@/styles/app.css";

export const metadata: Metadata = {
  title: "VESYN — AI Research Assistant",
  description: "A persistent-memory multi-agent research assistant for drug discovery: ask, watch the agents work, and see what VESYN remembers.",
  manifest: "/manifest.webmanifest",
  applicationName: "VESYN",
  appleWebApp: { capable: true, title: "VESYN", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#f5f9f8",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  // the status bar and the home indicator are drawn around, not under: the shell pads for both.
  viewportFit: "cover",
  // pinch-zoom is left alone on purpose - capping it is an accessibility regression
};

export default function MobileRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="nc-mobile-theme">
      <body className="font-ui">{children}</body>
    </html>
  );
}
