export type StylePreferences = {
  dressCode: "casual" | "smart_casual" | "office" | "formal";
  lifestyle: "wfh" | "office" | "active" | "mixed";
  priority: "comfort" | "balanced" | "style";
  colorPalette: "neutrals" | "earth" | "bold" | "mixed";
  tempSensitivity: "cold" | "average" | "warm";
};

const DRESS_CODE_VALUES = ["casual", "smart_casual", "office", "formal"] as const;
const LIFESTYLE_VALUES = ["wfh", "office", "active", "mixed"] as const;
const PRIORITY_VALUES = ["comfort", "balanced", "style"] as const;
const COLOR_PALETTE_VALUES = ["neutrals", "earth", "bold", "mixed"] as const;
const TEMP_SENSITIVITY_VALUES = ["cold", "average", "warm"] as const;

export function parseStylePreferences(raw: unknown): StylePreferences | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  if (
    !DRESS_CODE_VALUES.includes(p.dressCode as never) ||
    !LIFESTYLE_VALUES.includes(p.lifestyle as never) ||
    !PRIORITY_VALUES.includes(p.priority as never) ||
    !COLOR_PALETTE_VALUES.includes(p.colorPalette as never) ||
    !TEMP_SENSITIVITY_VALUES.includes(p.tempSensitivity as never)
  )
    return null;
  return p as unknown as StylePreferences;
}

export type QuizQuestion = {
  field: keyof StylePreferences;
  shortLabel: string;
  question: string;
  options: { value: string; label: string; hint: string }[];
};

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    field: "dressCode",
    shortLabel: "Dress code",
    question: "What's your typical dress code?",
    options: [
      { value: "casual", label: "Casual", hint: "Relaxed, everyday looks" },
      { value: "smart_casual", label: "Smart casual", hint: "Polished but comfortable" },
      { value: "office", label: "Office", hint: "Professional workwear" },
      { value: "formal", label: "Formal", hint: "Dressy & elegant" },
    ],
  },
  {
    field: "lifestyle",
    shortLabel: "Lifestyle",
    question: "What's your lifestyle like?",
    options: [
      { value: "wfh", label: "Work from home", hint: "Comfort is key" },
      { value: "office", label: "In the office", hint: "Presentable daily" },
      { value: "active", label: "Active & outdoors", hint: "Practical & sporty" },
      { value: "mixed", label: "Mixed", hint: "Varies day to day" },
    ],
  },
  {
    field: "priority",
    shortLabel: "Priority",
    question: "What matters more to you?",
    options: [
      { value: "comfort", label: "Comfort first", hint: "Ease over everything" },
      { value: "balanced", label: "Balanced", hint: "Best of both worlds" },
      { value: "style", label: "Style first", hint: "Looking sharp counts" },
    ],
  },
  {
    field: "colorPalette",
    shortLabel: "Color palette",
    question: "What color palette suits you?",
    options: [
      { value: "neutrals", label: "Neutrals", hint: "Black, white, grey, beige" },
      { value: "earth", label: "Earth tones", hint: "Brown, olive, rust, cream" },
      { value: "bold", label: "Bold & vibrant", hint: "Saturated, expressive colors" },
      { value: "mixed", label: "Mixed palette", hint: "No strong preference" },
    ],
  },
  {
    field: "tempSensitivity",
    shortLabel: "Temperature",
    question: "How do you feel about temperature?",
    options: [
      { value: "cold", label: "I run cold", hint: "Always reaching for layers" },
      { value: "average", label: "About average", hint: "Pretty standard" },
      { value: "warm", label: "I run warm", hint: "Prefer lighter fabrics" },
    ],
  },
];

export function labelForPreference(field: keyof StylePreferences, value: string): string {
  const question = QUIZ_QUESTIONS.find((q) => q.field === field);
  return question?.options.find((o) => o.value === value)?.label ?? value;
}
