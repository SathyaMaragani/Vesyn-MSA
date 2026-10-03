import type { Metadata } from "next";
import { MemoryScreen } from "@/components/mobile/MemoryScreen";

export const metadata: Metadata = {
  title: "VESYN — Memory",
  description: "What VESYN remembers from earlier investigations, and what that memory changed.",
};

export default function Page() {
  return <MemoryScreen />;
}
