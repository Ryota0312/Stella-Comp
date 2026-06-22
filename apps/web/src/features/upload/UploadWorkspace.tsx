"use client";

import {
  type ChangeEvent,
  type DragEvent,
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPreviewJpeg, extractEmbeddedJpegFromRaw } from "./previewGeneration";
import {
  createPreviewJob,
  fetchJob,
  type JobSummary,
  jobResultUrl,
  type PreviewUploadSummary,
  uploadPreviewImages,
} from "./uploadApi";

type QueueStatus =
  | "queued"
  | "generating"
  | "ready"
  | "raw-pending"
  | "unsupported"
  | "uploading"
  | "uploaded"
  | "failed";

type QueueItem = {
  id: string;
  file: File;
  name: string;
  extension: string;
  sourceSize: number;
  previewSize?: number;
  previewUrl?: string;
  previewBlob?: Blob;
  width?: number;
  height?: number;
  status: QueueStatus;
  note: string;
};

const browserDecodableTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

const rawExtensions = new Set(["cr2", "cr3", "dng", "nef", "arw", "raf", "orf", "rw2"]);
const jobPollIntervalMs = 2500;

export function UploadWorkspace() {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrlsRef = useRef(new Set<string>());
  const previewQueueRef = useRef(Promise.resolve());
  const pollTimeoutRef = useRef<number | null>(null);
  const uploadedItemIdsRef = useRef<string[]>([]);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadSummary, setUploadSummary] = useState<PreviewUploadSummary | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [job, setJob] = useState<JobSummary | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [isStartingJob, setIsStartingJob] = useState(false);

  useEffect(() => {
    return () => {
      if (pollTimeoutRef.current !== null) {
        window.clearTimeout(pollTimeoutRef.current);
      }
      for (const previewUrl of previewUrlsRef.current) {
        URL.revokeObjectURL(previewUrl);
      }
      previewUrlsRef.current.clear();
    };
  }, []);

  const activeItem = useMemo(
    () => items.find((item) => item.id === activeId) ?? items.find((item) => item.previewUrl),
    [activeId, items],
  );

  const readyCount = items.filter((item) => item.status === "ready" || item.status === "uploaded")
    .length;
  const pendingRawCount = items.filter((item) => item.status === "raw-pending").length;
  const uploadableCount = items.filter((item) => item.previewBlob && item.status !== "uploaded")
    .length;
  const sourceBytes = items.reduce((sum, item) => sum + item.sourceSize, 0);
  const previewBytes = items.reduce((sum, item) => sum + (item.previewSize ?? 0), 0);
  const compressionRatio = sourceBytes > 0 && previewBytes > 0 ? previewBytes / sourceBytes : 0;
  const canRunJob = uploadableCount > 0 || Boolean(uploadSummary?.uploadedCount);
  const isJobBusy = isStartingJob || job?.status === "queued" || job?.status === "running";
  const resultUrl = job?.status === "completed" ? jobResultUrl(job.jobId) : null;
  const resultRows = [
    { label: "Result JPEG", value: job?.status === "completed" ? "Generated" : "Not generated" },
    { label: "Job status", value: job ? statusText(job.status) : "Not started" },
    { label: "Warnings", value: `${job?.warnings?.length ?? 0}` },
  ];

  function handleSelectFrames() {
    inputRef.current?.click();
  }

  function clearQueue() {
    for (const previewUrl of previewUrlsRef.current) {
      URL.revokeObjectURL(previewUrl);
    }
    previewUrlsRef.current.clear();
    setItems([]);
    setActiveId(null);
    setUploadSummary(null);
    uploadedItemIdsRef.current = [];
    setUploadError(null);
    clearJobState();
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    enqueueFiles(event.target.files);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    enqueueFiles(event.dataTransfer.files);
  }

  function enqueueFiles(fileList: FileList | null) {
    if (!fileList?.length) {
      return;
    }

    const nextItems = Array.from(fileList).map(createQueueItem);

    startTransition(() => {
      setItems((current) => [...current, ...nextItems]);
      setActiveId((current) => current ?? nextItems[0]?.id ?? null);
      setUploadSummary(null);
      uploadedItemIdsRef.current = [];
      setUploadError(null);
      clearJobState();
    });

    for (const item of nextItems) {
      previewQueueRef.current = previewQueueRef.current
        .then(() => generatePreview(item))
        .catch(() => undefined);
    }
  }

  async function generatePreview(item: QueueItem) {
    if (item.extension === "cr3") {
      updateItem(item.id, {
        status: "generating",
        note: "Extracting embedded JPEG",
      });

      try {
        const embeddedPreview = await extractEmbeddedJpegFromRaw(item.file);
        const preview = await createPreviewJpeg(embeddedPreview.blob, 2048, 0.82);
        const previewUrl = URL.createObjectURL(preview.blob);
        previewUrlsRef.current.add(previewUrl);

        updateItem(item.id, {
          status: "ready",
          note: `CR3 preview extracted (${formatBytes(embeddedPreview.extractedBytes)})`,
          previewBlob: preview.blob,
          previewSize: preview.blob.size,
          previewUrl,
          width: preview.width,
          height: preview.height,
        });
      } catch (error) {
        updateItem(item.id, {
          status: "raw-pending",
          note:
            error instanceof Error
              ? `CR3 preview unavailable: ${error.message}`
              : "CR3 preview unavailable",
        });
      }
      return;
    }

    if (rawExtensions.has(item.extension)) {
      updateItem(item.id, {
        status: "raw-pending",
        note: "RAW embedded preview extraction is next",
      });
      return;
    }

    if (!browserDecodableTypes.has(item.file.type)) {
      updateItem(item.id, {
        status: "unsupported",
        note: "Browser preview decode is unavailable",
      });
      return;
    }

    updateItem(item.id, { status: "generating", note: "Generating JPEG preview" });

    try {
      const preview = await createPreviewJpeg(item.file, 2048, 0.82);
      const previewUrl = URL.createObjectURL(preview.blob);
      previewUrlsRef.current.add(previewUrl);

      updateItem(item.id, {
        status: "ready",
        note: "Preview ready",
        previewBlob: preview.blob,
        previewSize: preview.blob.size,
        previewUrl,
        width: preview.width,
        height: preview.height,
      });
    } catch (error) {
      updateItem(item.id, {
        status: "failed",
        note: error instanceof Error ? error.message : "Preview generation failed",
      });
    }
  }

  function updateItem(id: string, patch: Partial<QueueItem>) {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== id) {
          return item;
        }

        if (patch.previewUrl && item.previewUrl && item.previewUrl !== patch.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
          previewUrlsRef.current.delete(item.previewUrl);
        }

        return { ...item, ...patch };
      }),
    );
  }

  async function uploadPreviews(): Promise<PreviewUploadSummary | null> {
    const uploadableItems = items.filter((item) => item.previewBlob && item.status !== "uploaded");

    if (!uploadableItems.length) {
      return uploadSummary;
    }

    setUploadError(null);
    setUploadSummary(null);
    uploadedItemIdsRef.current = [];
    clearJobState(true);
    setItems((current) =>
      current.map((item) =>
        uploadableItems.some((uploadable) => uploadable.id === item.id)
          ? { ...item, status: "uploading", note: "Uploading preview JPEG" }
          : item,
      ),
    );

    const formData = new FormData();
    formData.append("sessionId", crypto.randomUUID());
    for (const item of uploadableItems) {
      formData.append("previews", item.previewBlob as Blob, `${withoutExtension(item.name)}.jpg`);
    }

    try {
      const result = await uploadPreviewImages(formData);
      setUploadSummary(result);
      const nextUploadedItemIds = uploadableItems.map((item) => item.id);
      uploadedItemIdsRef.current = nextUploadedItemIds;
      setItems((current) =>
        current.map((item) =>
          uploadableItems.some((uploadable) => uploadable.id === item.id)
            ? { ...item, status: "uploaded", note: "Preview uploaded" }
            : item,
        ),
      );
      return result;
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Preview upload failed");
      setItems((current) =>
        current.map((item) =>
          uploadableItems.some((uploadable) => uploadable.id === item.id)
            ? { ...item, status: "ready", note: "Preview ready" }
            : item,
        ),
      );
      return null;
    }
  }

  async function runComposite() {
    if (isJobBusy || !canRunJob) {
      return;
    }

    setIsStartingJob(true);
    setJobError(null);

    try {
      const summary = uploadSummary ?? (await uploadPreviews());
      if (!summary) {
        return;
      }

      const createdJob = await createPreviewJob(summary.sessionId, baseIndexForJob());
      setJob(createdJob);
      pollJob(createdJob.jobId);
    } catch (error) {
      setJobError(error instanceof Error ? error.message : "Job creation failed");
    } finally {
      setIsStartingJob(false);
    }
  }

  function baseIndexForJob() {
    const activeIndex = uploadedItemIdsRef.current.findIndex((id) => id === activeId);
    return activeIndex >= 0 ? activeIndex : 0;
  }

  function pollJob(jobId: string) {
    if (pollTimeoutRef.current !== null) {
      window.clearTimeout(pollTimeoutRef.current);
    }

    pollTimeoutRef.current = window.setTimeout(async () => {
      try {
        const nextJob = await fetchJob(jobId);
        setJob(nextJob);
        if (nextJob.status === "queued" || nextJob.status === "running") {
          pollJob(jobId);
        }
      } catch (error) {
        setJobError(error instanceof Error ? error.message : "Job status fetch failed");
      }
    }, jobPollIntervalMs);
  }

  function clearJobState(preserveStarting = false) {
    if (pollTimeoutRef.current !== null) {
      window.clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    setJob(null);
    setJobError(null);
    if (!preserveStarting) {
      setIsStartingJob(false);
    }
  }

  const jobTimeline = [
    {
      label: "Selected frames",
      value: `${items.length}`,
      tone: items.length > 0 ? "active" : "muted",
    },
    {
      label: "Preview generation",
      value: `${readyCount} ready`,
      tone: readyCount > 0 ? "active" : "muted",
    },
    {
      label: "RAW extraction",
      value: pendingRawCount > 0 ? `${pendingRawCount} pending` : "No pending RAW",
      tone: pendingRawCount > 0 ? "warn" : "muted",
    },
    {
      label: "Preview upload",
      value: uploadSummary ? `${uploadSummary.uploadedCount} uploaded` : "Not uploaded",
      tone: uploadSummary ? "active" : "muted",
    },
    {
      label: "Composite job",
      value: job ? statusText(job.status) : "Not started",
      tone: job?.status === "failed" ? "warn" : job ? "active" : "muted",
    },
  ];

  return (
    <main className="page-shell">
      <section className="hero-band">
        <div className="hero-copy">
          <p className="eyebrow">Stella Comp</p>
          <h1>Preview Ingest Workspace</h1>
          <p className="hero-text">
            Drop RAW or compressed frames, generate lightweight browser previews
            where possible, and upload preview JPEGs before the full RAW
            pipeline is introduced.
          </p>
        </div>
        <div className="hero-metrics" aria-label="Project status">
          <Metric label="Selected" value={`${items.length} frames`} />
          <Metric label="Preview payload" value={formatBytes(previewBytes)} />
          <Metric
            label="Compression"
            value={compressionRatio > 0 ? `${(compressionRatio * 100).toFixed(1)}%` : "Waiting"}
          />
        </div>
      </section>

      <section className="workspace-grid">
        <section className="panel panel-upload">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Ingest</p>
              <h2>Upload Queue</h2>
            </div>
            <div className="action-row">
              <button type="button" className="secondary-action" onClick={clearQueue}>
                Clear
              </button>
              <button type="button" className="primary-action" onClick={handleSelectFrames}>
                Select Frames
              </button>
            </div>
          </header>
          <input
            ref={inputRef}
            className="file-input"
            type="file"
            multiple
            accept=".cr2,.cr3,.dng,.nef,.arw,.raf,.orf,.rw2,.jpg,.jpeg,.png,.webp,.avif,.tif,.tiff,image/*"
            onChange={handleInputChange}
          />
          <div
            className={`dropzone${isDragging ? " dropzone-active" : ""}`}
            role="button"
            tabIndex={0}
            onClick={handleSelectFrames}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                handleSelectFrames();
              }
            }}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <p>Drop RAW, JPEG, PNG, or WebP frames here</p>
            <span>Browser-readable images are converted to preview JPEGs.</span>
          </div>
          <div className="table-list" role="table" aria-label="Queued images">
            {items.length === 0 ? (
              <div className="empty-state">No frames selected</div>
            ) : (
              items.map((item) => (
                <button
                  type="button"
                  className={`table-row table-button${activeItem?.id === item.id ? " table-row-active" : ""}`}
                  role="row"
                  key={item.id}
                  onClick={() => setActiveId(item.id)}
                >
                  <div className="row-main">
                    {item.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="queue-thumb" src={item.previewUrl} alt="" />
                    ) : (
                      <span className="queue-thumb queue-thumb-empty">{item.extension}</span>
                    )}
                    <div>
                      <p className="row-title">{item.name}</p>
                      <span className="row-meta">
                        {formatBytes(item.sourceSize)}
                        {item.previewSize ? ` -> ${formatBytes(item.previewSize)}` : ""}
                      </span>
                    </div>
                  </div>
                  <div className="row-state">
                    <span className={`pill pill-${item.status}`}>{statusLabel(item.status)}</span>
                    <span className="row-meta">{item.note}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="panel panel-settings">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Setup</p>
              <h2>Preview Settings</h2>
            </div>
          </header>
          <div className="settings-grid">
            <label className="field">
              <span>Reference frame</span>
              <select
                value={activeItem?.id ?? ""}
                onChange={(event) => setActiveId(event.target.value)}
              >
                <option value="" disabled>
                  Select preview
                </option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Preview size</span>
              <select defaultValue="2048">
                <option value="1024">1024 px</option>
                <option value="2048">2048 px</option>
                <option value="3072">3072 px</option>
              </select>
            </label>
            <label className="field">
              <span>JPEG quality</span>
              <select defaultValue="82">
                <option value="72">72</option>
                <option value="82">82</option>
                <option value="90">90</option>
              </select>
            </label>
            <label className="field">
              <span>Upload target</span>
              <select defaultValue="preview">
                <option value="preview">Preview JPEG only</option>
                <option value="source" disabled>
                  Full RAW later
                </option>
              </select>
            </label>
          </div>
          <div className="panel-note">
            RAW files stay queued until embedded preview extraction is added.
            Browser-readable files can be compressed and uploaded now.
          </div>
        </section>

        <section className="panel panel-preview">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Review</p>
              <h2>Preview Check</h2>
            </div>
            <button
              type="button"
              className="secondary-action"
              disabled={!uploadableCount}
              onClick={uploadPreviews}
            >
              Upload Previews
            </button>
          </header>
          <div className="preview-stage">
            {activeItem?.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="preview-image" src={activeItem.previewUrl} alt={activeItem.name} />
            ) : (
              <div className="preview-placeholder">
                <span>{activeItem ? activeItem.note : "Select frames to preview"}</span>
              </div>
            )}
          </div>
          <div className="preview-legend">
            <span>{activeItem?.name ?? "No frame"}</span>
            <span>
              {activeItem?.width && activeItem.height
                ? `${activeItem.width} x ${activeItem.height}`
                : "No dimensions"}
            </span>
            <span>
              {activeItem?.previewSize ? formatBytes(activeItem.previewSize) : "No preview JPEG"}
            </span>
          </div>
        </section>

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
            {jobTimeline.map((item) => (
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
          {job?.status === "failed" && job.error ? (
            <p className="inline-error">{job.error}</p>
          ) : null}
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
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function statusText(status: JobSummary["status"]) {
  switch (status) {
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
  }
}

function createQueueItem(file: File): QueueItem {
  const extension = getExtension(file.name);

  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
    file,
    name: file.name,
    extension,
    sourceSize: file.size,
    status: "queued",
    note: "Queued",
  };
}

function getExtension(fileName: string) {
  const extension = fileName.split(".").pop();
  return extension ? extension.toLowerCase() : "file";
}

function withoutExtension(fileName: string) {
  const index = fileName.lastIndexOf(".");
  return index > 0 ? fileName.slice(0, index) : fileName;
}

function formatBytes(bytes: number) {
  if (!bytes) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;

  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

function statusLabel(status: QueueStatus) {
  switch (status) {
    case "queued":
      return "Queued";
    case "generating":
      return "Generating";
    case "ready":
      return "Ready";
    case "raw-pending":
      return "RAW pending";
    case "unsupported":
      return "Unsupported";
    case "uploading":
      return "Uploading";
    case "uploaded":
      return "Uploaded";
    case "failed":
      return "Failed";
  }
}
