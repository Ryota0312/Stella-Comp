import type { ClientCompositeStatus, ResultRow } from "../types";
import { clientCompositeStatusText } from "../utils";

type ResultPanelProps = {
  clientCompositeStatus: ClientCompositeStatus;
  resultRows: ResultRow[];
  resultUrl: string | null;
};

export function ResultPanel({ clientCompositeStatus, resultRows, resultUrl }: ResultPanelProps) {
  return (
    <section className="panel panel-results">
      <header className="panel-header">
        <div>
          <p className="panel-kicker">Output</p>
          <h2>Result Bundle</h2>
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
          <img src={resultUrl} alt="Composite result" />
        ) : (
          <span>{clientCompositeStatusText(clientCompositeStatus)}</span>
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
          Open Preview
        </a>
        <a
          className={`primary-action link-action${resultUrl ? "" : " link-disabled"}`}
          href={resultUrl ?? undefined}
          download="stella-comp-preview-stack.png"
          aria-disabled={!resultUrl}
        >
          Download Output
        </a>
      </div>
    </section>
  );
}
