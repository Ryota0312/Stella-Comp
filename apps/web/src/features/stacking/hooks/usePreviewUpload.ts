import { useCallback, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { PreviewUploadSummary } from "../api/uploadApi";
import { uploadPreviewImages } from "../api/uploadApi";
import type { UploadCopy } from "../model/i18n";
import type { QueueItem } from "../model/types";
import { withoutExtension } from "../model/utils";

type UsePreviewUploadOptions = {
  copy: UploadCopy;
  items: QueueItem[];
  setItems: Dispatch<SetStateAction<QueueItem[]>>;
};

export function usePreviewUpload({ copy, items, setItems }: UsePreviewUploadOptions) {
  const uploadedItemIdsRef = useRef<string[]>([]);
  const [uploadSummary, setUploadSummary] = useState<PreviewUploadSummary | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadableItems = useMemo(
    () =>
      items.filter((item) => item.previewBlob && (!uploadSummary || item.status !== "uploaded")),
    [items, uploadSummary],
  );
  const uploadableCount = uploadableItems.length;

  const resetUploadState = useCallback(() => {
    setUploadSummary(null);
    uploadedItemIdsRef.current = [];
    setUploadError(null);
  }, []);

  const uploadPreviews = useCallback(async (): Promise<PreviewUploadSummary | null> => {
    if (!uploadableItems.length) {
      return uploadSummary;
    }

    setUploadError(null);
    setUploadSummary(null);
    uploadedItemIdsRef.current = [];
    setItems((current) =>
      current.map((item) =>
        uploadableItems.some((uploadable) => uploadable.id === item.id)
          ? { ...item, status: "uploading", note: { code: "uploadingPreviewJpeg" } }
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
      uploadedItemIdsRef.current = uploadableItems.map((item) => item.id);
      setItems((current) =>
        current.map((item) =>
          uploadableItems.some((uploadable) => uploadable.id === item.id)
            ? { ...item, status: "uploaded", note: { code: "previewUploaded" } }
            : item,
        ),
      );
      return result;
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : copy.queueNotes.previewUploadFailed);
      setItems((current) =>
        current.map((item) =>
          uploadableItems.some((uploadable) => uploadable.id === item.id)
            ? { ...item, status: "ready", note: { code: "previewReady" } }
            : item,
        ),
      );
      return null;
    }
  }, [copy, setItems, uploadSummary, uploadableItems]);

  return {
    resetUploadState,
    uploadError,
    uploadPreviews,
    uploadSummary,
    uploadableCount,
    uploadedItemIdsRef,
  };
}
