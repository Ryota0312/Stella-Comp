type ExtractRequest = {
  id: string;
  buffer: ArrayBuffer;
};

type ExtractResponse =
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

type RawPreviewWorkerScope = {
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent<ExtractRequest>) => void,
  ) => void;
  postMessage: (message: ExtractResponse, transfer?: Transferable[]) => void;
};

const minimumPreviewBytes = 32 * 1024;
const workerScope = self as unknown as RawPreviewWorkerScope;

workerScope.addEventListener("message", (event: MessageEvent<ExtractRequest>) => {
  const { id, buffer } = event.data;

  try {
    const bytes = new Uint8Array(buffer);
    const candidate = findLargestJpeg(bytes);

    if (!candidate) {
      workerScope.postMessage({
        id,
        ok: false,
        error: "Embedded JPEG was not found",
      } satisfies ExtractResponse);
      return;
    }

    const jpeg = buffer.slice(candidate.start, candidate.end);
    workerScope.postMessage(
      {
        id,
        ok: true,
        jpeg,
        sourceStart: candidate.start,
        sourceEnd: candidate.end,
      } satisfies ExtractResponse,
      [jpeg],
    );
  } catch (error) {
    workerScope.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : "RAW preview extraction failed",
    } satisfies ExtractResponse);
  }
});

function findLargestJpeg(bytes: Uint8Array) {
  // Best-effort fallback for RAW files: scan for embedded JPEG byte ranges
  // without parsing camera-specific RAW container metadata.
  let best: { start: number; end: number } | null = null;
  let cursor = 0;

  while (cursor < bytes.length - 4) {
    const start = findJpegStart(bytes, cursor);
    if (start < 0) {
      break;
    }

    const end = findJpegEnd(bytes, start + 3);
    if (end < 0) {
      cursor = start + 3;
      continue;
    }

    const size = end - start;
    if (size >= minimumPreviewBytes && (!best || size > best.end - best.start)) {
      best = { start, end };
    }

    cursor = end;
  }

  return best;
}

function findJpegStart(bytes: Uint8Array, from: number) {
  for (let index = from; index < bytes.length - 2; index += 1) {
    if (bytes[index] === 0xff && bytes[index + 1] === 0xd8 && bytes[index + 2] === 0xff) {
      return index;
    }
  }

  return -1;
}

function findJpegEnd(bytes: Uint8Array, from: number) {
  for (let index = from; index < bytes.length - 1; index += 1) {
    if (bytes[index] === 0xff && bytes[index + 1] === 0xd9) {
      return index + 2;
    }
  }

  return -1;
}

export {};
