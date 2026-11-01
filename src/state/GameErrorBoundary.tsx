"use client";
/**
 * REL-004: error boundary for the board. On a render error it offers "Recover game", which
 * reloads the active session from IndexedDB and re-renders the children.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { t } from "@/lib/i18n";
import { useGameStore } from "./gameStore";

interface Props {
  children: ReactNode;
  /** Called after a successful recovery (e.g. analytics). */
  onRecovered?: () => void;
}

interface State {
  error: Error | null;
  phase: "idle" | "working" | "failed";
}

export class GameErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, phase: "idle" };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error, phase: "idle" };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[GameErrorBoundary]", error, info.componentStack);
  }

  private recover = async () => {
    this.setState({ phase: "working" });
    let ok = false;
    try {
      ok = await useGameStore.getState().resume();
    } catch (e) {
      console.error("[GameErrorBoundary] recover failed", e);
    }
    if (ok) {
      this.setState({ error: null, phase: "idle" });
      this.props.onRecovered?.();
    } else {
      this.setState({ phase: "failed" });
    }
  };

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    const { phase } = this.state;
    return (
      <div
        role="alert"
        className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center"
      >
        <h1 className="text-xl font-semibold">{t("engine.recover.title")}</h1>
        <p className="text-fg-muted">{t("engine.recover.body")}</p>
        <Button
          variant="primary"
          size="lg"
          disabled={phase === "working"}
          onClick={() => void this.recover()}
        >
          {phase === "working" ? t("engine.recover.working") : t("engine.recover.button")}
        </Button>
        {phase === "failed" && <p className="text-danger">{t("engine.recover.failed")}</p>}
      </div>
    );
  }
}
