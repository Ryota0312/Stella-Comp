export type PreviewUploadSummary = {
  sessionId: string;
  uploaded: UploadedPreview[];
  uploadedCount: number;
  uploadedBytes: number;
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

function apiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080/api";
}
