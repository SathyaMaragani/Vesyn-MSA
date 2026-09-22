"use client";

import React from "react";
import { SiteCursor } from "./SiteCursor";
import { SmoothScroll } from "./SmoothScroll";
import { TransitionProvider } from "./TransitionProvider";

/**
 * The site's motion language, mounted once at the root of the Vesyn app:
 * shader page transitions, the site cursor, inertial scroll for tagged containers.
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
