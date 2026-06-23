import type { TimelineItem } from "../types";
import type { JobSummary, PreviewUploadSummary } from "../uploadApi";
import { formatBytes } from "../utils";

type JobStatusPanelProps = {
  canRunJob: boolean;
  compressionRatio: number;
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
          {uploadSummary ? "Run Composite" : "Upload and Run"}
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
      {job?.status === "failed" && job.error ? <p className="inline-error">{job.error}</p> : null}
      {job?.warnings?.length ? (
        <div className="warning-list" aria-label="Job warnings">
          {job.warnings.map((warning, index) => (
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
