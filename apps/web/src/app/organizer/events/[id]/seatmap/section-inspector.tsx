"use client";

import { Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { ConsolePanel } from "@/components/console/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MAX_SECTION_COLS,
  MAX_SECTION_ROWS,
  type Section,
} from "@/lib/use-seat-map-draft";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function SectionInspector({
  selected,
  onPatch,
  onCommit,
  onDelete,
}: {
  selected: Section | null;
  onPatch: (patch: Partial<Section>, save: boolean) => void;
  onCommit: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <ConsolePanel label={selected ? "Section" : "Inspector"}>
      {selected ? (
        <div className="flex flex-col gap-4">
          <Field label="Name">
            <Input
              value={selected.name}
              onChange={(event) => onPatch({ name: event.target.value }, false)}
              onBlur={onCommit}
            />
          </Field>
          <Field label="Tier">
            <Input
              value={selected.tierName}
              onChange={(event) =>
                onPatch({ tierName: event.target.value }, false)
              }
              onBlur={onCommit}
            />
          </Field>
          <Field label="Price (฿)">
            <Input
              type="number"
              min={0}
              value={selected.priceSatang / 100}
              className="font-mono tabular-nums"
              onChange={(event) =>
                onPatch(
                  { priceSatang: Math.round(Number(event.target.value) * 100) },
                  true,
                )
              }
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rows">
              <Input
                type="number"
                min={1}
                max={MAX_SECTION_ROWS}
                value={selected.rows}
                className="font-mono tabular-nums"
                onChange={(event) =>
                  onPatch(
                    {
                      rows: Math.min(
                        MAX_SECTION_ROWS,
                        Math.max(1, Number(event.target.value)),
                      ),
                    },
                    true,
                  )
                }
              />
            </Field>
            <Field label="Cols">
              <Input
                type="number"
                min={1}
                max={MAX_SECTION_COLS}
                value={selected.cols}
                className="font-mono tabular-nums"
                onChange={(event) =>
                  onPatch(
                    {
                      cols: Math.min(
                        MAX_SECTION_COLS,
                        Math.max(1, Number(event.target.value)),
                      ),
                    },
                    true,
                  )
                }
              />
            </Field>
          </div>
          <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {selected.rows * selected.cols} seats
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDelete(selected.id)}
          >
            <Trash2 className="size-4" />
            Remove section
          </Button>
        </div>
      ) : (
        <p className="py-6 text-center font-mono text-xs text-muted-foreground">
          Select a section to edit it.
        </p>
      )}
    </ConsolePanel>
  );
}
