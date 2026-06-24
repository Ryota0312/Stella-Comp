import type { ClientCompositeStatus, ResultRow } from "../types";
import { clientCompositeStatusText, type Language, type UploadCopy } from "../i18n";

type ResultPanelProps = {
  clientCompositeStatus: ClientCompositeStatus;
  copy: UploadCopy;
  downloadFileName: string | null;
  downloadUrl: string | null;
  language: Language;
  resultLabel: string | null;
  resultRows: ResultRow[];
  previewUrl: string | null;
};

export function ResultPanel({
  clientCompositeStatus,
  copy,
  downloadFileName,
  downloadUrl,
  language,
  resultLabel,
  resultRows,
  previewUrl,
}: ResultPanelProps) {
  const hasPreview = Boolean(previewUrl);
  const hasDownload = Boolean(downloadUrl);

  return (
    <section className="panel panel-results">
      <header className="panel-header">
        <div>
          <p className="panel-kicker">{copy.result.kicker}</p>
          <h2>{copy.result.title}</h2>
        </div>
      </header>
      <div className="result-stack">
        {resultRows.map((row) => (
          <div className="result-row" key={row.label}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>
      <div className="result-preview">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt={copy.result.compositeAlt} />
        ) : (
          <span>{clientCompositeStatusText(clientCompositeStatus, language)}</span>
        )}
      </div>
      <div className="result-actions">
        <a
          className={`secondary-action link-action${hasPreview ? "" : " link-disabled"}`}
          href={previewUrl ?? undefined}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!hasPreview}
        >
          {copy.result.openPreview}
        </a>
        <a
          className={`primary-action link-action${hasDownload ? "" : " link-disabled"}`}
          href={downloadUrl ?? undefined}
          download={downloadFileName ?? undefined}
          aria-disabled={!hasDownload}
        >
          {resultLabel === "tiff" ? copy.result.downloadTiff : copy.result.downloadOutput}
        </a>
      </div>
    </section>
  );
}
