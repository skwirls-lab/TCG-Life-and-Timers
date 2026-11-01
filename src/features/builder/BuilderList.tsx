"use client";
/**
 * /builder (T3.6): the user's custom presets (edit, duplicate, export, delete), "New preset",
 * "Duplicate a built-in" (PRE-002) and "Import JSON" (CUS-007). Free tier: `useLimit
 * ('customPresets')` (§17.2) gates creating more, with the Pro lock and a paywall placeholder.
 */
import { Copy, Download, FileUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useState, type ReactNode } from "react";
import { GameIcon } from "@/components/icons/GameIcon";
import {
  Button,
  IconButton,
  LockBadge,
  PageShell,
  SectionHeader,
  Sheet,
  useSnackbar,
} from "@/components/ui";
import type { Preset } from "@/engine";
import {
  deleteCustomPreset,
  duplicateBuiltIn,
  duplicateCustomPreset,
  exportPresetBlob,
  importPresetJson,
  listCustomPresets,
  presetFileName,
  saveCustomPreset,
} from "@/lib/customPresets";
import { useLimit } from "@/lib/entitlements/store";
import { t, tp } from "@/lib/i18n";
import { listBuiltInPresets } from "@/presets";
import { afterOverlayClose } from "@/features/settings/afterOverlayClose";
import { groupPresets } from "@/features/setup/PresetList";
import { inputCls } from "./fields";
import { canCreateMore } from "./model";
import { LimitNotice } from "./LimitNotice";
// PAY (T7.1/T7.3): over-limit taps open the paywall; share links + "My share links".
import { openPaywall } from "@/lib/entitlements/paywall";
import { MyShares, ShareAction } from "@/features/paywall/ShareControls";

function download(p: Preset): string {
  const file = presetFileName(p);
  const url = URL.createObjectURL(exportPresetBlob(p));
  const a = document.createElement("a");
  a.href = url;
  a.download = file;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return file;
}

