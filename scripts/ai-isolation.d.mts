export function createIsolatedJob(
  projectRoot: string,
  scratchRoot: string,
): Promise<string>;
export function assertSafeHostConfiguration(options: {
  platform?: string;
  systemDir: string;
  codexHome: string;
}): Promise<boolean>;
export function systemConfigDirectory(): string;
