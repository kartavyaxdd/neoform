export type UpdateRelease = {
  status: "latest" | "ready";
  version?: string;
  versionCode?: number;
};
export type UpdatePhase = "checking" | "downloading" | "installing";
export async function runAndroidUpdate(o: {
  native: {
    check(): Promise<UpdateRelease>;
    download(): Promise<UpdateRelease>;
    install(): Promise<unknown>;
  };
  phase(p: UpdatePhase): void;
  active(): boolean;
  saved(): boolean;
}): Promise<{
  status: "latest" | "cancelled" | "installer-opened";
  version?: string;
}> {
  o.phase("checking");
  let release = await o.native.check();
  if (!o.active()) return { status: "cancelled" };
  if (release.status === "latest")
    return { status: "latest", version: release.version };
  if (release.status !== "ready")
    throw Error("Update checking is unavailable in this build.");
  o.phase("downloading");
  release = await o.native.download();
  if (!o.active()) return { status: "cancelled" };
  if (release.status === "latest")
    return { status: "latest", version: release.version };
  if (release.status !== "ready")
    throw Error("The downloaded update could not be verified.");
  if (!o.saved())
    throw Error(
      "Your workout is still saving on this device. Try again once it is saved.",
    );
  o.phase("installing");
  await o.native.install();
  return { status: "installer-opened", version: release.version };
}
