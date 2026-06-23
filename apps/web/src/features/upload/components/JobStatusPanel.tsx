import type { ClientCompositeStatus, TimelineItem } from "../types";
import type { JobSummary, PreviewUploadSummary, ProcessingWarning } from "../uploadApi";
import { clientCompositeStatusText, formatBytes } from "../utils";

type JobStatusPanelProps = {
  canRunJob: boolean;
  compressionRatio: number;
  clientCompositeStatus: ClientCompositeStatus;
  clientWarnings: ProcessingWarning[];
  isJobBusy: boolean;
  job: JobSummary | null;
  jobError: string | null;
  previewBytes: number;
  runComposite: () => Promise<void>;
  sourceBytes: number;
  timeline: TimelineItem[];
  uploadError: string | null;
  uploadSummary: PreviewUploadSummary | null;
};

export function JobStatusPanel({
  canRunJob,
  compressionRatio,
  clientCompositeStatus,
  clientWarnings,
  isJobBusy,
  job,
  jobError,
  previewBytes,
  runComposite,
  sourceBytes,
  timeline,
  uploadError,
  uploadSummary,
}: JobStatusPanelProps) {
  return (
    <section className="panel panel-jobs">
      <header className="panel-header">
        <div>
          <p className="panel-kicker">Execution</p>
          <h2>Preview Status</h2>
        </div>
        <button
          type="button"
          className="primary-action"
          disabled={!canRunJob || isJobBusy}
          onClick={runComposite}
        >
          {uploadSummary ? "Run Client Stack" : "Upload and Stack"}
        </button>
      </header>
      <div className="timeline">
        {timeline.map((item) => (
          <div className="timeline-row" key={item.label}>
            <span>{item.label}</span>
            <span className={`timeline-state timeline-${item.tone}`}>{item.value}</span>
          </div>
        ))}
      </div>
      <div className="progress-block">
        <div className="progress-header">
          <span>Preview payload</span>
          <strong>
            {formatBytes(previewBytes)} / {formatBytes(sourceBytes)}
          </strong>
        </div>
        <div className="progress-bar" aria-hidden="true">
          <div
            className="progress-value"
            style={{ width: `${Math.min(compressionRatio * 100, 100)}%` }}
          />
        </div>
      </div>
      {uploadError ? <p className="inline-error">{uploadError}</p> : null}
      {uploadSummary ? (
        <p className="inline-success">
          Uploaded {uploadSummary.uploadedCount} preview files (
          {formatBytes(uploadSummary.uploadedBytes)}).
        </p>
      ) : null}
      {jobError ? <p className="inline-error">{jobError}</p> : null}
      {clientCompositeStatus !== "idle" && clientCompositeStatus !== "failed" ? (
        <p className="inline-success">{clientCompositeStatusText(clientCompositeStatus)}</p>
      ) : null}
      {job?.status === "failed" && job.error ? <p className="inline-error">{job.error}</p> : null}
      {clientWarnings.length ? (
        <div className="warning-list" aria-label="Alignment warnings">
          {clientWarnings.map((warning, index) => (
            <p key={`${warning.code}-${index}`}>
              <strong>{warning.code}</strong>
              <span>{warning.message}</span>
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
