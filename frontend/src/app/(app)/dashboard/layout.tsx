import type { Metadata } from "next";
import { DashboardFrame } from "@/components/dashboard/DashboardFrame";
import { NeoProvider } from "@/lib/store/NeoProvider";

export const metadata: Metadata = {
  title: "NEOchems — Dashboard",
  description: "What is happening across NeoChems right now: the current run, its agents, its routes and the health of the system.",
};

// A separate page with its own frame. It shares only the data layer with /lab (NeoProvider); it renders none of the lab.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <NeoProvider>
      <DashboardFrame>{children}</DashboardFrame>
    </NeoProvider>
  );
}
