// Shared export selection: completed artwork only, never the uploaded reference.
export function finalArtworkRaster(project) {
  return project?.upscaled_image_url || (project?.generated_image_url !== 'REFUNDED' ? project?.generated_image_url : null) || null;
}

export function artworkExportName(name) {
  return String(name || 'Untitled_Design').replace(/[^a-zA-Z0-9_.-]/g, '_').replace(/^\.+/, '').slice(0, 100) || 'Untitled_Design';
}

export function artworkImageFormat(format = 'png') {
  if (format === 'jpeg') return 'jpg';
  if (!['png', 'jpg'].includes(format)) throw new Error('Choose PNG or JPEG.');
  return format;
}

export function artworkExportAssets(project, format = 'png') {
  const imageFormat = artworkImageFormat(format);
  const name = artworkExportName(project.name);
  const raster = finalArtworkRaster(project);
  return [
    raster && { url: raster, name: `${name}.${imageFormat}`, raster: true },
    project.svg_url && { url: project.svg_url, name: `${name}.svg`, raster: false },
  ].filter(Boolean);
}
