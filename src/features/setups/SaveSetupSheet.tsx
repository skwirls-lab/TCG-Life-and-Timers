"use client";
/**
 * "Save as preset" (saved setups): name the snapshot, then save it as a new preset or, when the
 * setup or game came from a preset, update that one. Used by the setup wizard and (lazily) by the
 * in-game center menu. Saving a new preset on the free plan past FREE_LIMITS.savedSetups opens
 * the paywall (only while the paywall is enabled; useProGate behaviour).
 */
import { useId, useState } from "react";
import { Button, Sheet, useSnackbar } from "@/components/ui";
import { openPaywall } from "@/lib/entitlements/paywall";
import { limit } from "@/lib/entitlements/policy";
import { useEntitlements } from "@/lib/entitlements/store";
import { t } from "@/lib/i18n";
import {
  MAX_SETUP_NAME,
  cleanSetupName,
  countSetups,
  createSetup,
  updateSetup,
  type SavedSetup,
  type SetupDraft,
} from "@/lib/setups";

/** May one more preset be created? Opens the paywall when not. */
export async function canCreateSetup(): Promise<boolean> {
  const count = await countSetups().catch(() => 0);
  if (count < limit(useEntitlements.getState(), "savedSetups")) return true;
  openPaywall("savedSetupsUnlimited");
  return false;
}

export interface SaveSetupSheetProps {
  open: boolean;
  onClose: () => void;
  draft: SetupDraft | null;
  /** Suggested name for a new preset ("<first names> · <game type>"). */
  suggestion: string;
  /** The preset this setup or game came from: offers "Update '<name>'". */
  source?: SavedSetup | null;
  onSaved?: (setup: SavedSetup, mode: "new" | "update") => void;
}

export function SaveSetupSheet(props: SaveSetupSheetProps) {
  if (!props.open) return null;
  // Keyed so the name starts from the suggestion (or the source's name) each time it opens.
  return <SaveSetupForm key={props.source?.id ?? "new"} {...props} />;
}

function SaveSetupForm({ onClose, draft, suggestion, source, onSaved }: SaveSetupSheetProps) {
  const inputId = useId();
  const [name, setName] = useState(() => source?.name ?? suggestion);
  const [busy, setBusy] = useState(false);
  const show = useSnackbar((s) => s.show);

  const clean = cleanSetupName(name);

  const save = async (mode: "new" | "update") => {
    if (!draft || busy || !clean) return;
    setBusy(true);
    try {
      if (mode === "new" && !(await countAllows())) return;
      const saved =
        mode === "update" && source
          ? await updateSetup(source.id, draft, { name: clean })
          : await createSetup(clean, draft);
      show({
        message: t(mode === "update" ? "setups.save.updated" : "setups.save.saved", {
          name: saved.name,
        }),
      });
      onSaved?.(saved, mode);
      onClose();
    } catch (e) {
      console.warn("[setups] save failed", e);
      show({ message: t("setups.save.failed") });
    } finally {
      setBusy(false);
    }
  };

  /** Close first, then open the paywall (one overlay swap, D-043). */
  const countAllows = async () => {
    const count = await countSetups().catch(() => 0);
    if (count < limit(useEntitlements.getState(), "savedSetups")) return true;
    onClose();
    openPaywall("savedSetupsUnlimited");
    return false;
  };

  return (
    <Sheet open onClose={onClose} title={t("setups.save.action")} testId="setup-save-sheet">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save(source ? "update" : "new");
        }}
      >
        <p className="text-sm text-fg-muted">{t("setups.save.hint")}</p>
        <div className="flex flex-col gap-1">
          <label htmlFor={inputId} className="text-sm font-medium">
            {t("setups.save.name")}
          </label>
          <input
            id={inputId}
            type="text"
            value={name}
            maxLength={MAX_SETUP_NAME}
            autoComplete="off"
            data-testid="setup-save-name"
            onChange={(e) => setName(e.target.value)}
            className="min-h-12 w-full rounded-xl bg-surface-2 px-3 text-lg text-fg placeholder:text-fg-subtle focus-visible:outline-2 focus-visible:outline-accent"
          />
        </div>
        <div className="flex flex-col gap-2">
          {source && (
            <Button
              type="submit"
              variant="primary"
              size="lg"
              block
              disabled={busy || !clean}
              data-testid="setup-save-update"
            >
              {t("setups.save.update", { name: source.name })}
            </Button>
          )}
          <Button
            type={source ? "button" : "submit"}
            variant={source ? "secondary" : "primary"}
            size="lg"
            block
            disabled={busy || !clean}
            data-testid="setup-save-new"
            onClick={source ? () => void save("new") : undefined}
          >
            {source ? t("setups.save.asNew") : t("common.save")}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
