import type { Metadata } from "next";
import { LabFrame } from "@/components/lab/LabFrame";
import { NeoProvider } from "@/lib/store/NeoProvider";

export const metadata: Metadata = {
  title: "NEOchems — Live Laboratory",
  description: "The live NeoChems multi-agent workforce, driven by the backend event stream.",
};

export default function LabLayout({ children }: { children: React.ReactNode }) {
  return (
    <NeoProvider>
      <LabFrame>{children}</LabFrame>
    </NeoProvider>
  );
}
