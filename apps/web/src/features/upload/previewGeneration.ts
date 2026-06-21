type GeneratedPreview = {
  blob: Blob;
  width: number;
  height: number;
};

type RawPreviewResult = {
  blob: Blob;
  extractedBytes: number;
};

type WorkerResponse =
  | {
      id: string;
      ok: true;
      jpeg: ArrayBuffer;
      sourceStart: number;
      sourceEnd: number;
    }
  | {
      id: string;
      ok: false;
      error: string;
    };

let rawPreviewWorker: Worker | null = null;

export async function createPreviewJpeg(
  source: Blob,
  maxEdge: number,
  quality: number,
): Promise<GeneratedPreview> {
  const bitmap = await createImageBitmap(source, {
    imageOrientation: "from-image",
    resizeQuality: "high",
  });
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Canvas is unavailable");
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) {
          resolve(result);
        } else {
          reject(new Error("JPEG encoding failed"));
        }
      },
      "image/jpeg",
      quality,
    );
  });

  return { blob, width, height };
}

export async function extractEmbeddedJpegFromRaw(file: File): Promise<RawPreviewResult> {
  const id = crypto.randomUUID();
  const buffer = await file.arrayBuffer();
  const worker = getRawPreviewWorker();

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleError);
    };

    const handleMessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.id !== id) {
        return;
      }

      cleanup();

      if (!message.ok) {
        reject(new Error(message.error));
        return;
      }

      resolve({
        blob: new Blob([message.jpeg], { type: "image/jpeg" }),
        extractedBytes: message.sourceEnd - message.sourceStart,
      });
    };

    const handleError = (event: ErrorEvent) => {
      cleanup();
      reject(new Error(event.message || "RAW preview worker failed"));
    };

    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleError);
    worker.postMessage({ id, buffer }, [buffer]);
  });
}

function getRawPreviewWorker() {
  rawPreviewWorker ??= new Worker(new URL("./rawPreview.worker.ts", import.meta.url), {
    type: "module",
  });

  return rawPreviewWorker;
}

