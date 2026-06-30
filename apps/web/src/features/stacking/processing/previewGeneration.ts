type GeneratedPreview = {
  blob: Blob;
  width: number;
  height: number;
};

export type DevelopedRawImage = {
  imageData: ImageData;
  width: number;
  height: number;
  elapsedMs: number;
};

type RawPreviewResult = {
  blob: Blob;
  extractedBytes: number;
  source: "libraw-thumbnail" | "embedded-jpeg-scan";
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

export async function developRawWithLibRaw(source: File): Promise<DevelopedRawImage> {
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
    const imageDataBytes: ImageDataArray = new Uint8ClampedArray(rgba.length);
    imageDataBytes.set(rgba);

    return {
      imageData: new ImageData(imageDataBytes, decoded.width, decoded.height),
      width: decoded.width,
      height: decoded.height,
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

export async function extractRawPreviewFromRaw(file: File): Promise<RawPreviewResult> {
  try {
    return await extractLibRawThumbnailJpeg(file);
  } catch {
    // Best-effort fallback: scan for embedded JPEG bytes without parsing the
    // RAW container when LibRaw cannot provide a directly usable JPEG thumbnail.
  }

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
        source: "embedded-jpeg-scan",
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

async function extractLibRawThumbnailJpeg(file: File): Promise<RawPreviewResult> {
  const { default: LibRaw } = await import("libraw-wasm");
  const raw = new LibRaw();

  try {
    const buffer = await file.arrayBuffer();
    await raw.open(new Uint8Array(buffer));
    const thumbnail = await raw.thumbnailData();

    if (!thumbnail?.data?.byteLength) {
      throw new Error("LibRaw thumbnail was not found");
    }

    if (thumbnail.format !== "jpeg") {
      throw new Error(`LibRaw thumbnail format is ${thumbnail.format}`);
    }

    const jpegBuffer = new ArrayBuffer(thumbnail.data.byteLength);
    new Uint8Array(jpegBuffer).set(thumbnail.data);

    return {
      blob: new Blob([jpegBuffer], { type: "image/jpeg" }),
      extractedBytes: jpegBuffer.byteLength,
      source: "libraw-thumbnail",
    };
  } finally {
    raw.dispose();
  }
}

function getRawPreviewWorker() {
  rawPreviewWorker ??= new Worker(new URL("./rawPreview.worker.ts", import.meta.url), {
    type: "module",
  });

  return rawPreviewWorker;
}
