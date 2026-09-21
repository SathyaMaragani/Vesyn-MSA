import type { Metadata, Viewport } from "next";
import { MotionRoot } from "@/components/motion/MotionRoot";
import "@/styles/app.css";

export const metadata: Metadata = {
  title: "NEOchems — AI Scientific Workforce",
  description: "A live multi-agent chemistry research facility: planning, validation and critique with every step auditable.",
};

export const viewport: Viewport = { themeColor: "#10110f", colorScheme: "dark" };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-ui">
        <MotionRoot>{children}</MotionRoot>
      </body>
    </html>
  );
}
