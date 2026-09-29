export function isFeatureEnabled(value: string | undefined) {
  return value === "true";
}

export const features = {
  cardMastery: isFeatureEnabled(process.env.NEXT_PUBLIC_CARD_MASTERY_ENABLED),
} as const;
