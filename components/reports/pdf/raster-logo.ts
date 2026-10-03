/** Longest side in pixels: 40pt on paper at about 300 dpi. */
const LOGO_PIXELS = 168

/**
 * The logo, redrawn by the browser as a plain PNG.
 *
 * react-pdf decodes images with its own small PNG and JPEG readers, which are
 * stricter than a browser's: a logo that shows everywhere in the app can fail
 * there without an error and leave a hole in the letterhead (measured with a
 * valid but unusual PNG). The browser has already proved it can decode this
 * image, so it does the decoding, and react-pdf is handed the one kind of file
 * it always reads. It is also scaled down to what 40pt of paper can show.
 *
 * Null when it cannot be drawn: a letterhead without a logo, not a gap.
 */
export async function rasterLogo(src: string | null): Promise<string | null> {
  if (!src) return null
  try {
    const image = new Image()
    image.src = src
    await image.decode()

    const longest = Math.max(image.naturalWidth, image.naturalHeight)
    const scale = Math.min(1, LOGO_PIXELS / longest)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))

    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}
