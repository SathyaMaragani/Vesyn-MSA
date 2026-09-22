import type { Metadata } from "next";
import { Hero } from "@/components/hero/Hero";

export const metadata: Metadata = { title: "Vesyn — Chemistry, reasoned by machines" };

export default function Home() {
  return <Hero />;
}
