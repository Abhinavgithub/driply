const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

/** Client-side pre-flight check before uploading an image file. */
export function validateImageFile(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type))
    return "Please upload a JPG, PNG, or WEBP image.";
  if (file.size > MAX_IMAGE_BYTES)
    return "File exceeds the 10 MB limit.";
  return null;
}
