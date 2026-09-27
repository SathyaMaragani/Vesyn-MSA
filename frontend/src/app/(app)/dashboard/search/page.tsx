import type { Metadata } from "next";
import { SearchPage } from "@/components/dashboard/SearchPage";

export const metadata: Metadata = {
  title: "Vesyn — Search",
  description: "Ask Vesyn in plain words, or draw the structure, and the agent team investigates.",
};

export default function Page() {
  return <SearchPage />;
}