export function BuilderList() {
  const router = useRouter();
  const limit = useLimit("customPresets");
  const show = useSnackbar((s) => s.show);
  const [presets, setPresets] = useState<Preset[] | null>(null);
  const [dupOpen, setDupOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [deleting, setDeleting] = useState<Preset | null>(null);

  const refresh = useCallback(async () => {
    setPresets(await listCustomPresets().catch(() => []));
  }, []);
  useEffect(() => {
    let cancelled = false;
    void listCustomPresets()
      .catch(() => [])
      .then((list) => {
        if (!cancelled) setPresets(list);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const count = presets?.length ?? 0;
  const canCreate = presets !== null && canCreateMore(count, limit);
  const edit = (id: string) => router.push(`/builder/edit?id=${encodeURIComponent(id)}`);
  /** PAY (T7.1): run `fn` when one more preset fits the plan, otherwise open the paywall. */
  const gated = (fn: () => void) => () =>
    canCreate ? fn() : presets !== null && openPaywall("customPresetsUnlimited");

  return (
    <PageShell title={t("builder.title")} backHref="/" testId="builder-list">
      <p className="pt-4 text-fg-muted">{t("builder.intro")}</p>
      {presets !== null && !canCreate && <LimitNotice limit={limit} />}

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Button
          variant="primary"
          icon={<Plus size={20} aria-hidden />}
          disabled={presets === null}
          onClick={gated(() => router.push("/builder/edit"))}
          data-testid="builder-new"
        >
          {t("builder.new")}
          {!canCreate && presets !== null && <LockBadge />}
        </Button>
        <Button
          icon={<Copy size={20} aria-hidden />}
          disabled={presets === null}
          onClick={gated(() => setDupOpen(true))}
          data-testid="builder-duplicate-open"
        >
          {t("builder.duplicateBuiltIn")}
        </Button>
        <Button
          icon={<FileUp size={20} aria-hidden />}
          disabled={presets === null}
          onClick={gated(() => setImportOpen(true))}
          data-testid="builder-import-open"
        >
          {t("builder.import")}
        </Button>
      </div>

      <SectionHeader title={t("builder.mine")} />
      {presets === null ? (
        <p className="text-fg-muted">{t("builder.loading")}</p>
      ) : presets.length === 0 ? (
        <p className="text-fg-muted" data-testid="builder-empty">
          {t("builder.empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="builder-presets">
          {presets.map((p, i) => (
            <PresetRow
              key={p.id}
              preset={p}
              index={i}
              canCopy={canCreate}
              share={<ShareAction preset={p} index={i} />}
              onEdit={() => edit(p.id)}
              onCopy={async () => {
                if (!canCreate) return openPaywall("customPresetsUnlimited");
                const copy = await duplicateCustomPreset(p.id);
                show({ message: t("builder.duplicated", { name: copy.name }) });
                await refresh();
              }}
              onExport={() => show({ message: t("builder.exported", { file: download(p) }) })}
              onDelete={() => setDeleting(p)}
            />
          ))}
        </ul>
      )}

      <MyShares />

      <Sheet
        open={dupOpen}
        onClose={() => setDupOpen(false)}
        title={t("builder.duplicateTitle")}
        testId="builder-duplicate-sheet"
      >
        <div className="flex flex-col gap-4">
          {groupPresets(listBuiltInPresets()).map((g) => (
            <section key={g.game} aria-label={g.game} className="flex flex-col gap-2">
              <h3 className="text-sm uppercase tracking-wide text-fg-muted">{g.game}</h3>
              {g.presets.map((bp) => (
                <button
                  key={bp.id}
                  type="button"
                  data-testid={`builder-dup-${bp.id}`}
                  onClick={async () => {
                    const copy = await duplicateBuiltIn(bp.id);
                    setDupOpen(false);
                    show({ message: t("builder.duplicated", { name: copy.name }) });
                    afterOverlayClose(() => edit(copy.id));
                  }}
                  className="flex min-h-14 w-full flex-col rounded-2xl bg-surface-2 px-4 py-2 text-left hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <span className="text-lg">{bp.name}</span>
                  {bp.format && <span className="text-sm text-fg-muted">{bp.format}</span>}
                </button>
              ))}
            </section>
          ))}
        </div>
      </Sheet>

      <ImportSheet
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={async (p) => {
          setImportOpen(false);
          show({ message: t("builder.imported", { name: p.name }) });
          await refresh();
        }}
      />

      <Sheet
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={deleting ? t("builder.deleteTitle", { name: deleting.name }) : undefined}
        testId="builder-delete-dialog"
      >
        <p className="pb-4 text-fg-muted">{t("builder.deleteBody")}</p>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => setDeleting(null)}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            data-testid="builder-delete-confirm"
            onClick={async () => {
              if (!deleting) return;
              const name = deleting.name;
              await deleteCustomPreset(deleting.id);
              setDeleting(null);
              show({ message: t("builder.deleted", { name }) });
              await refresh();
            }}
          >
            {t("common.delete")}
          </Button>
        </div>
      </Sheet>
    </PageShell>
  );
}

function PresetRow({
  preset: p,
  index,
  canCopy,
  share,
  onEdit,
  onCopy,
  onExport,
  onDelete,
}: {
  preset: Preset;
  index: number;
  canCopy: boolean;
  share?: ReactNode;
  onEdit: () => void;
  onCopy: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const primary = p.counters.find((c) => c.isPrimary);
  return (
    <li
      data-testid={`builder-preset-${index}`}
      data-preset-id={p.id}
      className="flex flex-col gap-1 rounded-2xl bg-surface p-2"
    >
      <button
        type="button"
        onClick={onEdit}
        className="flex min-h-14 items-center gap-3 rounded-xl px-2 text-left hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
        data-testid={`builder-preset-${index}-open`}
      >
        <GameIcon id={primary?.icon ?? "star"} size={24} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-lg" data-testid={`builder-preset-${index}-name`}>
            {p.name}
          </span>
          <span className="truncate text-sm text-fg-muted">
            {p.game} · {tp("builder.counters", p.counters.length)} ·{" "}
            {t("builder.players", { min: p.minPlayers, max: p.maxPlayers })}
          </span>
        </span>
      </button>
      <div
        className="flex justify-end gap-1"
        role="group"
        aria-label={t("builder.actions", { name: p.name })}
      >
        <IconButton
          label={t("builder.edit")}
          onClick={onEdit}
          data-testid={`builder-edit-${index}`}
        >
          <Pencil size={20} />
        </IconButton>
        <IconButton
          label={t("builder.copy")}
          onClick={onCopy}
          data-locked={canCopy ? undefined : "1"}
          data-testid={`builder-copy-${index}`}
        >
          <Copy size={20} />
        </IconButton>
        {share}
        <IconButton
          label={t("builder.export")}
          onClick={onExport}
          data-testid={`builder-export-${index}`}
        >
          <Download size={20} />
        </IconButton>
        <IconButton
          label={t("builder.delete")}
          onClick={onDelete}
          data-testid={`builder-delete-${index}`}
        >
          <Trash2 size={20} />
        </IconButton>
      </div>
    </li>
  );
}

function ImportSheet({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: (p: Preset) => void;
}) {
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const fileId = useId();
  const textId = useId();

  async function submit(json: string) {
    const r = importPresetJson(json);
    if (!r.ok) return setErrors(r.errors);
    try {
      const saved = await saveCustomPreset(r.preset);
      setText("");
      setErrors([]);
      onImported(saved);
    } catch (e) {
      setErrors([String(e)]);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("builder.importTitle")}
      testId="builder-import-sheet"
    >
      <div className="flex flex-col gap-3">
        <label htmlFor={fileId} className="text-sm text-fg-muted">
          {t("builder.importFile")}
        </label>
        <input
          id={fileId}
          type="file"
          accept="application/json,.json"
          data-testid="builder-import-file"
          className="min-h-12 text-fg file:mr-3 file:min-h-12 file:rounded-xl file:border-0 file:bg-surface-2 file:px-4 file:text-fg"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) await submit(await file.text());
            e.target.value = "";
          }}
        />
        <label htmlFor={textId} className="text-sm text-fg-muted">
          {t("builder.importPaste")}
        </label>
        <textarea
          id={textId}
          data-testid="builder-import-text"
          className={`${inputCls} min-h-32 py-2 font-mono text-sm`}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {errors.length > 0 && (
          <div role="alert" data-testid="builder-import-errors" className="text-sm text-danger">
            <p className="font-semibold">{t("builder.importErrors")}</p>
            <ul className="list-disc pl-5">
              {errors.slice(0, 8).map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
        <Button
          variant="primary"
          disabled={!text.trim()}
          onClick={() => void submit(text)}
          data-testid="builder-import-submit"
        >
          {t("builder.importSubmit")}
        </Button>
      </div>
    </Sheet>
  );
}
