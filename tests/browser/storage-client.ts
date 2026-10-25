import type { Page } from "@playwright/test";
import {
  readHistory,
  prepareHistoryMutation,
  writeHistoryMutation,
  type HistoryRequest,
} from "../../src/historyTransport";
import type { Remote } from "../../src/syncPolicy";
function client(page: Page): HistoryRequest {
  return async <T>(path: string, method = "GET", body?: unknown) => {
    const identity = await (await page.request.get("/api/me")).json();
    const response = await page.request.fetch("/api" + path, {
      method,
      headers: {
        Origin: new URL(page.url()).origin,
        "X-Neoform-Client": "2",
        "X-Neoform-Account": identity.id,
      },
      ...(body === undefined ? {} : { data: body }),
    });
    const data = await response.json();
    if (!response.ok())
      throw Object.assign(Error(data.error), { status: response.status, data });
    return data as T;
  };
}
export async function readData(page: Page) {
  const value = await readHistory(client(page));
  return { json: async (): Promise<any> => value, status: () => 200 };
}
export async function writeData(
  page: Page,
  options: { headers?: Record<string, string>; data: Remote },
) {
  try {
    const api = client(page),
      base = await readHistory(api);
    const value = await writeHistoryMutation(
      api,
      prepareHistoryMutation(
        base.data,
        base.data.minimumClientVersion === 2
          ? { ...options.data.data, minimumClientVersion: 2 }
          : options.data.data,
        options.data.revision,
      ),
    );
    return { json: async (): Promise<any> => value, status: () => 200 };
  } catch (e) {
    const error = e as { status?: number; data?: unknown };
    return { json: async () => error.data, status: () => error.status ?? 500 };
  }
}
