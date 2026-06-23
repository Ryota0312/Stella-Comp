import type { ClientCompositeStatus, ResultRow } from "../types";
import { clientCompositeStatusText, type Language, type UploadCopy } from "../i18n";

type ResultPanelProps = {
  clientCompositeStatus: ClientCompositeStatus;
  copy: UploadCopy;
  language: Language;
  resultRows: ResultRow[];
  resultUrl: string | null;
};

export function ResultPanel({
  clientCompositeStatus,
  copy,
  language,
  resultRows,
  resultUrl,
}: ResultPanelProps) {
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
        {resultUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={resultUrl} alt={copy.result.compositeAlt} />
        ) : (
          <span>{clientCompositeStatusText(clientCompositeStatus, language)}</span>
        )}
      </div>
      <div className="result-actions">
        <a
          className={`secondary-action link-action${resultUrl ? "" : " link-disabled"}`}
          href={resultUrl ?? undefined}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!resultUrl}
        >
          {copy.result.openPreview}
        </a>
        <a
          className={`primary-action link-action${resultUrl ? "" : " link-disabled"}`}
          href={resultUrl ?? undefined}
          download="stella-comp-preview-stack.png"
          aria-disabled={!resultUrl}
        >
          {copy.result.downloadOutput}
        </a>
      </div>
    </section>
  );
}
