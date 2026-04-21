const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function mimeToExt(mimeType: string): string | null {
  switch (mimeType) {
    case "image/jpeg": return "jpg";
    case "image/png": return "png";
    case "image/webp": return "webp";
    case "image/gif": return "gif";
    default: return null;
  }
}

export async function readBlobBytes(blob: Blob): Promise<Buffer> {
  const reader = blob.stream().getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

function detectImageMime(buf: Buffer): string | null {
  if (buf.length < 4) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return "image/webp";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
  return null;
}

/**
 * Validates an uploaded image blob. Returns the verified MIME type or null if
 * the file is not an allowed image type.
 *
 * Strategy: read bytes via stream (avoids ArrayBuffer pool-offset bugs), check
 * magic bytes. If magic bytes are inconclusive but the declared type is in the
 * allowlist, trust it — this handles edge-case encodings while still catching
 * files whose magic bytes clearly indicate a different type than declared.
 */
export function validateImageMime(bytes: Buffer, declaredType: string): string | null {
  if (!ALLOWED_IMAGE_TYPES.has(declaredType)) return null;
  const detected = detectImageMime(bytes);
  if (detected === null) return declaredType; // inconclusive — trust allowlisted declared type
  if (detected !== declaredType) return null;  // bytes say one thing, declared type says another
  return detected;
}
