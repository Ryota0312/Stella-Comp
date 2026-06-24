import { rawExtensions } from "./constants";
import { developRawWithLibRaw } from "./previewGeneration";
import type { QueueItem } from "./types";
import type { ImageTransform } from "./uploadApi";

type StackSourceOptions = {
  items: QueueItem[];
  itemIds: string[];
  transforms: ImageTransform[];
  baseImageIndex: number;
  onProgress?: (progress: { current: number; total: number; label: string }) => void;
};

type LoadedSourceImage = {
  image: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
};

export async function stackSourceImages({
  items,
  itemIds,
  onProgress,
  transforms,
  baseImageIndex,
}: StackSourceOptions): Promise<Blob> {
  const orderedItems = itemIds
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is QueueItem => Boolean(item?.previewBlob));
  if (orderedItems.length === 0) {
    throw new Error("No source images are available for RAW stacking");
  }
  if (baseImageIndex < 0 || baseImageIndex >= orderedItems.length) {
    throw new Error("Base image index is out of range");
  }

  const totalProgress = orderedItems.length * 2 + 2;
  let completedProgress = 0;
  const reportProgress = (label: string) => {
    onProgress?.({ current: completedProgress, total: totalProgress, label });
  };

  reportProgress(orderedItems[baseImageIndex].name);
  const baseSource = await loadSourceImage(orderedItems[baseImageIndex]);
  completedProgress += 1;
  reportProgress(orderedItems[baseImageIndex].name);
  const basePreviewSize = previewSize(orderedItems[baseImageIndex]);
  const width = baseSource.width;
  const height = baseSource.height;
  baseSource.close();

  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = width;
  sampleCanvas.height = height;
  const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });
  if (!sampleContext) {
    throw new Error("Canvas 2D context is unavailable");
  }

  const pixelCount = width * height;
  const red = new Float32Array(pixelCount);
  const green = new Float32Array(pixelCount);
  const blue = new Float32Array(pixelCount);
  const counts = new Uint16Array(pixelCount);
  const transformsByIndex = new Map(transforms.map((transform) => [transform.imageIndex, transform]));

  for (const [index, item] of orderedItems.entries()) {
    reportProgress(item.name);
    const source = await loadSourceImage(item);
    completedProgress += 1;
    reportProgress(item.name);
    const targetPreviewSize = previewSize(item);
    const transform = transformsByIndex.get(index);
    const affine = transform?.affine.length === 6 ? transform.affine : identityAffine();
    const sourceAffine =
      index === baseImageIndex
        ? identityAffine()
        : previewAffineToSourceAffine(affine, {
            basePreviewHeight: basePreviewSize.height,
            basePreviewWidth: basePreviewSize.width,
            baseSourceHeight: height,
            baseSourceWidth: width,
            targetPreviewHeight: targetPreviewSize.height,
            targetPreviewWidth: targetPreviewSize.width,
            targetSourceHeight: source.height,
            targetSourceWidth: source.width,
          });

    sampleContext.setTransform(1, 0, 0, 1, 0, 0);
    sampleContext.clearRect(0, 0, width, height);
    sampleContext.setTransform(
      sourceAffine[0],
      sourceAffine[3],
      sourceAffine[1],
      sourceAffine[4],
      sourceAffine[2],
      sourceAffine[5],
    );
    sampleContext.drawImage(source.image, 0, 0);
    source.close();

    const { data } = sampleContext.getImageData(0, 0, width, height);
    for (let pixel = 0, offset = 0; pixel < pixelCount; pixel += 1, offset += 4) {
      if (data[offset + 3] === 0) {
        continue;
      }
      red[pixel] += data[offset];
      green[pixel] += data[offset + 1];
      blue[pixel] += data[offset + 2];
      counts[pixel] += 1;
    }
    completedProgress += 1;
    reportProgress(item.name);
  }

  reportProgress("PNG");
  const output = sampleContext.createImageData(width, height);
  for (let pixel = 0, offset = 0; pixel < pixelCount; pixel += 1, offset += 4) {
    const count = counts[pixel];
    if (count === 0) {
      output.data[offset + 3] = 255;
      continue;
    }
    output.data[offset] = Math.round(red[pixel] / count);
    output.data[offset + 1] = Math.round(green[pixel] / count);
    output.data[offset + 2] = Math.round(blue[pixel] / count);
    output.data[offset + 3] = 255;
  }

  sampleContext.setTransform(1, 0, 0, 1, 0, 0);
  sampleContext.putImageData(output, 0, 0);

  const blob = await new Promise<Blob | null>((resolve) => {
    sampleCanvas.toBlob(resolve, "image/png");
  });
  if (!blob) {
    throw new Error("RAW composite PNG export failed");
  }

  completedProgress += 1;
  reportProgress("PNG");
  return blob;
}

function previewAffineToSourceAffine(
  affine: number[],
  sizes: {
    basePreviewWidth: number;
    basePreviewHeight: number;
    baseSourceWidth: number;
    baseSourceHeight: number;
    targetPreviewWidth: number;
    targetPreviewHeight: number;
    targetSourceWidth: number;
    targetSourceHeight: number;
  },
) {
  const targetScaleX = sizes.targetPreviewWidth / sizes.targetSourceWidth;
  const targetScaleY = sizes.targetPreviewHeight / sizes.targetSourceHeight;
  const baseScaleX = sizes.basePreviewWidth / sizes.baseSourceWidth;
  const baseScaleY = sizes.basePreviewHeight / sizes.baseSourceHeight;

  return [
    (affine[0] * targetScaleX) / baseScaleX,
    (affine[1] * targetScaleY) / baseScaleX,
    affine[2] / baseScaleX,
    (affine[3] * targetScaleX) / baseScaleY,
    (affine[4] * targetScaleY) / baseScaleY,
    affine[5] / baseScaleY,
  ];
}

function previewSize(item: QueueItem) {
  if (!item.width || !item.height) {
    throw new Error(`Preview size is unavailable for ${item.name}`);
  }

  return { width: item.width, height: item.height };
}

function identityAffine() {
  return [1, 0, 0, 0, 1, 0];
}

async function loadSourceImage(item: QueueItem): Promise<LoadedSourceImage> {
  if (rawExtensions.has(item.extension)) {
    const developed = await developRawWithLibRaw(item.file);
    const bitmap = await createImageBitmap(developed.imageData);
    return {
      image: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  }

  const bitmap = await createImageBitmap(item.file, {
    imageOrientation: "from-image",
    resizeQuality: "high",
  });
  return {
    image: bitmap,
    width: bitmap.width,
    height: bitmap.height,
    close: () => bitmap.close(),
  };
}
