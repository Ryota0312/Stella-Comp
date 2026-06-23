export type QueueStatus =
  | "queued"
  | "generating"
  | "ready"
  | "raw-pending"
  | "unsupported"
  | "uploading"
  | "uploaded"
  | "failed";

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
  note: string;
};

export type TimelineTone = "active" | "muted" | "warn";

export type TimelineItem = {
  label: string;
  value: string;
  tone: TimelineTone;
};

export type ResultRow = {
  label: string;
  value: string;
};
