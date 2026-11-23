import sharp from "sharp";

type AvifOptions = {
  maxDimension: number;
  quality?: number;
};

export async function convertImageToAvif(
  image: Uint8Array,
  { maxDimension, quality = 65 }: AvifOptions,
) {
  const { data } = await sharp(image, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({
      width: maxDimension,
      height: maxDimension,
      fit: "inside",
      withoutEnlargement: true,
    })
    .avif({ quality, effort: 5 })
    .toBuffer({ resolveWithObject: true });

  if (data.length < 16 || data.toString("ascii", 4, 8) !== "ftyp" ||
      !["avif", "avis"].includes(data.toString("ascii", 8, 12))) {
    throw new Error("Image encoding did not produce a valid AVIF file.");
  }
  return data;
}
