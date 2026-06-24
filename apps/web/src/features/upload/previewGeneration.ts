type GeneratedPreview = {
  blob: Blob;
  width: number;
  height: number;
};

type RawDevelopedPreview = GeneratedPreview & {
  sourceWidth: number;
  sourceHeight: number;
  elapsedMs: number;
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

export async function createPreviewJpegFromRawWithLibRaw(
  source: File,
  maxEdge: number,
  quality: number,
): Promise<RawDevelopedPreview> {
  const startedAt = performance.now();
  const { default: LibRaw } = await import("libraw-wasm");
  const raw = new LibRaw();

  try {
    const buffer = await source.arrayBuffer();
    await raw.open(new Uint8Array(buffer), {
      outputBps: 8,
      useCameraWb: true,
      noAutoBright: true,
      userFlip: -1,
    });

    const decoded = await raw.imageData();
    if (!decoded) {
      throw new Error("LibRaw did not return image data");
    }

    const rgba = toRgba8(decoded.data, decoded.width, decoded.height, decoded.colors);
    const preview = await createPreviewJpegFromRgba(
      rgba,
      decoded.width,
      decoded.height,
      maxEdge,
      quality,
    );

    return {
      ...preview,
      sourceWidth: decoded.width,
      sourceHeight: decoded.height,
      elapsedMs: Math.round(performance.now() - startedAt),
    };
  } finally {
    raw.dispose();
  }
}

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

async function createPreviewJpegFromRgba(
  rgba: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  maxEdge: number,
  quality: number,
): Promise<GeneratedPreview> {
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = sourceWidth;
  sourceCanvas.height = sourceHeight;
  const sourceContext = sourceCanvas.getContext("2d");
  if (!sourceContext) {
    throw new Error("Canvas is unavailable");
  }
  const imageDataBytes: ImageDataArray = new Uint8ClampedArray(rgba.length);
  imageDataBytes.set(rgba);
  sourceContext.putImageData(new ImageData(imageDataBytes, sourceWidth, sourceHeight), 0, 0);

  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const previewCanvas = document.createElement("canvas");
  previewCanvas.width = width;
  previewCanvas.height = height;
  const previewContext = previewCanvas.getContext("2d");
  if (!previewContext) {
    throw new Error("Canvas is unavailable");
  }
  previewContext.drawImage(sourceCanvas, 0, 0, width, height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    previewCanvas.toBlob(
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

function toRgba8(
  data: Uint8Array | Uint16Array,
  width: number,
  height: number,
  colors: number,
): Uint8ClampedArray {
  const pixelCount = width * height;
  const rgba = new Uint8ClampedArray(pixelCount * 4);
  const normalize = data instanceof Uint16Array ? (value: number) => value >> 8 : (value: number) => value;

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const inputOffset = pixel * colors;
    const outputOffset = pixel * 4;

    if (colors === 1) {
      const value = normalize(data[inputOffset] ?? 0);
      rgba[outputOffset] = value;
      rgba[outputOffset + 1] = value;
      rgba[outputOffset + 2] = value;
    } else {
      rgba[outputOffset] = normalize(data[inputOffset] ?? 0);
      rgba[outputOffset + 1] = normalize(data[inputOffset + 1] ?? 0);
      rgba[outputOffset + 2] = normalize(data[inputOffset + 2] ?? 0);
    }

    rgba[outputOffset + 3] = colors >= 4 ? normalize(data[inputOffset + 3] ?? 255) : 255;
  }

  return rgba;
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
