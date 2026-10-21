let context: AudioContext | undefined;
export const DEFAULT_REST_CHIME_VOLUME = 0.65;
export function unlockFeedbackAudio() {
  // Mixable, non-exclusive audio where the browser supports Audio Session.
  // Do not request playback/microphone focus or try to bypass the mute switch.
  try {
    const session = (
      navigator as Navigator & { audioSession?: { type: string } }
    ).audioSession;
    if (session) session.type = "ambient";
  } catch {
    /* Unsupported session hints must not prevent audio or logging. */
  }
  try {
    if (!context || context.state === "closed") context = new AudioContext();
    if (context.state !== "running") void context.resume().catch(() => {});
  } catch {
    /* Audio is optional. */
  }
}
export function renderRestChime(
  ctx: BaseAudioContext,
  volume = DEFAULT_REST_CHIME_VOLUME,
) {
  const level = Math.max(
    0.1,
    Math.min(1, Number.isFinite(volume) ? volume : DEFAULT_REST_CHIME_VOLUME),
  );
  for (const [i, frequency] of [880, 1320].entries()) {
    const osc = ctx.createOscillator(),
      gain = ctx.createGain(),
      at = ctx.currentTime + i * 0.18;
    osc.type = "sine";
    osc.frequency.value = frequency;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.075 * level, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.24);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
    osc.start(at);
    osc.stop(at + 0.26);
  }
}
export async function previewRestChime(volume = DEFAULT_REST_CHIME_VOLUME) {
  unlockFeedbackAudio();
  try {
    if (!context) return false;
    await context.resume();
    if (context.state !== "running") return false;
    renderRestChime(context, volume);
    return true;
  } catch {
    return false;
  }
}
export function feedbackTone(
  reward = false,
  volume = DEFAULT_REST_CHIME_VOLUME,
) {
  if (!context || context.state !== "running") return;
  try {
    if (!reward) {
      renderRestChime(context, volume);
      return;
    }
    const at = context.currentTime;
    for (const [i, f] of (reward ? [523, 659, 784] : [660, 880]).entries()) {
      const osc = context.createOscillator(),
        gain = context.createGain();
      osc.connect(gain);
      gain.connect(context.destination);
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, at + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.08, at + i * 0.12 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + i * 0.12 + 0.16);
      osc.start(at + i * 0.12);
      osc.stop(at + i * 0.12 + 0.18);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    }
  } catch {
    /* Optional feedback must never interrupt logging. */
  }
}
