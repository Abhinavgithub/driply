import { prisma } from "../lib/prisma";

const rows = [
  {
    key: "ENABLE_AI_CLASSIFICATION",
    value: "true",
    description:
      "Runs Gemini image classification on uploaded wardrobe photos to auto-fill item attributes. Uploads succeed even if this is disabled.",
    possibleValues: "true, false",
  },
  {
    key: "ENABLE_AI_RECOMMENDER",
    value: "true",
    description:
      "Re-ranks the deterministic outfit candidates using Gemini before returning results. Falls back to algorithm ranking if disabled.",
    possibleValues: "true, false",
  },
  {
    key: "ENABLE_AI_TRYON",
    value: "true",
    description:
      "Generates a virtual try-on image using the selected provider. Silently skipped if disabled or provider credentials are missing.",
    possibleValues: "true, false",
  },
  {
    key: "TRYON_PROVIDER",
    value: "gemini",
    description:
      "Which AI provider to use for try-on image generation. Gemini and OpenAI require a user try-on photo; flux is text-only.",
    possibleValues: "gemini, flux, openai",
  },
  {
    key: "GEMINI_CLASSIFIER_MODEL",
    value: "gemini-2.5-flash-lite",
    description: "Gemini model used for wardrobe item classification.",
    possibleValues: "gemini-2.5-flash-lite, gemini-2.5-flash",
  },
  {
    key: "GEMINI_RECOMMENDER_MODEL",
    value: "gemini-2.5-flash-lite",
    description: "Gemini model used for outfit re-ranking.",
    possibleValues: "gemini-2.5-flash-lite, gemini-2.5-flash",
  },
  {
    key: "GEMINI_TRYON_MODEL",
    value: "gemini-2.5-flash-image",
    description: "Gemini model used for try-on image generation. Must support image output.",
    possibleValues: "gemini-2.5-flash-image",
  },
];

async function main() {
  for (const row of rows) {
    await prisma.appConfig.upsert({
      where: { key: row.key },
      update: row,
      create: row,
    });
    console.log("Seeded:", row.key);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
