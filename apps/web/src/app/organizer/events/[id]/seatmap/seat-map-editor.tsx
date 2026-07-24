"use client";

import { useSeatMapDraft } from "@/lib/use-seat-map-draft";
import { EditorCanvas } from "./editor-canvas";
import { SectionInspector } from "./section-inspector";

export function SeatMapEditor({
  eventId,
  onSaved,
}: {
  eventId: string;
  onSaved: () => void;
}) {
  const draft = useSeatMapDraft(eventId, onSaved);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <EditorCanvas
        sections={draft.sections}
        selectedId={draft.selectedId}
        svgRef={draft.svgRef}
        canUndo={draft.canUndo}
        canRedo={draft.canRedo}
        saving={draft.saving}
        onAddSection={draft.addSection}
        onUndo={draft.undo}
        onRedo={draft.redo}
        onPublish={() => void draft.publish()}
        onSelect={draft.setSelectedId}
        onSectionPointerDown={draft.onSectionPointerDown}
        onSectionKeyDown={draft.onSectionKeyDown}
      />

      <SectionInspector
        selected={draft.selected}
        onPatch={draft.patchSelected}
        onCommit={draft.commitCurrent}
        onDelete={draft.deleteSection}
      />
    </div>
  );
}
