type EncodeTiffRgb16Options = {
  width: number;
  height: number;
  red: Float32Array;
  green: Float32Array;
  blue: Float32Array;
  counts: Uint16Array;
};

const tiffHeaderSize = 8;
const ifdEntryCount = 10;
const ifdSize = 2 + ifdEntryCount * 12 + 4;
const bitsPerSampleSize = 6;
const samplesPerPixel = 3;
const bytesPerSample = 2;

export function encodeTiffRgb16({
  width,
  height,
  red,
  green,
  blue,
  counts,
}: EncodeTiffRgb16Options): Blob {
  const pixelCount = width * height;
  const imageByteLength = pixelCount * samplesPerPixel * bytesPerSample;
  const bitsPerSampleOffset = tiffHeaderSize + ifdSize;
  const imageOffset = bitsPerSampleOffset + bitsPerSampleSize;
  const buffer = new ArrayBuffer(imageOffset + imageByteLength);
  const view = new DataView(buffer);

  view.setUint8(0, 0x49);
  view.setUint8(1, 0x49);
  view.setUint16(2, 42, true);
  view.setUint32(4, tiffHeaderSize, true);
  view.setUint16(tiffHeaderSize, ifdEntryCount, true);

  let entryOffset = tiffHeaderSize + 2;
  const writeEntry = (tag: number, type: number, count: number, value: number) => {
    view.setUint16(entryOffset, tag, true);
    view.setUint16(entryOffset + 2, type, true);
    view.setUint32(entryOffset + 4, count, true);
    view.setUint32(entryOffset + 8, value, true);
    entryOffset += 12;
  };

  writeEntry(256, 4, 1, width);
  writeEntry(257, 4, 1, height);
  writeEntry(258, 3, samplesPerPixel, bitsPerSampleOffset);
  writeEntry(259, 3, 1, 1);
  writeEntry(262, 3, 1, 2);
  writeEntry(273, 4, 1, imageOffset);
  writeEntry(277, 3, 1, samplesPerPixel);
  writeEntry(278, 4, 1, height);
  writeEntry(279, 4, 1, imageByteLength);
  writeEntry(284, 3, 1, 1);
  view.setUint32(entryOffset, 0, true);
  view.setUint16(bitsPerSampleOffset, 16, true);
  view.setUint16(bitsPerSampleOffset + 2, 16, true);
  view.setUint16(bitsPerSampleOffset + 4, 16, true);

  for (let pixel = 0, offset = imageOffset; pixel < pixelCount; pixel += 1, offset += 6) {
    const count = counts[pixel] || 1;
    view.setUint16(offset, toUint16(red[pixel] / count), true);
    view.setUint16(offset + 2, toUint16(green[pixel] / count), true);
    view.setUint16(offset + 4, toUint16(blue[pixel] / count), true);
  }

  return new Blob([buffer], { type: "image/tiff" });
}

function toUint16(value: number) {
  return Math.max(0, Math.min(65535, Math.round(value * 257)));
}
