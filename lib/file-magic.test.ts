import { describe, expect, it } from "vitest";

import { validateImageMime } from "@/lib/file-magic";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
const WEBP = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
const GIF = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const HTML_POLYGLOT = Buffer.from("<html><script>alert(1)</script>");

describe("validateImageMime (strict magic)", () => {
  it("accepts matching magic + declared type", () => {
    expect(validateImageMime(JPEG, "image/jpeg")).toBe("image/jpeg");
    expect(validateImageMime(PNG, "image/png")).toBe("image/png");
    expect(validateImageMime(WEBP, "image/webp")).toBe("image/webp");
    expect(validateImageMime(GIF, "image/gif")).toBe("image/gif");
  });

  it("rejects mismatched magic vs declared type", () => {
    expect(validateImageMime(PNG, "image/jpeg")).toBeNull();
    expect(validateImageMime(JPEG, "image/png")).toBeNull();
  });

  it("rejects disallowed declared types even with valid magic", () => {
    expect(validateImageMime(JPEG, "image/svg+xml")).toBeNull();
    expect(validateImageMime(PNG, "text/html")).toBeNull();
  });

  it("rejects inconclusive magic instead of trusting declared type (P1-7)", () => {
    // HTML polyglot with spoofed image type must not pass.
    expect(validateImageMime(HTML_POLYGLOT, "image/jpeg")).toBeNull();
    expect(validateImageMime(Buffer.alloc(0), "image/png")).toBeNull();
    expect(validateImageMime(Buffer.from([0x00, 0x01, 0x02, 0x03]), "image/webp")).toBeNull();
  });
});
