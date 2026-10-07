import sharp from "sharp";

export function usesNativeTraceUpscale(project) {
  // Garment projects always use ESRGAN, including both extraction modes.
  return project?.trace_type === "universal"
    && project.canvas_data?.universal_recovery?.mode === "UNIVERSAL_BACKGROUND_ONLY";
}

export async function resizeTraceForUpscale(inputBuffer) {
  const metadata = await sharp(inputBuffer).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Unable to read generated image dimensions");

  // Retain smooth interpolation for the existing Universal background path.
  return sharp(inputBuffer)
    .resize(metadata.width * 4, metadata.height * 4, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
}
