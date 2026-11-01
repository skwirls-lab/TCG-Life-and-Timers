"use client";
/**
 * Every distinct artwork of a card (ART-002): art_crop thumbnails with set name and artist;
 * multi-faced cards list one tile per face (ART-003).
 */
import { useEffect, useState } from "react";
import { optionTitle } from "@/lib/art/picker";
import { getScryfall, isOfflineError } from "@/lib/art/scryfall";
import { artistCredit, isAbortError, type ArtOption } from "@/lib/scryfall";
import { t } from "@/lib/i18n";
import { OfflineNotice } from "./CardSearch";

interface Props {
  name: string;
  onChoose: (opt: ArtOption) => void;
}

type State =
  | { name: string; status: "loading" }
  | { name: string; status: "done"; options: ArtOption[] }
  | { name: string; status: "error" | "offline" };

export function PrintsGrid({ name, onChoose }: Props) {
  const [state, setState] = useState<State>({ name, status: "loading" });

  useEffect(() => {
    const ctrl = new AbortController();
    getScryfall()
      .searchArts(name, { signal: ctrl.signal })
      .then((options) => setState({ name, status: "done", options }))
      .catch((e: unknown) => {
        if (isAbortError(e)) return;
        setState({ name, status: isOfflineError(e) ? "offline" : "error" });
      });
    return () => ctrl.abort();
  }, [name]);

  const s: State = state.name === name ? state : { name, status: "loading" };
  return (
    <div className="flex flex-col gap-2" data-testid="art-prints">
      <h3 className="text-base font-semibold">{t("art.prints.title", { name })}</h3>
      {s.status === "loading" && (
        <p role="status" className="text-sm text-fg-muted">
          {t("art.prints.loading")}
        </p>
      )}
      {s.status === "offline" && <OfflineNotice />}
      {s.status === "error" && (
        <p role="alert" className="text-sm text-danger">
          {t("art.search.error")}
        </p>
      )}
      {s.status === "done" && s.options.length === 0 && (
        <p role="status" className="text-sm text-fg-muted">
          {t("art.prints.none")}
        </p>
      )}
      {s.status === "done" && s.options.length > 0 && (
        <ul className="grid grid-cols-2 gap-2" data-testid="art-prints-grid">
          {s.options.map((opt, i) => (
            <li key={opt.id}>
              <button
                type="button"
                data-testid={`art-print-${i}`}
                data-art-url={opt.artCropUrl}
                aria-label={t("art.prints.choose", {
                  name: optionTitle(opt),
                  set: opt.setName,
                  artist: opt.artist,
                })}
                className="flex w-full flex-col overflow-hidden rounded-xl border border-border text-left hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"
                onClick={() => onChoose(opt)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- remote Scryfall art_crop thumbnails are served cache-first by the SW; next/image would proxy them */}
                <img
                  src={opt.artCropUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="aspect-[4/3] w-full bg-surface-2 object-cover"
                />
                <span className="flex flex-col gap-0.5 px-2 py-1.5 text-xs">
                  {opt.faceName && (
                    <span className="font-semibold">
                      {t("art.prints.face", { face: opt.faceName })}
                    </span>
                  )}
                  <span className="truncate">{opt.setName}</span>
                  <span className="truncate text-fg-muted">
                    {artistCredit(opt.artist, t("art.credit"))}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
