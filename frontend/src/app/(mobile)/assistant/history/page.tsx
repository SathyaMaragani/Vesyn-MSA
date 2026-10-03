import type { Metadata } from "next";
import { History } from "@/components/mobile/History";

export const metadata: Metadata = {
  title: "VESYN — History",
  description: "Every investigation, newest first. Reopen one to read it again or carry it on.",
};

export default function Page() {
  return <History />;
}
