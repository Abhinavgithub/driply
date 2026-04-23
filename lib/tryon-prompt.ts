export type TryOnPromptItem = {
  kind: "TOP" | "BOTTOM" | "SHOE";
  subtype: string;
  colorFamily: string;
  visualSummary?: string | null;
};

function buildItemDescriptions(items: readonly TryOnPromptItem[]): string {
  return items
    .map((item) => {
      const color = item.colorFamily !== "UNKNOWN" ? item.colorFamily.toLowerCase() : null;
      const subtype = item.subtype.replaceAll("_", " ");
      const summary = item.visualSummary?.trim();
      const base = [color, subtype].filter(Boolean).join(" ");
      return summary ? `${base} (${summary})` : base;
    })
    .join(", ");
}

// For Gemini — multimodal prompt referencing the uploaded reference photo and clothing images
export function buildTryOnPrompt(args: {
  displayName?: string | null;
  items: readonly TryOnPromptItem[];
}): string {
  const name =
    (args.displayName?.trim() || "the person")
      .replace(/[^A-Za-z0-9 '\-.,]/g, "")
      .slice(0, 40)
      .trim() || "the person";
  const outfitDescription = buildItemDescriptions(args.items);

  return (
    `Generate a high-fashion editorial portrait of ${name} wearing the provided clothing items. ` +
    `The first uploaded image is the full-body reference photo — use it as the sole identity reference: ` +
    `the generated face, skin tone, facial features, body shape, and proportions MUST match this person exactly. ` +
    `The remaining uploaded images are the clothing items — use them for precise garment accuracy. ` +
    `The outfit consists of: ${outfitDescription}. ` +
    `Preserve the person's identity, face, and body shape — this is critical: the result must be ` +
    `photorealistic and unmistakably recognisable as the same individual from the reference photo. ` +
    `Style: editorial high-fashion photography — confident full-body pose, dynamic cinematic lighting ` +
    `with directional shadows and subtle contrast, magazine-quality composition. ` +
    `Setting: moody urban environment or sleek minimalist studio with a textured backdrop. ` +
    `Show the full body head to toe. Garments rendered with crisp fabric detail, accurate colors, and natural drape. ` +
    `Portrait orientation, magazine cover quality.`
  );
}

// For OpenAI gpt-image-2 — multimodal, same structure as Gemini prompt
export function buildOpenAITryOnPrompt(args: {
  displayName?: string | null;
  items: readonly TryOnPromptItem[];
}): string {
  return buildTryOnPrompt(args);
}

// For FLUX — text-only prompt, no reference images
export function buildFluxTryOnPrompt(args: {
  items: readonly TryOnPromptItem[];
}): string {
  const outfitDescription = buildItemDescriptions(args.items);

  return (
    `Full body fashion photograph of a person wearing ${outfitDescription}. ` +
    `Professional fashion photography, clean neutral studio background, soft even lighting. ` +
    `Complete outfit visible from head to toe, realistic fabric texture and drape, ` +
    `photorealistic high quality image, portrait orientation.`
  );
}
