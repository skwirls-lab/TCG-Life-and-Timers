"use client";
/**
 * "Upload image" (ART-020, ART-021, ART-025): `<input type="file" accept="image/*">` (mobile
 * browsers also offer the camera) → validate → processImage (EXIF orientation applied, ≤ 1600 px,
 * WebP/JPEG re-encode that strips EXIF/GPS) → stored in the Dexie art table (ART-022).
 */
import { ImagePlus, LoaderCircle } from "lucide-react";
import { useId, useState } from "react";
import { saveUpload, nameFromFile, type ArtRow } from "@/lib/art/repo";
import { syncArtNow } from "@/lib/art/cloudRuntime";
import { ImageValidationError, processImage } from "@/lib/image";
import { t, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/ui/cn";

interface Props {
  onUploaded: (row: ArtRow) => void;
  className?: string;
  testId?: string;
}

function errorMessage(e: unknown): string {
  if (e instanceof ImageValidationError) return t(`art.upload.error.${e.code}` as MessageKey);
  return t("art.upload.error.unknown");
}

export function UploadButton({ onUploaded, className, testId = "art-upload" }: Props) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const out = await processImage(file);
      const row = await saveUpload({
        blob: out.blob,
        width: out.width,
        height: out.height,
        contentType: out.type,
        name: nameFromFile(file.name, t("art.upload.defaultName")),
      });
      onUploaded(row);
      void syncArtNow().catch(() => null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className={cn(
          "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border px-4 hover:bg-surface-2 focus-within:outline-2 focus-within:outline-accent",
          busy && "pointer-events-none opacity-60",
          className,
        )}
      >
        {busy ? (
          <LoaderCircle aria-hidden size={22} className="animate-spin" />
        ) : (
          <ImagePlus aria-hidden size={22} />
        )}
        <span>{busy ? t("art.upload.processing") : t("art.picker.upload")}</span>
        <input
          id={id}
          type="file"
          accept="image/*"
          className="sr-only"
          data-testid={`${testId}-input`}
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            void onFile(file);
          }}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-danger" data-testid={`${testId}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
