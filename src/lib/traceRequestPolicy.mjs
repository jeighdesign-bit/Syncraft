// Leave time for the server's 300-second run and its response to reach the UI.
export const TRACE_REQUEST_TIMEOUT_MS = 330_000;

export function canResumeTraceUpscale(project) {
  return Boolean(project?.generated_image_url && project.generated_image_url !== "REFUNDED"
    && !project.upscaled_image_url && !project.svg_url);
}

export function traceTimeoutMessage(label) {
  if (label === "step2" || label === "save2") {
    return "HD upscaling timed out. Your flat artwork is saved. Resume HD Upscale for free; no need to generate again.";
  }
  if (label === "step3") {
    return "Vectorization timed out. Your upscale is saved. Retry Vector SVG for free.";
  }
  return "The request took too long. Please try again. Your saved project is still available.";
}

export function traceConnectionMessage(label) {
  if (label === 'step3') {
    return 'The SVG connection was interrupted. Your upscale is saved. Retry Vector SVG for free.';
  }
  if (label === 'step2' || label === 'save2') {
    return 'The upscale connection was interrupted. Your flat artwork is saved. Resume HD Upscale for free.';
  }
  return 'The server connection was interrupted. Your saved project is still available. Please try again.';
}
