"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, apiErrorMessage } from "@/lib/api";

type SectionRow = { name: string; tierName: string; rows: number; cols: number };

export function AddSeatMap({ eventId, onCreated }: { eventId: string; onCreated: () => void }) {
  const [sections, setSections] = useState<SectionRow[]>([
    { name: "Front", tierName: "Front seats", rows: 4, cols: 10 },
  ]);
  const [busy, setBusy] = useState(false);

  function updateRow(index: number, patch: Partial<SectionRow>) {
    setSections((rows) =>
      rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const { error, response } = await api.POST("/api/events/{eventId}/seat-map", {
      params: { path: { eventId } },
      body: { sections },
    });
    setBusy(false);
    if (!response.ok) {
      toast.error(apiErrorMessage(error, "Could not create the seat map"));
      return;
    }
    toast.success("Seat map created — seats are live on the event page");
    onCreated();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add reserved seating</CardTitle>
        <CardDescription>
          Generate a seat map from a theater template. Each section becomes its own seat tier;
          buyers pick exact seats on a live map.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
          {sections.map((section, index) => (
            <div key={index} className="grid gap-3 sm:grid-cols-[1fr_1fr_5rem_5rem_auto]">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`section-name-${index}`} className="text-xs text-muted-foreground">
                  Section
                </Label>
                <Input
                  id={`section-name-${index}`}
                  required
                  maxLength={20}
                  value={section.name}
                  onChange={(event) => updateRow(index, { name: event.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`section-tier-${index}`} className="text-xs text-muted-foreground">
                  Tier name
                </Label>
                <Input
                  id={`section-tier-${index}`}
                  required
                  maxLength={80}
                  value={section.tierName}
                  onChange={(event) => updateRow(index, { tierName: event.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`section-rows-${index}`} className="text-xs text-muted-foreground">
                  Rows
                </Label>
                <Input
                  id={`section-rows-${index}`}
                  type="number"
                  required
                  min={1}
                  max={26}
                  value={section.rows}
                  onChange={(event) => updateRow(index, { rows: Number(event.target.value) })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`section-cols-${index}`} className="text-xs text-muted-foreground">
                  Seats/row
                </Label>
                <Input
                  id={`section-cols-${index}`}
                  type="number"
                  required
                  min={1}
                  max={30}
                  value={section.cols}
                  onChange={(event) => updateRow(index, { cols: Number(event.target.value) })}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-end"
                disabled={sections.length === 1}
                onClick={() =>
                  setSections((rows) => rows.filter((_, rowIndex) => rowIndex !== index))
                }
              >
                Remove
              </Button>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={sections.length >= 4}
              onClick={() =>
                setSections((rows) => [
                  ...rows,
                  { name: `Section ${rows.length + 1}`, tierName: "", rows: 6, cols: 12 },
                ])
              }
            >
              Add section
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Generating…" : "Generate seat map"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
