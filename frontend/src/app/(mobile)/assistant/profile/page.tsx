import type { Metadata } from "next";
import { Profile } from "@/components/mobile/Profile";

export const metadata: Metadata = {
  title: "VESYN — This device",
  description: "What this device is connected to, what it remembers, and what the platform allows.",
};

export default function Page() {
  return <Profile />;
}
