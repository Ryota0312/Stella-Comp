export type RenderTransform = {
  affine?: number[];
  homography?: number[];
  transformModel?: string;
};

export function renderTransformedImage(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  transform: RenderTransform,
) {
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, targetWidth, targetHeight);

  if (transform.transformModel === "homography" && transform.homography?.length === 9) {
    renderHomography(context, image, sourceWidth, sourceHeight, targetWidth, targetHeight, transform.homography);
    return;
  }

  const affine = transform.affine?.length === 6 ? transform.affine : identityAffine();
  context.setTransform(affine[0], affine[3], affine[1], affine[4], affine[2], affine[5]);
  context.drawImage(image, 0, 0);
}

export function previewHomographyToSourceHomography(
  homography: number[],
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

  return multiply3x3(
    [1 / baseScaleX, 0, 0, 0, 1 / baseScaleY, 0, 0, 0, 1],
    multiply3x3(homography, [targetScaleX, 0, 0, 0, targetScaleY, 0, 0, 0, 1]),
  );
}

function renderHomography(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  homography: number[],
) {
  const inverse = invert3x3(homography);
  if (!inverse) {
    context.drawImage(image, 0, 0);
    return;
  }

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = sourceWidth;
  sourceCanvas.height = sourceHeight;
  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
  if (!sourceContext) {
    throw new Error("Canvas 2D context is unavailable");
  }
  sourceContext.drawImage(image, 0, 0);
  const source = sourceContext.getImageData(0, 0, sourceWidth, sourceHeight);
  const output = context.createImageData(targetWidth, targetHeight);

  for (let y = 0; y < targetHeight; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      const denominator = inverse[6] * x + inverse[7] * y + inverse[8];
      if (Math.abs(denominator) <= Number.EPSILON) {
        continue;
      }
      const sourceX = (inverse[0] * x + inverse[1] * y + inverse[2]) / denominator;
      const sourceY = (inverse[3] * x + inverse[4] * y + inverse[5]) / denominator;
      sampleBilinear(source.data, sourceWidth, sourceHeight, sourceX, sourceY, output.data, (y * targetWidth + x) * 4);
    }
  }

  context.putImageData(output, 0, 0);
}

function sampleBilinear(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  output: Uint8ClampedArray,
  offset: number,
) {
  if (x < 0 || y < 0 || x > width - 1 || y > height - 1) {
    return;
  }

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const dx = x - x0;
  const dy = y - y0;
  const topWeight = 1 - dy;
  const bottomWeight = dy;
  const leftWeight = 1 - dx;
  const rightWeight = dx;
  const topLeft = (y0 * width + x0) * 4;
  const topRight = (y0 * width + x1) * 4;
  const bottomLeft = (y1 * width + x0) * 4;
  const bottomRight = (y1 * width + x1) * 4;

  for (let channel = 0; channel < 4; channel += 1) {
    const top = source[topLeft + channel] * leftWeight + source[topRight + channel] * rightWeight;
    const bottom = source[bottomLeft + channel] * leftWeight + source[bottomRight + channel] * rightWeight;
    output[offset + channel] = Math.round(top * topWeight + bottom * bottomWeight);
  }
}

function invert3x3(matrix: number[]) {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(determinant) <= Number.EPSILON) {
    return null;
  }

  return [
    (e * i - f * h) / determinant,
    (c * h - b * i) / determinant,
    (b * f - c * e) / determinant,
    (f * g - d * i) / determinant,
    (a * i - c * g) / determinant,
    (c * d - a * f) / determinant,
    (d * h - e * g) / determinant,
    (b * g - a * h) / determinant,
    (a * e - b * d) / determinant,
  ];
}

function multiply3x3(left: number[], right: number[]) {
  return [
    left[0] * right[0] + left[1] * right[3] + left[2] * right[6],
    left[0] * right[1] + left[1] * right[4] + left[2] * right[7],
    left[0] * right[2] + left[1] * right[5] + left[2] * right[8],
    left[3] * right[0] + left[4] * right[3] + left[5] * right[6],
    left[3] * right[1] + left[4] * right[4] + left[5] * right[7],
    left[3] * right[2] + left[4] * right[5] + left[5] * right[8],
    left[6] * right[0] + left[7] * right[3] + left[8] * right[6],
    left[6] * right[1] + left[7] * right[4] + left[8] * right[7],
    left[6] * right[2] + left[7] * right[5] + left[8] * right[8],
  ];
}

function identityAffine() {
  return [1, 0, 0, 0, 1, 0];
}
