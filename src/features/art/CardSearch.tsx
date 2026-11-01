"use client";
/** Card name search with Scryfall autocomplete (ART-001; offline message ART-009). */
import { Search, WifiOff } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { getScryfall, isOfflineError } from "@/lib/art/scryfall";
import { SEARCH_DEBOUNCE_MS, shouldSuggest } from "@/lib/art/picker";
import { isAbortError } from "@/lib/scryfall";
import { t } from "@/lib/i18n";
import { useOnline } from "./useOnline";

interface Props {
  onPick: (name: string) => void;
}

type Status = "idle" | "loading" | "done" | "error" | "offline";

export function OfflineNotice() {
  return (
    <p
      role="status"
      data-testid="art-offline"
      className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-3 text-sm"
    >
      <WifiOff aria-hidden size={18} />
      {t("art.offline")}
    </p>
  );
}

export function CardSearch({ onPick }: Props) {
  const inputId = useId();
  const listId = useId();
  const online = useOnline();
  const [q, setQ] = useState("");
  const [result, setResult] = useState<{ q: string; status: Status; names: string[] }>({
    q: "",
    status: "idle",
    names: [],
  });

  useEffect(() => {
    if (!online || !shouldSuggest(q)) return;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => {
      setResult({ q, status: "loading", names: [] });
      getScryfall()
        .autocomplete(q, { signal: ctrl.signal })
        .then((names) => setResult({ q, status: "done", names }))
        .catch((e: unknown) => {
          if (isAbortError(e)) return;
          setResult({ q, status: isOfflineError(e) ? "offline" : "error", names: [] });
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, online]);

  const current = result.q === q ? result : { q, status: "idle" as Status, names: [] };
  const offline = !online || current.status === "offline";

  return (
    <div className="flex flex-col gap-2" data-testid="art-search">
      <label htmlFor={inputId} className="text-sm text-fg-muted">
        {t("art.search.label")}
      </label>
      <div className="relative">
        <Search
          aria-hidden
          size={20}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted"
        />
        <input
          id={inputId}
          type="search"
          autoComplete="off"
          enterKeyHint="search"
          data-testid="art-search-input"
          aria-controls={listId}
          placeholder={t("art.search.placeholder")}
          className="min-h-12 w-full rounded-xl border border-border bg-bg pl-10 pr-3 text-lg text-fg outline-none focus:border-accent"
          value={q}
          maxLength={120}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && current.names[0]) onPick(current.names[0]);
          }}
        />
      </div>
      {offline ? (
        <OfflineNotice />
      ) : !shouldSuggest(q) ? (
        <p className="text-sm text-fg-muted">{t("art.search.hint")}</p>
      ) : current.status === "loading" || current.status === "idle" ? (
        <p className="text-sm text-fg-muted" role="status">
          {t("art.search.loading")}
        </p>
      ) : current.status === "error" ? (
        <p className="text-sm text-danger" role="alert">
          {t("art.search.error")}
        </p>
      ) : current.names.length === 0 ? (
        <p className="text-sm text-fg-muted" role="status">
          {t("art.search.none")}
        </p>
      ) : null}
      <ul
        id={listId}
        aria-label={t("art.search.suggestions")}
        className="flex flex-col gap-1"
        data-testid="art-suggestions"
      >
        {!offline &&
          current.names.map((name, i) => (
            <li key={name}>
              <button
                type="button"
                data-testid={`art-suggestion-${i}`}
                className="min-h-12 w-full rounded-xl px-3 text-left hover:bg-surface-2"
                onClick={() => onPick(name)}
              >
                {name}
              </button>
            </li>
          ))}
      </ul>
    </div>
  );
}
