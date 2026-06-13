import { z } from "zod";

export const MAX_UPLOAD_PHOTOS = 10;

export const itemKinds = ["TOP", "BOTTOM", "SHOE"] as const;
export const itemKindSchema = z.enum(itemKinds);
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
export const styleProfiles = ["CASUAL", "SMART_CASUAL", "ATHLEISURE", "FORMAL", "UNKNOWN"] as const;
export const formalities = ["RELAXED", "ELEVATED", "DRESSY", "UNKNOWN"] as const;
export const warmthLevels = ["LIGHT", "MID", "WARM", "UNKNOWN"] as const;

export const itemSubtypeOptions = {
  TOP: ["tshirt", "shirt", "long_sleeve", "hoodie", "sweater", "jacket"],
  BOTTOM: ["shorts", "jeans"],
  SHOE: ["sneakers", "boots", "sandals"],
} as const;

export const itemSubtypes = [
  ...itemSubtypeOptions.TOP,
  ...itemSubtypeOptions.BOTTOM,
  ...itemSubtypeOptions.SHOE,
] as const;

export type ItemKindValue = (typeof itemKinds)[number];
export type ItemSubtypeValue = (typeof itemSubtypes)[number];

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
export type ItemAttributePatchValues = z.infer<typeof itemAttributePatchSchema>;

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

export function mergeItemAttributes(partial?: ItemAttributePatchValues): ItemAttributeValues {
  return {
    ...defaultItemAttributes,
    ...(partial ?? {}),
  };
}

export function countKnownAttributes(item: ItemAttributeValues) {
  return Object.values(item).filter((value) => value !== "UNKNOWN").length;
}

export function pickProvidedItemAttributes(partial?: ItemAttributePatchValues) {
  if (!partial) return {};

  return Object.fromEntries(
    Object.entries(partial).filter(([, value]) => value !== undefined),
  ) as Partial<ItemAttributeValues>;
}

export function getDefaultSubtypeForKind(kind: ItemKindValue) {
  return itemSubtypeOptions[kind][0];
}

export function isValidSubtypeForKind(
  kind: ItemKindValue,
  subtype: string,
): subtype is ItemSubtypeValue {
  return (itemSubtypeOptions[kind] as readonly string[]).includes(subtype);
}
