import type { ResultRow } from "../types";
import type { JobSummary } from "../uploadApi";
import { statusText } from "../utils";

type ResultPanelProps = {
  job: JobSummary | null;
  resultRows: ResultRow[];
  resultUrl: string | null;
};

export function ResultPanel({ job, resultRows, resultUrl }: ResultPanelProps) {
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
          <span>{job ? statusText(job.status) : "No result yet"}</span>
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
          download={job ? `stella-comp-${job.jobId}.jpg` : undefined}
          aria-disabled={!resultUrl}
        >
          Download Output
        </a>
      </div>
    </section>
  );
}
