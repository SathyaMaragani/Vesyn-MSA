"use client";

import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CurtainLoader } from "@/components/ui/CurtainLoader";
import "./globals.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <html lang="en">
      <head>
        <title>NeoChems | Multi-Agent Scientific Intelligence System</title>
        <meta
          name="description"
          content="A multi-agent scientific intelligence system for chemistry research, reasoning, planning, validation, and discovery."
        />
      </head>
      <body>
        <CurtainLoader />
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </body>
    </html>
  );
}
