"use client";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { t } from "@/lib/i18n";
import { IconButton } from "./Button";

interface Props {
  title: string;
  children: ReactNode;
  /** where Back goes when there's no history (defaults to "/") */
  backHref?: string;
  onBack?: () => void;
  actions?: ReactNode;
  testId?: string;
}

/** Full-screen page with a back arrow and centered title (LifeTap Settings/History/Dice pages). */
export function PageShell({ title, children, backHref = "/", onBack, actions, testId }: Props) {
  const router = useRouter();
  const back = () => {
    if (onBack) return onBack();
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push(backHref);
  };
  return (
    <div className="flex min-h-dvh flex-col bg-bg safe-area" data-testid={testId}>
      <header className="sticky top-0 z-10 grid grid-cols-[3rem_1fr_3rem] items-center border-b border-border bg-bg/95 px-2 py-2 backdrop-blur">
        <IconButton label={t("common.back")} onClick={back} data-testid="page-back">
          <ArrowLeft size={28} />
        </IconButton>
        <h1 className="truncate text-center text-2xl">{title}</h1>
        <div className="flex justify-end">{actions}</div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-10">{children}</main>
    </div>
  );
}
