"use client";

import React from "react";
import { SiteCursor } from "./SiteCursor";
import { SmoothScroll } from "./SmoothScroll";
import { TransitionProvider } from "./TransitionProvider";

/**
 * The site's motion language, mounted once at the root of the NEOchems app:
 * shader page transitions, the site cursor, inertial scroll for tagged containers.
 * (The legacy /landing page has its own root layout and design; it is left alone.)
 */
export function MotionRoot({ children }: { children: React.ReactNode }) {
  return (
    <TransitionProvider>
      {children}
      <SiteCursor />
      <SmoothScroll />
    </TransitionProvider>
  );
}
