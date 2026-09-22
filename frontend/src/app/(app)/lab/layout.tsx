import type { Metadata } from "next";
import { LabFrame } from "@/components/lab/LabFrame";
import { NeoProvider } from "@/lib/store/NeoProvider";

export const metadata: Metadata = {
  title: "Vesyn — Live Laboratory",
  description: "The live Vesyn multi-agent workforce, driven by the backend event stream.",
};

export default function LabLayout({ children }: { children: React.ReactNode }) {
  return (
    <NeoProvider>
      <LabFrame>{children}</LabFrame>
    </NeoProvider>
  );
}
