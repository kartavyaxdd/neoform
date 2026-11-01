export const privateBrowserSuites: string[];
export function browserBatches(
  mode: "private" | "public" | "profiles",
  focused?: string[],
): string[][];
