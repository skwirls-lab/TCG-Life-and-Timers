"use client";
/**
 * Commander name field backed by Scryfall (PROF-010): typing searches commander-eligible cards
 * (`is:commander`; the partner slot also offers Backgrounds) with a 300 ms debounce, and picking a
 * suggestion stores the card's exact name. Partner legality is not enforced. Offline, or when
 * Scryfall fails, the field stays a free-text input with a short note (the typed name is kept).
 */
import { WifiOff } from "lucide-react";
import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { useOnline } from "@/features/art/useOnline";
import { SEARCH_DEBOUNCE_MS, shouldSuggest } from "@/lib/art/picker";
import { getScryfall, isOfflineError } from "@/lib/art/scryfall";
import { t } from "@/lib/i18n";
import { isAbortError, type ScryfallCard } from "@/lib/scryfall";
import { cn } from "@/lib/ui/cn";

export interface CommanderPick {
  /** exact Scryfall card name */
  name: string;
  /** Scryfall card id of the suggested printing */
  cardId: string;
  card: ScryfallCard;
}

export interface CommanderInputProps {
  value: string;
  onChange: (text: string) => void;
  onPick: (pick: CommanderPick) => void;
  /** second slot: partners and Backgrounds */
  partner?: boolean;
  label: string;
  placeholder: string;
  testId: string;
  className?: string;
  maxLength?: number;
  onBlur?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
}

type Status = "loading" | "done" | "error" | "offline";

const isBackground = (c: ScryfallCard) => /\bBackground\b/.test(c.type_line ?? "");

export function CommanderInput({
  value,
  onChange,
  onPick,
  partner = false,
  label,
  placeholder,
  testId,
  className,
  maxLength = 80,
  onBlur,
  onKeyDown,
}: CommanderInputProps) {
  const listId = useId();
  const online = useOnline();
  /** suggestions are shown for text the user typed (not for a picked or loaded name) */
  const [typed, setTyped] = useState(false);
  const [result, setResult] = useState<{ q: string; status: Status; cards: ScryfallCard[] }>({
    q: "",
    status: "done",
    cards: [],
  });

  const wanted = typed && shouldSuggest(value);
  useEffect(() => {
    if (!online || !wanted) return;
    const ctrl = new AbortController();
    const q = value;
    const timer = window.setTimeout(() => {
      setResult({ q, status: "loading", cards: [] });
      getScryfall()
        .searchCommanders(q, { partner, signal: ctrl.signal })
        .then((cards) => setResult({ q, status: "done", cards }))
        .catch((e: unknown) => {
          if (isAbortError(e)) return;
          setResult({ q, status: isOfflineError(e) ? "offline" : "error", cards: [] });
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [value, online, wanted, partner]);

  const current =
    result.q === value ? result : { q: value, status: "loading" as Status, cards: [] };
  const offline = !online || current.status === "offline";
  const cards = wanted && !offline ? current.cards : [];

  const pick = (card: ScryfallCard) => {
    setTyped(false);
    onPick({ name: card.name, cardId: card.id, card });
  };

  let note: { text: string; offline?: boolean; role: "status" | "alert" } | null = null;
  if (offline && typed && value.trim())
    note = { text: t("profiles.commander.offline"), offline: true, role: "status" };
  else if (wanted && current.status === "error")
    note = { text: t("profiles.commander.error"), role: "alert" };
  else if (wanted && current.status === "loading")
    note = { text: t("profiles.commander.searching"), role: "status" };
  else if (wanted && current.status === "done" && current.cards.length === 0)
    note = { text: t("profiles.commander.none"), role: "status" };

  return (
    <div className="flex flex-col gap-1" data-testid={`${testId}-field`}>
      <input
        aria-label={label}
        placeholder={placeholder}
        data-testid={testId}
        className={className}
        value={value}
        maxLength={maxLength}
        autoComplete="off"
        enterKeyHint="done"
        aria-controls={cards.length ? listId : undefined}
        onChange={(e) => {
          setTyped(true);
          onChange(e.target.value);
        }}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (e.key === "Enter" && cards[0]) {
            e.preventDefault();
            pick(cards[0]);
          } else if (e.key === "Escape") setTyped(false);
          onKeyDown?.(e);
        }}
      />
      {note && (
        <p
          role={note.role}
          data-testid={note.offline ? `${testId}-offline` : `${testId}-note`}
          className={cn(
            "flex items-center gap-2 text-sm",
            note.role === "alert" ? "text-danger" : "text-fg-muted",
          )}
        >
          {note.offline && <WifiOff aria-hidden size={16} className="shrink-0" />}
          {note.text}
        </p>
      )}
      {cards.length > 0 && (
        <ul
          id={listId}
          aria-label={t("profiles.commander.suggestions")}
          className="flex flex-col gap-1 rounded-xl border border-border p-1"
          data-testid={`${testId}-suggestions`}
        >
          {cards.map((card, i) => (
            <li key={card.id}>
              <button
                type="button"
                data-testid={`${testId}-option-${i}`}
                className="flex min-h-12 w-full items-center gap-2 rounded-lg px-3 text-left hover:bg-surface-2"
                // Keep focus in the input so its blur doesn't commit the half-typed text first.
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => pick(card)}
              >
                <span className="min-w-0 flex-1 truncate">{card.name}</span>
                {isBackground(card) && (
                  <span className="shrink-0 rounded-full bg-surface-3 px-2 text-xs">
                    {t("profiles.commander.background")}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
