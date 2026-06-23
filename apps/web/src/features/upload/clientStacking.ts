import type { QueueItem } from "./types";
import type { ImageTransform } from "./uploadApi";

type StackPreviewOptions = {
  items: QueueItem[];
  itemIds: string[];
  transforms: ImageTransform[];
  baseImageIndex: number;
};

type LoadedCanvasImage = {
  image: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
};

export async function stackPreviewImages({
  items,
  itemIds,
  transforms,
  baseImageIndex,
}: StackPreviewOptions): Promise<Blob> {
  const orderedItems = itemIds
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is QueueItem => Boolean(item?.previewBlob));
  if (orderedItems.length === 0) {
    throw new Error("No preview images are available for client-side stacking");
  }
  if (baseImageIndex < 0 || baseImageIndex >= orderedItems.length) {
    throw new Error("Base image index is out of range");
  }

  const baseImage = await loadCanvasImage(orderedItems[baseImageIndex].previewBlob as Blob);
  const width = baseImage.width;
  const height = baseImage.height;
  baseImage.close();

  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = width;
  sampleCanvas.height = height;
  const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });
  if (!sampleContext) {
    throw new Error("Canvas 2D context is unavailable");
  }

  const pixelCount = width * height;
  const red = new Float64Array(pixelCount);
  const green = new Float64Array(pixelCount);
  const blue = new Float64Array(pixelCount);
  const counts = new Uint16Array(pixelCount);
  const transformsByIndex = new Map(transforms.map((transform) => [transform.imageIndex, transform]));

  for (const [index, item] of orderedItems.entries()) {
    const loadedImage = await loadCanvasImage(item.previewBlob as Blob);
    const transform = transformsByIndex.get(index);
    const affine = transform?.affine.length === 6 ? transform.affine : identityAffine();

    sampleContext.setTransform(1, 0, 0, 1, 0, 0);
    sampleContext.clearRect(0, 0, width, height);
    sampleContext.setTransform(affine[0], affine[3], affine[1], affine[4], affine[2], affine[5]);
    sampleContext.drawImage(loadedImage.image, 0, 0);
    loadedImage.close();

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
  }

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
    throw new Error("Composite PNG export failed");
  }

  return blob;
}

function identityAffine() {
  return [1, 0, 0, 0, 1, 0];
}

async function loadCanvasImage(blob: Blob): Promise<LoadedCanvasImage> {
  if ("createImageBitmap" in window) {
    const bitmap = await createImageBitmap(blob);
    return {
      image: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  }

  const imageUrl = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = "async";
  image.src = imageUrl;
  await image.decode();

  return {
    image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    close: () => URL.revokeObjectURL(imageUrl),
  };
}
