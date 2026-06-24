export type PreviewUploadSummary = {
  sessionId: string;
  uploaded: UploadedPreview[];
  uploadedCount: number;
  uploadedBytes: number;
};

export type JobStatus = "queued" | "running" | "completed" | "failed";

export type ProcessingWarning = {
  code: string;
  message: string;
};

export type JobSummary = {
  jobId: string;
  status: JobStatus;
  sessionId: string;
  baseImageIndex: number;
  previewPaths: string[];
  outputPath?: string;
  error?: string;
  warnings?: ProcessingWarning[];
  createdAt: string;
  updatedAt: string;
};

export type ImageTransform = {
  imageIndex: number;
  affine: number[];
  estimated: boolean;
};

export type PreviewAlignmentSummary = {
  sessionId: string;
  baseImageIndex: number;
  previewPaths: string[];
  transforms: ImageTransform[];
  warnings?: ProcessingWarning[];
};

export type PreviewAlignmentJobSummary = PreviewAlignmentSummary & {
  alignmentJobId: string;
  status: JobStatus;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

type UploadedPreview = {
  fieldName: string;
  fileName: string;
  path: string;
  size: number;
};

export async function uploadPreviewImages(formData: FormData): Promise<PreviewUploadSummary> {
  const response = await fetch(`${apiBaseUrl()}/preview-uploads`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Preview upload failed");
  }

  return (await response.json()) as PreviewUploadSummary;
}

export async function createPreviewJob(
  sessionId: string,
  baseImageIndex: number,
): Promise<JobSummary> {
  const response = await fetch(`${apiBaseUrl()}/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sessionId, baseImageIndex }),
  });

  if (!response.ok) {
    throw new Error(await responseError(response, "Job creation failed"));
  }

  return (await response.json()) as JobSummary;
}

export async function estimatePreviewAlignments(
  sessionId: string,
  baseImageIndex: number,
): Promise<PreviewAlignmentSummary> {
  const created = await createPreviewAlignmentJob(sessionId, baseImageIndex);
  const completed = await waitForPreviewAlignmentJob(created.alignmentJobId);

  return {
    sessionId: completed.sessionId,
    baseImageIndex: completed.baseImageIndex,
    previewPaths: completed.previewPaths,
    transforms: completed.transforms,
    warnings: completed.warnings,
  };
}

async function createPreviewAlignmentJob(
  sessionId: string,
  baseImageIndex: number,
): Promise<PreviewAlignmentJobSummary> {
  const response = await fetch(`${apiBaseUrl()}/preview-alignments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sessionId, baseImageIndex }),
  });

  if (!response.ok) {
    throw new Error(await responseError(response, "Preview alignment failed"));
  }

  return (await response.json()) as PreviewAlignmentJobSummary;
}

async function fetchPreviewAlignmentJob(
  alignmentJobId: string,
): Promise<PreviewAlignmentJobSummary> {
  const response = await fetch(`${apiBaseUrl()}/preview-alignments/${alignmentJobId}`);

  if (!response.ok) {
    throw new Error(await responseError(response, "Preview alignment status fetch failed"));
  }

  return (await response.json()) as PreviewAlignmentJobSummary;
}

async function waitForPreviewAlignmentJob(
  alignmentJobId: string,
): Promise<PreviewAlignmentJobSummary> {
  const deadline = Date.now() + 5 * 60 * 1000;

  while (Date.now() < deadline) {
    const job = await fetchPreviewAlignmentJob(alignmentJobId);
    if (job.status === "completed") {
      return job;
    }
    if (job.status === "failed") {
      throw new Error(job.error ?? "Preview alignment failed");
    }

    await sleep(1000);
  }

  throw new Error("Preview alignment timed out");
}

export async function fetchJob(jobId: string): Promise<JobSummary> {
  const response = await fetch(`${apiBaseUrl()}/jobs/${jobId}`);

  if (!response.ok) {
    throw new Error(await responseError(response, "Job status fetch failed"));
  }

  return (await response.json()) as JobSummary;
}

export function jobResultUrl(jobId: string) {
  return `${apiBaseUrl()}/jobs/${jobId}/result`;
}

export function apiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080/api";
}

async function responseError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
