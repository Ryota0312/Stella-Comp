import type { QueueItem, QueueStatus } from "./types";
import type { JobSummary } from "./uploadApi";

export function createQueueItem(file: File): QueueItem {
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

export function getExtension(fileName: string) {
  const extension = fileName.split(".").pop();
  return extension ? extension.toLowerCase() : "file";
}

export function withoutExtension(fileName: string) {
  const index = fileName.lastIndexOf(".");
  return index > 0 ? fileName.slice(0, index) : fileName;
}

export function formatBytes(bytes: number) {
  if (!bytes) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;

  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

export function statusLabel(status: QueueStatus) {
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

export function statusText(status: JobSummary["status"]) {
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
