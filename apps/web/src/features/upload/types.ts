export type QueueStatus =
  | "queued"
  | "generating"
  | "ready"
  | "raw-pending"
  | "unsupported"
  | "uploading"
  | "uploaded"
  | "failed";

export type QueueNote =
  | { code: "queued" }
  | { code: "developingRawWithLibRaw" }
  | { code: "rawPreviewDeveloped"; width: number; height: number; elapsedMs: number }
  | { code: "rawPreviewUnavailable"; detail?: string }
  | { code: "rawPreviewFallbackToEmbeddedJpeg"; detail?: string }
  | { code: "extractingEmbeddedJpeg" }
  | { code: "cr3PreviewExtracted"; bytes: string }
  | { code: "cr3PreviewUnavailable"; detail?: string }
  | { code: "browserDecodeUnavailable" }
  | { code: "generatingJpegPreview" }
  | { code: "previewReady" }
  | { code: "previewGenerationFailed"; detail?: string }
  | { code: "uploadingPreviewJpeg" }
  | { code: "previewUploaded" };

export type QueueItem = {
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
  note: QueueNote;
};

export type TimelineTone = "active" | "muted" | "warn";

export type ClientCompositeStatus =
  | "idle"
  | "uploading"
  | "estimating"
  | "stacking"
  | "completed"
  | "failed";

export type RawCompositeStatus =
  | "idle"
  | "developing"
  | "stacking"
  | "completed"
  | "failed";

export type CompositeProgress = {
  current: number;
  total: number;
  label: string;
};

export type TimelineItem = {
  label: string;
  value: string;
  tone: TimelineTone;
};

export type ResultRow = {
  label: string;
  value: string;
};

export type WorkspaceStep = "upload" | "preview" | "source";

export type CompositeOutput = {
  previewBlob: Blob;
  downloadBlob: Blob;
  downloadFileName: string;
  label: "png" | "tiff";
};
