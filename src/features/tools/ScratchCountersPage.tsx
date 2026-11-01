"use client";
/**
 * TOOL-012 `/tools/counters`: generic scratch counters (− value +, editable name, delete) for
 * anything the preset doesn't track. Device-level (kv `tools.scratch`); reuses the Mana & Storm
 * row UI.
 */
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button, IconButton, PageShell } from "@/components/ui";
import { t } from "@/lib/i18n";
import { CounterRow } from "./CounterRow";
import { useKvValue } from "./hooks";
import {
  SCRATCH_KEY,
  SCRATCH_LIMIT,
  SCRATCH_MAX,
  SCRATCH_MIN,
  SCRATCH_NAME_MAX,
  ScratchListSchema,
  addCounter,
  bumpCounter,
  clearCounters,
  removeCounter,
  renameCounter,
  type ScratchCounter,
} from "./scratch";

const EMPTY: ScratchCounter[] = [];

export function ScratchCountersPage() {
  const router = useRouter();
  const list = useKvValue(SCRATCH_KEY, EMPTY, ScratchListSchema);
  const counters = list.value;

  return (
    <PageShell title={t("tools.counters.title")} backHref="/tools" testId="counters-page">
      <div
        data-testid="counters-root"
        data-loaded={list.loaded ? "true" : "false"}
        data-saved={list.saved ? "true" : "false"}
      >
        {counters.length === 0 ? (
          <p className="mt-6 text-center text-fg-muted" data-testid="counters-empty">
            {t("tools.counters.empty")}
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {counters.map((c, i) => {
              const name = c.name.trim() || t("tools.counters.newName", { n: i + 1 });
              return (
                <CounterRow
                  key={c.id}
                  name={name}
                  label={
                    <input
                      type="text"
                      value={c.name}
                      maxLength={SCRATCH_NAME_MAX}
                      aria-label={t("tools.counters.name", { n: i + 1 })}
                      placeholder={t("tools.counters.newName", { n: i + 1 })}
                      data-testid={`counter-${i}-name`}
                      onChange={(e) => list.set((l) => renameCounter(l, c.id, e.target.value))}
                      className="min-h-12 w-full min-w-0 rounded-xl bg-surface-2 px-3 text-base text-fg placeholder:text-fg-subtle focus-visible:outline-2 focus-visible:outline-accent"
                    />
                  }
                  value={c.value}
                  onDelta={(d) => list.set((l) => bumpCounter(l, c.id, d))}
                  min={SCRATCH_MIN}
                  max={SCRATCH_MAX}
                  rowTestId={`counter-row-${i}`}
                  testIdBase={`counter-${i}`}
                  minusLabel={t("tools.counters.minus", { name })}
                  plusLabel={t("tools.counters.plus", { name })}
                  trailing={
                    <IconButton
                      label={t("tools.counters.delete", { name })}
                      onClick={() => list.set((l) => removeCounter(l, c.id))}
                      data-testid={`counter-${i}-delete`}
                    >
                      <Trash2 size={20} aria-hidden />
                    </IconButton>
                  }
                />
              );
            })}
          </ul>
        )}
        <Button
          block
          size="lg"
          className="mt-4"
          icon={<Plus aria-hidden />}
          disabled={!list.loaded || counters.length >= SCRATCH_LIMIT}
          onClick={() =>
            list.set((l) => addCounter(l, t("tools.counters.newName", { n: l.length + 1 })))
          }
          data-testid="counters-add"
        >
          {t("tools.counters.add")}
        </Button>
        <p className="mt-3 text-sm text-fg-muted">{t("tools.counters.note")}</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button
            variant="danger"
            size="lg"
            disabled={counters.length === 0}
            onClick={() => list.set(clearCounters)}
            data-testid="counters-clear"
          >
            {t("tools.counters.clear")}
          </Button>
          <Button
            size="lg"
            data-testid="counters-close"
            onClick={() => {
              if (window.history.length > 1) router.back();
              else router.push("/tools");
            }}
          >
            {t("tools.counters.close")}
          </Button>
        </div>
      </div>
    </PageShell>
  );
}
