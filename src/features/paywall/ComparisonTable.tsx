"use client";
/** Free vs Pro comparison (PRD §17.2) used by the paywall sheet and /pro (PAY-004). */
import { Check, Minus } from "lucide-react";
import type { ProFeature } from "@/lib/entitlements/features";
import { rowForFeature, rowsByArea, type Cell } from "@/lib/entitlements/paywall";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/ui/cn";

function CellView({ cell }: { cell: Cell }) {
  if (cell.kind === "yes")
    return (
      <>
        <Check aria-hidden size={20} className="mx-auto text-success" />
        <span className="sr-only">{t("pay.sheet.yes")}</span>
      </>
    );
  if (cell.kind === "no")
    return (
      <>
        <Minus aria-hidden size={20} className="mx-auto text-fg-muted" />
        <span className="sr-only">{t("pay.sheet.no")}</span>
      </>
    );
  return <span className="text-sm">{t(cell.key)}</span>;
}

export function ComparisonTable({ feature }: { feature?: ProFeature | null }) {
  const highlight = rowForFeature(feature)?.id ?? null;
  return (
    <table className="w-full table-fixed border-collapse text-left" data-testid="paywall-table">
      <caption className="sr-only">{t("pay.sheet.compare")}</caption>
      <colgroup>
        <col />
        <col className="w-[5.5rem]" />
        <col className="w-[5.5rem]" />
      </colgroup>
      <thead>
        <tr className="text-sm text-fg-muted">
          <th scope="col" className="py-2 font-medium">
            {t("pay.sheet.colFeature")}
          </th>
          <th scope="col" className="py-2 text-center font-medium">
            {t("pay.sheet.colFree")}
          </th>
          <th scope="col" className="py-2 text-center font-medium text-accent">
            {t("pay.sheet.colPro")}
          </th>
        </tr>
      </thead>
      {rowsByArea().map(({ area, rows }) => (
        <tbody key={area}>
          <tr>
            <th
              scope="colgroup"
              colSpan={3}
              className="pt-4 pb-1 text-xs uppercase tracking-wide text-fg-muted"
            >
              {t(`pay.area.${area}`)}
            </th>
          </tr>
          {rows.map((row) => {
            const on = row.id === highlight;
            return (
              <tr
                key={row.id}
                data-testid={`paywall-row-${row.id}`}
                data-highlight={on ? "1" : undefined}
                aria-current={on ? "true" : undefined}
                className={cn("border-t border-border/50", on && "bg-accent/15")}
              >
                <th scope="row" className="py-2 pr-2 text-sm font-normal leading-snug">
                  {t(row.label)}
                  {on && <span className="sr-only"> ({t("pay.sheet.highlight")})</span>}
                </th>
                <td className="px-1 py-2 text-center align-middle">
                  <CellView cell={row.free} />
                </td>
                <td className="px-1 py-2 text-center align-middle">
                  <CellView cell={row.pro} />
                </td>
              </tr>
            );
          })}
        </tbody>
      ))}
    </table>
  );
}
