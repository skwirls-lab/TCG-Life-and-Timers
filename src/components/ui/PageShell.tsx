"use client";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { AppMark } from "@/components/brand/AppMark";
import { t } from "@/lib/i18n";
import { useUpNavigation } from "@/lib/nav/useUpNavigation";
import { IconButton } from "./Button";

interface Props {
  title: string;
  children: ReactNode;
  /** where Back goes when there's no breadcrumb trail (defaults to the page's parent) */
  backHref?: string;
  onBack?: () => void;
  actions?: ReactNode;
  testId?: string;
}

/** Full-screen page with a back arrow and a centered, brand-marked title. */
export function PageShell({ title, children, backHref, onBack, actions, testId }: Props) {
  const up = useUpNavigation(backHref);
  const back = () => (onBack ? onBack() : up());
  return (
    <div className="flex min-h-dvh flex-col bg-bg safe-area" data-testid={testId}>
      <header className="sticky top-0 z-10 grid grid-cols-[3rem_1fr_3rem] items-center border-b border-border bg-bg/95 px-2 py-2 backdrop-blur">
        <IconButton label={t("common.back")} onClick={back} data-testid="page-back">
          <ArrowLeft size={28} />
        </IconButton>
        <h1 className="flex min-w-0 items-center justify-center gap-2 text-2xl">
          {/* the brand mark is a one-tap way Home from any page */}
          <Link
            href="/"
            aria-label={t("common.home")}
            title={t("common.home")}
            data-testid="page-home"
            className="-m-2 flex shrink-0 items-center rounded-full p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <AppMark size={24} />
          </Link>
          <span className="truncate">{title}</span>
        </h1>
        <div className="flex justify-end">{actions}</div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-10">{children}</main>
    </div>
  );
}
