"use client";
/**
 * My images (ART-023): reuse, rename and delete uploaded images; cloud sync counter for the
 * signed-in quota (ART-024, `useLimit('cloudArtImages')`). Images are private (LEG-005).
 */
import { liveQuery } from "dexie";
import { Check, Cloud, CloudOff, HardDrive, Pencil, Trash2, UserRound } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button, PageShell } from "@/components/ui";
import { usePageBoot } from "@/features/app-effects/usePageBoot";
import { artQuota } from "@/lib/art/cloud";
import { deleteArt, syncArtNow, watchArtCloud } from "@/lib/art/cloudRuntime";
import { uploadArtRef } from "@/lib/art/picker";
import { listUploads, MAX_ART_NAME, renameArt, type ArtRow } from "@/lib/art/repo";
import { useAuth } from "@/lib/auth/store";
import { useLimit } from "@/lib/entitlements/store";
import { t } from "@/lib/i18n";
import { useDispatch, useGameValue } from "@/state/gameStore";
import { ArtBackground } from "./ArtBackground";
import { UploadButton } from "./UploadButton";

function formatBytes(n: number | undefined): string {
  const b = n ?? 0;
  return b >= 1024 * 1024
    ? `${(b / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(b / 1024))} KB`;
}

function statusOf(row: ArtRow): { label: string; icon: ReactNode } {
  if (row.meta.remoteOnly) return { label: t("art.images.remote"), icon: <Cloud size={14} /> };
  if (typeof row.meta.storagePath === "string")
    return { label: t("art.images.synced"), icon: <Cloud size={14} /> };
  if (row.meta.cloud === "overQuota")
    return { label: t("art.images.overQuota"), icon: <CloudOff size={14} /> };
  if (row.meta.cloud === "error")
    return { label: t("art.images.error"), icon: <CloudOff size={14} /> };
  return { label: t("art.images.local"), icon: <HardDrive size={14} /> };
}

export function MyImagesScreen() {
  usePageBoot();
  const [rows, setRows] = useState<ArtRow[] | null>(null);
  const user = useAuth((s) => s.user);
  const signedIn = !!user && !user.isAnonymous;
  const cloudLimit = useLimit("cloudArtImages");

  useEffect(() => {
    watchArtCloud();
    const sub = liveQuery(() => listUploads()).subscribe({
      next: (r) => setRows(r),
      error: () => setRows([]),
    });
    return () => sub.unsubscribe();
  }, []);

  useEffect(() => {
    if (signedIn) void syncArtNow().catch(() => null);
  }, [signedIn]);

  const quota = artQuota(rows ?? [], cloudLimit);

  return (
    <PageShell title={t("art.images.title")} backHref="/settings" testId="images-page">
      <div className="flex flex-col gap-4 pt-4">
        <section
          className="flex flex-col gap-1 rounded-2xl bg-surface p-4 text-sm"
          data-testid="images-quota"
          data-used={quota.used}
          data-limit={quota.limit}
        >
          {signedIn ? (
            <>
              <p className="flex items-center gap-2 font-medium">
                <Cloud aria-hidden size={18} />
                {t("art.images.quota", { used: quota.used, limit: quota.limit })}
              </p>
              {(quota.remaining === 0 || quota.overQuota > 0) && (
                <p className="text-warning" data-testid="images-quota-full">
                  {t("art.images.quotaFull")}
                </p>
              )}
            </>
          ) : (
            <p className="flex items-center gap-2">
              <UserRound aria-hidden size={18} />
              {t("art.images.quotaGuest")}
            </p>
          )}
          <p className="text-fg-muted">{t("art.images.private")}</p>
        </section>

        <UploadButton onUploaded={() => undefined} testId="images-upload" />

        {rows && rows.length === 0 && (
          <p className="text-fg-muted" data-testid="images-empty">
            {t("art.images.empty")}
          </p>
        )}
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="images-grid">
          {(rows ?? []).map((row, i) => (
            <ImageCard key={row.id} row={row} index={i} />
          ))}
        </ul>
      </div>
    </PageShell>
  );
}

