"use client";
/**
 * A-11e (ART-006): "Clear image cache" confirmation with the size it frees. Clears the service
 * worker's `scryfall-*` caches and the offline Scryfall copies; uploads are kept.
 */
import { useEffect, useState } from "react";
import { Button, Sheet } from "@/components/ui";
import { useSnackbar } from "@/components/ui/Snackbar";
import { clearImageCache, formatBytes, imageCacheSize } from "@/lib/art/imageCache";
import { t } from "@/lib/i18n";

export function ImageCacheSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Measured per opening (`round`), so a stale size never shows.
  const [measured, setMeasured] = useState<{ round: number; bytes: number } | null>(null);
  const [round, setRound] = useState(0);
  const [busy, setBusy] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setRound((r) => r + 1);
  }
  useEffect(() => {
    if (!open) return;
    let live = true;
    imageCacheSize()
      .then((s) => live && setMeasured({ round, bytes: s.bytes }))
      .catch(() => live && setMeasured({ round, bytes: 0 }));
    return () => {
      live = false;
    };
  }, [open, round]);
  const size = measured && measured.round === round ? measured.bytes : null;

  const confirm = async () => {
    setBusy(true);
    try {
      const removed = await clearImageCache();
      useSnackbar
        .getState()
        .show({ message: t("shell.imageCache.cleared", { size: formatBytes(removed.bytes) }) });
    } catch {
      useSnackbar.getState().show({ message: t("shell.imageCache.failed") });
    } finally {
      setBusy(false);
      onClose();
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("shell.settings.clearImageCache.title")}
      testId="image-cache-sheet"
    >
      <p className="mb-2 text-base">{t("shell.imageCache.body")}</p>
      <p className="mb-4 text-lg font-semibold" data-testid="image-cache-size">
        {size === null
          ? t("shell.imageCache.measuring")
          : t("shell.imageCache.size", { size: formatBytes(size) })}
      </p>
      <div className="flex gap-3">
        <Button className="flex-1" onClick={onClose} data-testid="image-cache-cancel">
          {t("common.cancel")}
        </Button>
        <Button
          className="flex-1"
          variant="danger"
          disabled={busy}
          onClick={() => void confirm()}
          data-testid="image-cache-confirm"
        >
          {t("shell.imageCache.confirm")}
        </Button>
      </div>
    </Sheet>
  );
}
