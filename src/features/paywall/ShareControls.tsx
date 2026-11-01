"use client";
/**
 * Builder share-link UI (T7.3, CUS-007, SEC-005): a per-preset "Share link" action (Pro:
 * `presetShareLinks`) and the owner's "My share links" list with delete. Hidden when this
 * deployment has no Firebase config (share links need the cloud).
 */
import { Link2, Share2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { create } from "zustand";
import { IconButton, LockBadge, SectionHeader, useSnackbar } from "@/components/ui";
import type { Preset } from "@/engine";
import { useAuth } from "@/lib/auth/store";
import { useProGate } from "@/lib/entitlements/gate";
import { isCloudConfigured } from "@/lib/firebase/config";
import { t } from "@/lib/i18n";
import type { MyShare } from "@/lib/share/share";

const loadShare = () => import("@/lib/share/share");

/** Bumps when a share is created so the list reloads. */
const useShareRev = create<{ rev: number; bump: () => void }>((set) => ({
  rev: 0,
  bump: () => set((s) => ({ rev: s.rev + 1 })),
}));

export function ShareAction({ preset, index }: { preset: Preset; index: number }) {
  const { allowed, open } = useProGate("presetShareLinks");
  const show = useSnackbar((s) => s.show);
  const bump = useShareRev((s) => s.bump);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  if (!isCloudConfigured()) return null;

  const share = async () => {
    if (!allowed) return open();
    if (busy) return;
    setBusy(true);
    try {
      const m = await loadShare();
      const code = await m.createShareLink(preset);
      const link = m.shareUrl(window.location.origin, code);
      setUrl(link);
      bump();
      const res = await m.deliverShareLink(link, t("pay.share.text", { name: preset.name }));
      show({
        message:
          res === "copied"
            ? t("pay.share.copied", { url: link })
            : t("pay.share.ready", { url: link }),
      });
    } catch (e) {
      show({
        message: t("pay.share.error", { error: e instanceof Error ? e.message : String(e) }),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <IconButton
        label={t("pay.share.button")}
        onClick={() => void share()}
        disabled={busy}
        className="relative disabled:opacity-30"
        data-testid={`builder-share-${index}`}
        data-locked={allowed ? undefined : "1"}
        data-url={url ?? undefined}
      >
        <Share2 size={20} />
        {!allowed && (
          <span aria-hidden className="absolute -right-0.5 -top-0.5 text-[10px]">
            🔒
          </span>
        )}
      </IconButton>
    </>
  );
}

export function MyShares() {
  const uid = useAuth((s) => s.user?.uid ?? null);
  const rev = useShareRev((s) => s.rev);
  const show = useSnackbar((s) => s.show);
  const [items, setItems] = useState<MyShare[] | null>(null);
  const { allowed } = useProGate("presetShareLinks");

  const reload = useCallback(async () => {
    if (!uid) return;
    const m = await loadShare();
    setItems(await m.listMyShares(uid).catch(() => []));
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    void loadShare()
      .then((m) => m.listMyShares(uid))
      .catch(() => [] as MyShare[])
      .then((list) => {
        if (alive) setItems(list);
      });
    return () => {
      alive = false;
    };
  }, [uid, rev]);

  if (!isCloudConfigured() || !uid || items === null) return null;
  // Owners can always see and delete their shares, even when creating new ones is locked.
  return (
    <section data-testid="builder-shares" aria-label={t("pay.share.mine")}>
      <SectionHeader title={t("pay.share.mine")} />
      {!allowed && (
        <p className="mb-2 flex items-center gap-2 text-sm text-fg-muted">
          <LockBadge /> {t("pay.feature.presetShareLinks")}
        </p>
      )}
      {items.length === 0 ? (
        <p className="text-fg-muted" data-testid="builder-shares-empty">
          {t("pay.share.mineEmpty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((s) => {
            const link = `${window.location.origin}/p/${s.code}`;
            return (
              <li
                key={s.code}
                data-testid={`builder-share-row-${s.code}`}
                className="flex items-center gap-2 rounded-2xl bg-surface p-2"
              >
                <Link2 aria-hidden size={20} className="shrink-0 text-fg-muted" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{s.name}</span>
                  <a
                    href={`/p/${s.code}`}
                    className="truncate text-sm text-accent underline-offset-4 hover:underline"
                  >
                    {link}
                  </a>
                </span>
                <IconButton
                  label={t("pay.share.copy", { name: s.name })}
                  onClick={async () => {
                    const m = await loadShare();
                    const res = await m.deliverShareLink(link, s.name);
                    if (res === "copied") show({ message: t("pay.share.copied", { url: link }) });
                  }}
                >
                  <Share2 size={20} />
                </IconButton>
                <IconButton
                  label={t("pay.share.delete", { name: s.name })}
                  data-testid={`builder-share-delete-${s.code}`}
                  onClick={async () => {
                    const m = await loadShare();
                    await m.deleteShare(s.code);
                    show({ message: t("pay.share.deleted", { name: s.name }) });
                    await reload();
                  }}
                >
                  <Trash2 size={20} />
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
