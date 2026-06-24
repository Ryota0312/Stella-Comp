import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  browserDecodableTypes,
  previewJpegQuality,
  previewMaxEdge,
  rawExtensions,
} from "../constants";
import {
  createPreviewJpeg,
  extractEmbeddedJpegFromRaw,
} from "../previewGeneration";
import type { QueueItem } from "../types";
import { createQueueItem, formatBytes } from "../utils";

type UseUploadQueueOptions = {
  onQueueChanged: () => void;
  onQueueCleared: () => void;
};

export function useUploadQueue({ onQueueChanged, onQueueCleared }: UseUploadQueueOptions) {
  const previewUrlsRef = useRef(new Set<string>());
  const previewQueueRef = useRef(Promise.resolve());
  const [items, setItems] = useState<QueueItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    return () => {
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
  const sourceBytes = items.reduce((sum, item) => sum + item.sourceSize, 0);
  const previewBytes = items.reduce((sum, item) => sum + (item.previewSize ?? 0), 0);
  const compressionRatio = sourceBytes > 0 && previewBytes > 0 ? previewBytes / sourceBytes : 0;

  const updateItem = useCallback((id: string, patch: Partial<QueueItem>) => {
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
  }, []);

  const generatePreview = useCallback(
    async (item: QueueItem) => {
      if (rawExtensions.has(item.extension)) {
        updateItem(item.id, {
          status: "generating",
          note: { code: "extractingEmbeddedJpeg" },
        });

        try {
          const embeddedPreview = await extractEmbeddedJpegFromRaw(item.file);
          const preview = await createPreviewJpeg(
            embeddedPreview.blob,
            previewMaxEdge,
            previewJpegQuality,
          );
          const previewUrl = URL.createObjectURL(preview.blob);
          previewUrlsRef.current.add(previewUrl);

          updateItem(item.id, {
            status: "ready",
            note: { code: "cr3PreviewExtracted", bytes: formatBytes(embeddedPreview.extractedBytes) },
            previewBlob: preview.blob,
            previewSize: preview.blob.size,
            previewUrl,
            width: preview.width,
            height: preview.height,
          });
        } catch (error) {
          updateItem(item.id, {
            status: "raw-pending",
            note: {
              code: item.extension === "cr3" ? "cr3PreviewUnavailable" : "rawPreviewUnavailable",
              detail: error instanceof Error ? error.message : undefined,
            },
          });
        }
        return;
      }

      if (!browserDecodableTypes.has(item.file.type)) {
        updateItem(item.id, {
          status: "unsupported",
          note: { code: "browserDecodeUnavailable" },
        });
        return;
      }

      updateItem(item.id, { status: "generating", note: { code: "generatingJpegPreview" } });

      try {
        const preview = await createPreviewJpeg(item.file, previewMaxEdge, previewJpegQuality);
        const previewUrl = URL.createObjectURL(preview.blob);
        previewUrlsRef.current.add(previewUrl);

        updateItem(item.id, {
          status: "ready",
          note: { code: "previewReady" },
          previewBlob: preview.blob,
          previewSize: preview.blob.size,
          previewUrl,
          width: preview.width,
          height: preview.height,
        });
      } catch (error) {
        updateItem(item.id, {
          status: "failed",
          note: {
            code: "previewGenerationFailed",
            detail: error instanceof Error ? error.message : undefined,
          },
        });
      }
    },
    [updateItem],
  );

  const enqueueFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList?.length) {
        return;
      }

      const nextItems = Array.from(fileList).map(createQueueItem);

      startTransition(() => {
        setItems((current) => [...current, ...nextItems]);
        setActiveId((current) => current ?? nextItems[0]?.id ?? null);
        onQueueChanged();
      });

      for (const item of nextItems) {
        previewQueueRef.current = previewQueueRef.current
          .then(() => generatePreview(item))
          .catch(() => undefined);
      }
    },
    [generatePreview, onQueueChanged],
  );

  const clearQueue = useCallback(() => {
    for (const previewUrl of previewUrlsRef.current) {
      URL.revokeObjectURL(previewUrl);
    }
    previewUrlsRef.current.clear();
    setItems([]);
    setActiveId(null);
    onQueueCleared();
  }, [onQueueCleared]);

  return {
    activeId,
    activeItem,
    clearQueue,
    compressionRatio,
    enqueueFiles,
    isDragging,
    items,
    pendingRawCount,
    previewBytes,
    readyCount,
    setActiveId,
    setIsDragging,
    setItems,
    sourceBytes,
  };
}
