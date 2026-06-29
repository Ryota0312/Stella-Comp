import type { ImageTransform } from "../api/uploadApi";
import { rawExtensions } from "../model/constants";
import type { CompositeOutput, QueueItem, SourceExportFormat } from "../model/types";
import { developRawWithLibRaw } from "./previewGeneration";
import { encodeTiffRgb16 } from "./tiffEncoding";
import { previewHomographyToSourceHomography, renderTransformedImage } from "./transformRendering";

type StackSourceOptions = {
  items: QueueItem[];
  itemIds: string[];
  transforms: ImageTransform[];
  baseImageIndex: number;
  exportFormat: SourceExportFormat;
  excludedImageIndexes?: Set<number>;
  onProgress?: (progress: { current: number; total: number; label: string }) => void;
};

type LoadedSourceImage = {
  image: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
};

export async function stackSourceImages({
  exportFormat,
  excludedImageIndexes = new Set(),
  items,
  itemIds,
  onProgress,
  transforms,
  baseImageIndex,
}: StackSourceOptions): Promise<CompositeOutput> {
  const orderedItems = itemIds
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is QueueItem => Boolean(item?.previewBlob));
  if (orderedItems.length === 0) {
    throw new Error("No source images are available for RAW stacking");
  }
  if (baseImageIndex < 0 || baseImageIndex >= orderedItems.length) {
    throw new Error("Base image index is out of range");
  }

  const usedItemsCount = orderedItems.filter((_, index) => !excludedImageIndexes.has(index)).length;
  const totalProgress = usedItemsCount * 2 + 2;
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
  let referencePreviewBlob: Blob | null = null;

  for (const [index, item] of orderedItems.entries()) {
    if (excludedImageIndexes.has(index)) {
      continue;
    }

    reportProgress(item.name);
    const source = await loadSourceImage(item);
    completedProgress += 1;
    reportProgress(item.name);
    const targetPreviewSize = previewSize(item);
    const transform = transformsByIndex.get(index);
    const affine = transform?.affine.length === 6 ? transform.affine : identityAffine();
    const sizeMapping = {
      basePreviewHeight: basePreviewSize.height,
      basePreviewWidth: basePreviewSize.width,
      baseSourceHeight: height,
      baseSourceWidth: width,
      targetPreviewHeight: targetPreviewSize.height,
      targetPreviewWidth: targetPreviewSize.width,
      targetSourceHeight: source.height,
      targetSourceWidth: source.width,
    };
    const sourceTransform =
      index === baseImageIndex
        ? {
            affine: identityAffine(),
            homography: identityHomography(),
            transformModel: transform?.transformModel ?? "affine",
          }
        : {
            affine: previewAffineToSourceAffine(affine, sizeMapping),
            homography:
              transform?.homography?.length === 9
                ? previewHomographyToSourceHomography(transform.homography, sizeMapping)
                : identityHomography(),
            transformModel: transform?.transformModel ?? "affine",
          };

    renderTransformedImage(sampleContext, source.image, source.width, source.height, width, height, sourceTransform);
    source.close();

    if (index === baseImageIndex) {
      referencePreviewBlob = await canvasToPngBlob(sampleCanvas, "RAW reference preview PNG export failed");
    }

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

  const outputLabel = outputLabelForFormat(exportFormat);
  reportProgress(outputLabel);
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

  const previewBlob = await canvasToPngBlob(sampleCanvas, "RAW composite preview PNG export failed");
  const downloadBlob = await exportDownloadBlob({
    canvas: sampleCanvas,
    counts,
    exportFormat,
    height,
    red,
    green,
    blue,
    previewBlob,
    width,
  });

  completedProgress += 1;
  reportProgress(outputLabel);
  return {
    previewBlob,
    referencePreviewBlob: referencePreviewBlob ?? undefined,
    downloadBlob,
    downloadFileName: downloadFileNameForFormat(exportFormat),
    label: exportFormat,
  };
}

async function canvasToPngBlob(canvas: HTMLCanvasElement, errorMessage: string) {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });
  if (!blob) {
    throw new Error(errorMessage);
  }

  return blob;
}

async function canvasToJpegBlob(canvas: HTMLCanvasElement, errorMessage: string) {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", 0.92);
  });
  if (!blob) {
    throw new Error(errorMessage);
  }

  return blob;
}

async function exportDownloadBlob({
  canvas,
  counts,
  exportFormat,
  height,
  previewBlob,
  red,
  green,
  blue,
  width,
}: {
  canvas: HTMLCanvasElement;
  counts: Uint16Array;
  exportFormat: SourceExportFormat;
  height: number;
  previewBlob: Blob;
  red: Float32Array;
  green: Float32Array;
  blue: Float32Array;
  width: number;
}) {
  if (exportFormat === "tiff") {
    return encodeTiffRgb16({ width, height, red, green, blue, counts });
  }
  if (exportFormat === "jpeg") {
    return canvasToJpegBlob(canvas, "RAW composite JPEG export failed");
  }

  return previewBlob;
}

function downloadFileNameForFormat(exportFormat: SourceExportFormat) {
  switch (exportFormat) {
    case "jpeg":
      return "stella-comp-source-stack.jpg";
    case "png":
      return "stella-comp-source-stack.png";
    case "tiff":
      return "stella-comp-source-stack.tiff";
  }
}

function outputLabelForFormat(exportFormat: SourceExportFormat) {
  switch (exportFormat) {
    case "jpeg":
      return "JPEG";
    case "png":
      return "PNG";
    case "tiff":
      return "TIFF";
  }
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

function identityHomography() {
  return [1, 0, 0, 0, 1, 0, 0, 0, 1];
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
