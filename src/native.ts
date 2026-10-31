import { Capacitor, registerPlugin } from "@capacitor/core";
import type { HealthKind, HealthSnapshot } from "./healthConnectPolicy";

export const ANDROID_API_ORIGIN =
  "https://neoform-bca721354a.kartavya-neoform.workers.dev";
export const isAndroid = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
type NativePlugin = {
  setTheme(o: { dark: boolean }): Promise<void>;
  background(): Promise<void>;
  request(o: {
    id: string;
    path: string;
    method: string;
    body?: string;
    headers: Record<string, string>;
  }): Promise<{ status: number; body: string }>;
  cancel(o: { id: string }): Promise<void>;
  bindProfile(o: { profile: string | null }): Promise<void>;
  healthStatus(): Promise<{
    availability: "available" | "install-required" | "unsupported";
    permissions: HealthKind[];
  }>;
  healthConnect(): Promise<void>;
  healthSnapshot(): Promise<{ snapshot: HealthSnapshot | null }>;
  healthSync(): Promise<{ snapshot: HealthSnapshot }>;
  healthSources(o: {
    sources: HealthSnapshot["sources"];
  }): Promise<{ snapshot: HealthSnapshot }>;
  healthDelete(): Promise<void>;
  healthDisconnect(): Promise<void>;
  openHealthSettings(): Promise<void>;
  notificationStatus(): Promise<{
    enabled: boolean;
    allowed: boolean;
    armed: boolean;
    deliveredTimerId?: string;
    deliveredDeadline?: number;
  }>;
  enableNotifications(): Promise<{ allowed: boolean }>;
  restSchedule(o: {
    timerId: string;
    endAt: number;
    sound: boolean;
  }): Promise<{ armed: boolean }>;
  restCancel(): Promise<void>;
  disableNotifications(): Promise<void>;
  shareFile(o: {
    name: string;
    mime: string;
    base64: string;
    save?: boolean;
  }): Promise<void>;
};
export const Native = registerPlugin<NativePlugin>("NeoformNative");
export async function appFetch(
  path: string,
  init: RequestInit,
): Promise<Response> {
  if (!isAndroid()) return fetch(path, init);
  if (
    !/^\/api\/[a-zA-Z0-9_/?=&.%-]+$/.test(path) ||
    path.includes("..") ||
    path.includes("%")
  )
    throw new Error("Unsupported Android API path.");
  const id = crypto.randomUUID();
  const signal = init.signal;
  if (signal?.aborted)
    throw new DOMException("Request cancelled", "AbortError");
  const headers: Record<string, string> = {};
  new Headers(init.headers).forEach((v, k) => {
    headers[k] = v;
  });
  const abort = () => {
    void Native.cancel({ id }).catch(() => {});
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const result = await Native.request({
      id,
      path,
      method: init.method ?? "GET",
      headers,
      ...(typeof init.body === "string" ? { body: init.body } : {}),
    });
    if (signal?.aborted)
      throw new DOMException("Request cancelled", "AbortError");
    return new Response(result.body, {
      status: result.status,
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}
export async function nativeShare(file: File, save = false) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text = "";
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  await Native.shareFile({
    name: file.name,
    mime: file.type,
    base64: btoa(text),
    save,
  });
}
