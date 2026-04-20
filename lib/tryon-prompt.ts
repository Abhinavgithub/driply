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
  const name = args.displayName?.trim() || "the person";
  const outfitDescription = buildItemDescriptions(args.items);

  return (
    `Create a realistic fashion try-on image of ${name} wearing the provided clothing items. ` +
    `The first uploaded image is the full-body reference photo — use it as the identity and body reference. ` +
    `The remaining uploaded images are the clothing items — use them for outfit accuracy. ` +
    `The outfit consists of: ${outfitDescription}. ` +
    `Preserve the person's identity, face, and body shape while generating a polished, photorealistic outfit preview. ` +
    `Show the full body from head to toe so the complete outfit is clearly visible. ` +
    `Reproduce garment colors accurately, maintain realistic fabric drape and natural body proportions. ` +
    `Use soft, even natural lighting. Place the subject against a clean, neutral light background. ` +
    `Output a full-body portrait image in portrait orientation (taller than wide).`
  );
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
