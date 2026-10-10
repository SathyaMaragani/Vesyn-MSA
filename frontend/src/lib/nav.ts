// The places in Vesyn, in the order both top bars show them (the dashboard's and the lab's).
export const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/search", label: "Search" },
  { href: "/lab/routes", label: "Synthesis" },
  { href: "/lab/chemistry", label: "Chemistry" },
  { href: "/lab/evidence", label: "Evidence" },
  { href: "/dashboard/documents", label: "Documents" },
  { href: "/lab/intelligence", label: "Intelligence" },
  { href: "/lab", label: "Lab" },
  { href: "/lab/audit", label: "Audit" },
] as const;

/** Exact match for the two roots that have children ("/dashboard", "/lab"); prefix match for the rest. */
export const isActive = (href: string, pathname: string): boolean =>
  href === "/dashboard" || href === "/lab" ? pathname === href : pathname.startsWith(href);
