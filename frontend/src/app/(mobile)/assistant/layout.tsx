// The assistant's shell. NeoProvider is the same data layer the laptop app uses: health polling, the
// run's WebSocket, the project list, and the recorded run it falls back to when the API is unreachable.
import { MobileShell } from "@/components/mobile/MobileShell";
import { ServiceWorker } from "@/components/mobile/ServiceWorker";
import { NeoProvider } from "@/lib/store/NeoProvider";

export default function AssistantLayout({ children }: { children: React.ReactNode }) {
  return (
    <NeoProvider mobile>
      <MobileShell>{children}</MobileShell>
      <ServiceWorker />
    </NeoProvider>
  );
}
