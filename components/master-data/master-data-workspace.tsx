"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { MasterDataManager } from "@/components/master-data/master-data-manager";
import type {
  MasterRow,
  Option,
} from "@/components/master-data/master-item-form";
import type { ClientResourceDef } from "@/lib/master-data/registry";

export interface KindData {
  def: ClientResourceDef;
  rows: MasterRow[];
}

export function MasterDataWorkspace({
  kinds,
  options,
  relLabels,
  districtId,
  canManage,
  initialTab,
}: {
  kinds: KindData[];
  options: Record<string, Option[]>;
  relLabels: Record<string, Map<string, string>>;
  districtId: string;
  canManage: boolean;
  initialTab?: string;
}) {
  const [active, setActive] = useState(() =>
    kinds.some((k) => k.def.kind === initialTab)
      ? (initialTab as string)
      : kinds[0].def.kind,
  );

  const current = kinds.find((k) => k.def.kind === active) ?? kinds[0];

  return (
    <div className="space-y-6">
      <div className="border-b border-line">
        <div className="-mb-px flex gap-1 overflow-x-auto">
          {kinds.map((k) => (
            <button
              key={k.def.kind}
              type="button"
              onClick={() => setActive(k.def.kind)}
              aria-current={k.def.kind === active ? "page" : undefined}
              className={cn(
                "whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors",
                k.def.kind === active
                  ? "border-brand text-brand"
                  : "border-transparent text-muted-2 hover:border-line hover:text-ink-soft",
              )}
            >
              {k.def.title}
            </button>
          ))}
        </div>
      </div>

      {/* Remounts per tab so search/filters reset; all data is already in memory. */}
      <MasterDataManager
        key={active}
        def={current.def}
        districtId={districtId}
        rows={current.rows}
        options={options}
        relLabels={relLabels}
        canManage={canManage}
      />
    </div>
  );
}
