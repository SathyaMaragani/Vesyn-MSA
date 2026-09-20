"use client";

import React from "react";
import { RuntimeProvider } from "@/lib/runtime/RuntimeContext";
import { LabShell } from "@/components/lab/LabShell";

export default function LabPage() {
  return (
    <RuntimeProvider>
      <LabShell />
    </RuntimeProvider>
  );
}