function ImageCard({ row, index }: { row: ArtRow; index: number }) {
  const dispatch = useDispatch();
  // Select the seat objects themselves (stable references) so the shallow compare settles.
  const seats = useGameValue((g) => g.seats);
  const [mode, setMode] = useState<"view" | "rename" | "delete" | "use">("view");
  const [name, setName] = useState(row.meta.name ?? "");
  const [notice, setNotice] = useState<string | null>(null);
  const status = statusOf(row);
  const title = row.meta.name || t("art.upload.defaultName");

  return (
    <li
      className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface"
      data-testid={`images-item-${index}`}
      data-id={row.id}
      data-name={row.meta.name ?? ""}
    >
      <ArtBackground
        art={{ kind: "upload", value: row.id }}
        fallbackColor="#27272a"
        className="aspect-[3/2] w-full"
        testId={`images-preview-${index}`}
      />
      <div className="flex flex-col gap-2 p-3">
        {mode === "rename" ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void renameArt(row.id, name).then(() => setMode("view"));
            }}
          >
            <input
              aria-label={t("art.images.renameLabel")}
              data-testid={`images-rename-input-${index}`}
              className="min-h-12 min-w-0 flex-1 rounded-xl border border-border bg-bg px-3 text-fg outline-none focus:border-accent"
              value={name}
              maxLength={MAX_ART_NAME}
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
            <Button
              type="submit"
              variant="primary"
              icon={<Check size={18} />}
              data-testid={`images-rename-save-${index}`}
            >
              {t("art.images.save")}
            </Button>
          </form>
        ) : (
          <h2 className="truncate text-lg font-semibold">{title}</h2>
        )}
        <p className="text-sm text-fg-muted">
          {t("art.images.details", {
            width: row.meta.width ?? "?",
            height: row.meta.height ?? "?",
            size: formatBytes(row.meta.bytes),
          })}
        </p>
        <p
          className="flex items-center gap-1 text-xs text-fg-muted"
          data-testid={`images-status-${index}`}
        >
          {status.icon}
          {status.label}
        </p>

        {mode === "delete" ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm">{t("art.images.deleteConfirm", { name: title })}</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                data-testid={`images-delete-confirm-${index}`}
                onClick={() => void deleteArt(row.id)}
              >
                {t("art.images.confirm")}
              </Button>
              <Button variant="ghost" onClick={() => setMode("view")}>
                {t("art.picker.cancel")}
              </Button>
            </div>
          </div>
        ) : mode === "use" ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm">{t("art.images.useHelp", { name: title })}</p>
            {seats && seats.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {seats.map((s, j) => (
                  <Button
                    key={s.id}
                    data-testid={`images-use-seat-${index}-${j}`}
                    onClick={() => {
                      dispatch({ type: "SEAT_SET_ART", seatId: s.id, art: uploadArtRef(row.id) });
                      setNotice(t("art.images.applied", { name: s.name }));
                      setMode("view");
                    }}
                  >
                    {t("art.images.seat", { name: s.name })}
                  </Button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-fg-muted">{t("art.images.noGame")}</p>
            )}
            <Button variant="ghost" onClick={() => setMode("view")}>
              {t("art.picker.cancel")}
            </Button>
          </div>
        ) : (
          mode === "view" && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="md"
                variant="primary"
                data-testid={`images-use-${index}`}
                onClick={() => setMode("use")}
              >
                {t("art.images.use")}
              </Button>
              <Button
                icon={<Pencil size={18} />}
                data-testid={`images-rename-${index}`}
                onClick={() => {
                  setName(row.meta.name ?? "");
                  setMode("rename");
                }}
              >
                {t("art.images.rename")}
              </Button>
              <Button
                variant="outline"
                icon={<Trash2 size={18} />}
                data-testid={`images-delete-${index}`}
                onClick={() => setMode("delete")}
              >
                {t("art.images.delete")}
              </Button>
            </div>
          )
        )}
        {notice && (
          <p role="status" className="text-sm text-fg-muted">
            {notice}
          </p>
        )}
      </div>
    </li>
  );
}
