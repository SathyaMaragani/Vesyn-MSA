import type { Metadata } from "next";
import { CurtainLoader } from "@/components/ui/CurtainLoader";
import "../globals.css";

// The legacy public landing page. Kept as-is and isolated from the workspace's
// design system: it has its own root layout and stylesheet.
export const metadata: Metadata = {
  title: "NeoChems | Multi-Agent Scientific Intelligence System",
  description:
    "A multi-agent scientific intelligence system for chemistry research, reasoning, planning, validation, and discovery.",
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <CurtainLoader />
        {children}
      </body>
    </html>
  );
}
