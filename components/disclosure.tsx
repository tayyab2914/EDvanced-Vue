"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** A button that reveals an inline form/panel. Used for "Add …" flows. */
export function Disclosure({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Button
        variant={open ? "secondary" : "primary"}
        size="sm"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "Cancel" : label}
      </Button>
      {open && <div className="mt-4">{children}</div>}
    </div>
  );
}
