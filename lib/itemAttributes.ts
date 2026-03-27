import { z } from "zod";

export const itemKinds = ["TOP", "BOTTOM", "SHOE"] as const;
export const colorFamilies = [
  "BLACK",
  "WHITE",
  "BLUE",
  "BROWN",
  "GREEN",
  "RED",
  "PINK",
  "GREY",
  "BEIGE",
  "YELLOW",
  "MULTI",
  "UNKNOWN",
] as const;
export const patterns = [
  "SOLID",
  "STRIPED",
  "CHECKERED",
  "GRAPHIC",
  "PRINTED",
  "TEXTURED",
  "UNKNOWN",
] as const;
export const styleProfiles = [
  "CASUAL",
  "SMART_CASUAL",
  "ATHLEISURE",
  "FORMAL",
  "UNKNOWN",
] as const;
export const formalities = ["RELAXED", "ELEVATED", "DRESSY", "UNKNOWN"] as const;
export const warmthLevels = ["LIGHT", "MID", "WARM", "UNKNOWN"] as const;

export const itemSubtypeOptions = {
  TOP: ["tshirt", "long_sleeve", "hoodie", "sweater", "jacket"],
  BOTTOM: ["shorts", "jeans"],
  SHOE: ["sneakers", "boots", "sandals"],
} as const;

export const itemAttributeEnums = {
  colorFamily: z.enum(colorFamilies),
  pattern: z.enum(patterns),
  styleProfile: z.enum(styleProfiles),
  formality: z.enum(formalities),
  warmthLevel: z.enum(warmthLevels),
};

export const itemAttributesSchema = z.object(itemAttributeEnums);

export const itemAttributePatchSchema = itemAttributesSchema.partial();

export type ItemAttributeValues = z.infer<typeof itemAttributesSchema>;

export const defaultItemAttributes: ItemAttributeValues = {
  colorFamily: "UNKNOWN",
  pattern: "UNKNOWN",
  styleProfile: "UNKNOWN",
  formality: "UNKNOWN",
  warmthLevel: "UNKNOWN",
};

export function formatEnumLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function hasUnknownAttributes(item: ItemAttributeValues) {
  return Object.values(item).some((value) => value === "UNKNOWN");
}
