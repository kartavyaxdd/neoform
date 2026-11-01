import { expect, it, vi } from "vitest";
import { runAndroidUpdate } from "../src/appUpdates";

function setup() {
  const ready = { status: "ready", version: "1.2.0", versionCode: 99 } as const;
  const native = {
    check: vi.fn().mockResolvedValue(ready),
    download: vi.fn().mockResolvedValue(ready),
    install: vi.fn().mockResolvedValue(undefined),
  };
  const phase = vi.fn(),
    active = vi.fn(() => true),
    saved = vi.fn(() => true);
  return { native, phase, active, saved };
}
it("checks, downloads and opens the installer from one action", async () => {
  const s = setup();
  expect(await runAndroidUpdate(s)).toMatchObject({
    status: "installer-opened",
  });
  expect(s.phase.mock.calls.flat()).toEqual([
    "checking",
    "downloading",
    "installing",
  ]);
  expect(s.native.install).toHaveBeenCalledOnce();
});
it("does not download or install when the current version is latest", async () => {
  const s = setup();
  s.native.check.mockResolvedValue({ status: "latest" });
  expect(await runAndroidUpdate(s)).toMatchObject({ status: "latest" });
  expect(s.native.download).not.toHaveBeenCalled();
  expect(s.native.install).not.toHaveBeenCalled();
});
it("never installs after a failed verification, navigation away, or unsaved edit", async () => {
  const bad = setup();
  bad.native.download.mockRejectedValue(Error("Verification failed"));
  await expect(runAndroidUpdate(bad)).rejects.toThrow("Verification failed");
  expect(bad.native.install).not.toHaveBeenCalled();
  const left = setup();
  left.native.download.mockImplementation(async () => {
    left.active.mockReturnValue(false);
    return { status: "ready" };
  });
  expect(await runAndroidUpdate(left)).toMatchObject({ status: "cancelled" });
  expect(left.native.install).not.toHaveBeenCalled();
  const dirty = setup();
  dirty.saved.mockReturnValue(false);
  await expect(runAndroidUpdate(dirty)).rejects.toThrow(/saving/i);
  expect(dirty.native.install).not.toHaveBeenCalled();
});
it("handles a release changing back to the installed version during download", async () => {
  const s = setup();
  s.native.download.mockResolvedValue({ status: "latest" });
  expect(await runAndroidUpdate(s)).toMatchObject({ status: "latest" });
  expect(s.native.install).not.toHaveBeenCalled();
});
it("surfaces denied installation permission and permits a fresh retry", async () => {
  const s = setup();
  s.native.install.mockRejectedValueOnce(
    Error("Installation permission was not enabled"),
  );
  await expect(runAndroidUpdate(s)).rejects.toThrow(/permission/);
  expect(await runAndroidUpdate(s)).toMatchObject({
    status: "installer-opened",
  });
});
it("rejects malformed bridge replies instead of opening the installer", async () => {
  const s = setup();
  s.native.check.mockResolvedValue({});
  await expect(runAndroidUpdate(s)).rejects.toThrow(/unavailable/);
  expect(s.native.install).not.toHaveBeenCalled();
});
