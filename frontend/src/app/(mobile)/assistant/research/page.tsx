import type { Metadata } from "next";
import { Research } from "@/components/mobile/Research";

export const metadata: Metadata = {
  title: "VESYN — Research",
  description: "The conversation: ask, watch the agent team work, and read why it decided what it did.",
};

export default function Page() {
  return <Research />;
}
