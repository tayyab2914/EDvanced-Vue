import type { ReactNode } from "react";
import { NavLinks } from "@/components/nav-links";
import { MASTER_NAV } from "@/lib/master-data/registry";

export default function MasterDataLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="border-b border-line">
        <NavLinks items={MASTER_NAV} />
      </div>
      {children}
    </div>
  );
}
