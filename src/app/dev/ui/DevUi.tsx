"use client";
import { Heart, Settings } from "lucide-react";
import { useState } from "react";
import {
  Button,
  ChipRow,
  HoldButton,
  IconButton,
  Keypad,
  ListRow,
  LockBadge,
  PageShell,
  RotatedContainer,
  SectionHeader,
  Segmented,
  Sheet,
  Stepper,
  Tabs,
  Toggle,
  useSnackbar,
} from "@/components/ui";
import { t } from "@/lib/i18n";
import type { Rotation } from "@/lib/ui/rotation";

export function DevUi() {
  const [on, setOn] = useState(true);
  const [players, setPlayers] = useState(4);
  const [seg, setSeg] = useState<"a" | "b">("a");
  const [tab, setTab] = useState<"x" | "y" | "z">("x");
  const [n, setN] = useState(3);
  const [sheet, setSheet] = useState<Rotation | null>(null);
  const show = useSnackbar((s) => s.show);
  return (
    <PageShell title={t("devui.title")} testId="dev-ui">
      <SectionHeader title="Controls" />
      <ListRow
        icon={<Heart />}
        title="Toggle"
        subtitle="Switch control"
        control={<Toggle checked={on} onChange={setOn} label="Demo toggle" />}
      />
      <ListRow
        title="Players"
        control={
          <ChipRow
            label="Players"
            value={players}
            onChange={setPlayers}
            options={[2, 3, 4, 5, 6].map((v) => ({ value: v }))}
          />
        }
      />
      <Segmented
        label="Segmented"
        value={seg}
        onChange={setSeg}
        options={[
          { value: "a", label: "Current Game" },
          { value: "b", label: "Past Games" },
        ]}
      />
      <div className="mt-4">
        <Tabs
          label="Tabs"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "x", label: "Games" },
            { value: "y", label: "Players" },
            { value: "z", label: "Insights" },
          ]}
        />
      </div>
      <ListRow
        title="Stepper"
        control={<Stepper label="Count" value={n} onChange={setN} min={0} max={10} />}
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary">Primary</Button>
        <Button>Secondary</Button>
        <Button variant="danger">Danger</Button>
        <IconButton label="Settings">
          <Settings />
        </IconButton>
        <LockBadge />
        <HoldButton
          label="Hold to reset"
          onConfirm={() => show({ message: "Reset confirmed" })}
          className="min-h-12 rounded-xl bg-surface-2 px-4"
        >
          Hold to reset
        </HoldButton>
        <Button onClick={() => show({ message: "Passed to Josh", actionLabel: t("common.undo") })}>
          Snackbar
        </Button>
      </div>
      <SectionHeader title="Rotation" />
      <div className="grid grid-cols-2 gap-2">
        {([0, 90, 180, 270] as Rotation[]).map((r) => (
          <RotatedContainer
            key={r}
            rotation={r}
            className="h-32 rounded-2xl bg-surface-2"
            testId={`rot-${r}`}
          >
            <button
              type="button"
              className="flex size-full items-center justify-center text-4xl tabular"
              onClick={() => setSheet(r)}
            >
              {r}°
            </button>
          </RotatedContainer>
        ))}
      </div>
      <SectionHeader title="Keypad" />
      <Keypad mode="calc" onSubmit={(r) => show({ message: `${r.op} ${r.value}` })} />
      <Sheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        rotation={sheet ?? 0}
        title="Rotated sheet"
        testId="dev-sheet"
      >
        <p className="py-4">This sheet faces the {sheet}° seat.</p>
      </Sheet>
    </PageShell>
  );
}
