export const disabledFeatures: string[];
export function restrictedModelCatalog(): { models: Record<string, unknown>[] };
export function verifyFeatureListing(listing: string): {
  forcedFeatures: string[];
  disabledFeatures: string[];
};
export function generationArgs(
  dir: string,
  schema: string,
  catalog: string,
): string[];
export function acceptEvents(
  events: {
    type: string;
    item?: { type: string; text?: string };
    usage?: { output_tokens: number };
  }[],
): boolean;
export function reservation(account: string): {
  account: string;
  cancelled: boolean;
  cancel(): void;
};
