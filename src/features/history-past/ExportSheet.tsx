"use client";
/** HIST-006 export (CSV / JSON of the filtered records) and JSON import (validated, deduped). */
import { useRef } from "react";
import { FileDown, FileJson, FileUp } from "lucide-react";
import { Button, Sheet, useSnackbar } from "@/components/ui";
import { t } from "@/lib/i18n";
import {
  exportFileName,
  importRecords,
  parseRecordsJson,
  recordsToCsv,
  recordsToJson,
  type GameRecord,
} from "@/lib/records";
import { Locked } from "./parts";

function download(name: string, type: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ExportSheet({
  records,
  allowed,
  onClose,
}: {
  records: GameRecord[];
  allowed: boolean;
  onClose: () => void;
}) {
  const show = useSnackbar((s) => s.show);
  const file = useRef<HTMLInputElement>(null);
  const onImport = async (f: File | undefined) => {
    if (!f) return;
    const parsed = parseRecordsJson(await f.text());
    if (!parsed.ok) {
      show({ message: t("historyPast.ex.importError") });
      return;
    }
    const res = await importRecords(parsed.records);
    show({
      message:
        t("historyPast.ex.imported", { added: res.added, skipped: res.skipped }) +
        (parsed.invalid
          ? ` · ${t("historyPast.ex.importInvalid", { count: parsed.invalid })}`
          : ""),
    });
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={t("historyPast.ex.title")} testId="export-sheet">
      <Locked allowed={allowed} testId="export-locked">
        <p className="mb-3 text-fg-muted">{t("historyPast.ex.hint", { count: records.length })}</p>
        <div className="flex flex-col gap-2">
          <Button
            block
            icon={<FileDown size={18} aria-hidden />}
            data-testid="export-csv"
            onClick={() =>
              download(exportFileName("csv", Date.now()), "text/csv", recordsToCsv(records))
            }
          >
            {t("historyPast.ex.csv")}
          </Button>
          <Button
            block
            icon={<FileJson size={18} aria-hidden />}
            data-testid="export-json"
            onClick={() =>
              download(
                exportFileName("json", Date.now()),
                "application/json",
                recordsToJson(records, Date.now()),
              )
            }
          >
            {t("historyPast.ex.json")}
          </Button>
          <Button
            block
            icon={<FileUp size={18} aria-hidden />}
            data-testid="import-json"
            onClick={() => file.current?.click()}
          >
            {t("historyPast.ex.import")}
          </Button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label={t("historyPast.ex.import")}
            data-testid="import-file"
            onChange={(e) => void onImport(e.target.files?.[0])}
          />
        </div>
      </Locked>
    </Sheet>
  );
}
