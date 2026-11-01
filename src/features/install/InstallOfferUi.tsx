"use client";
/** The install card + iOS "Add to Home Screen" sheet (PWA-003); lazily loaded by InstallPromptHost. */
import { Download, Share, SquarePlus } from "lucide-react";
import { Button, Sheet } from "@/components/ui";
import { t } from "@/lib/i18n";
import { promptInstall } from "./installEvents";
import type { InstallOffer } from "./policy";

export interface InstallOfferUiProps {
  offer: InstallOffer;
  sheetOpen: boolean;
  setSheetOpen: (open: boolean) => void;
  onDismiss: () => void;
}

export default function InstallOfferUi({
  offer,
  sheetOpen,
  setSheetOpen,
  onDismiss,
}: InstallOfferUiProps) {
  const dismiss = onDismiss;
  const onInstall = async () => {
    if (offer === "ios") return setSheetOpen(true);
    const outcome = await promptInstall();
    if (outcome !== "accepted") dismiss();
  };

  return (
    <>
      {offer ? (
        <section
          role="region"
          aria-label={t("install.title")}
          data-testid="install-prompt"
          data-offer={offer}
          className="fixed inset-x-3 bottom-3 z-[55] mx-auto flex max-w-xl flex-col gap-3 rounded-2xl border border-border bg-surface-3 p-4 shadow-xl safe-area"
        >
          <h2 className="text-base font-semibold">{t("install.title")}</h2>
          <p className="text-sm">{t("install.body")}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              icon={<Download aria-hidden size={20} />}
              onClick={() => void onInstall()}
              data-testid="install-accept"
            >
              {offer === "ios" ? t("install.howTo") : t("install.install")}
            </Button>
            <Button variant="outline" onClick={dismiss} data-testid="install-dismiss">
              {t("install.notNow")}
            </Button>
          </div>
        </section>
      ) : null}
      <Sheet
        open={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          dismiss();
        }}
        title={t("install.ios.title")}
        testId="install-ios-sheet"
      >
        <ol className="flex flex-col gap-3 pb-2">
          <li className="flex items-center gap-3">
            <Share aria-hidden size={28} className="shrink-0 text-accent" />
            <span>{t("install.ios.step1")}</span>
          </li>
          <li className="flex items-center gap-3">
            <SquarePlus aria-hidden size={28} className="shrink-0 text-accent" />
            <span>{t("install.ios.step2")}</span>
          </li>
          <li className="flex items-center gap-3">
            <span aria-hidden className="w-7 shrink-0 text-center text-lg font-bold text-accent">
              3
            </span>
            <span>{t("install.ios.step3")}</span>
          </li>
        </ol>
        <Button
          variant="primary"
          block
          onClick={() => {
            setSheetOpen(false);
            dismiss();
          }}
          data-testid="install-ios-done"
        >
          {t("install.ios.done")}
        </Button>
      </Sheet>
    </>
  );
}
