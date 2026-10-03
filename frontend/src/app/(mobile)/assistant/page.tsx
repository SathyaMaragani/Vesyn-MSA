import type { Metadata } from "next";
import { Home } from "@/components/mobile/Home";

export const metadata: Metadata = {
  title: "VESYN — AI Research Assistant",
  description: "Ask VESYN a research question, or carry on an earlier investigation.",
};

export default function Page() {
  return <Home />;
}
