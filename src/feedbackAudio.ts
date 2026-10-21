let context: AudioContext | undefined;
export function unlockFeedbackAudio() {
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume().catch(() => {});
  } catch {
    /* Audio is optional. */
  }
}
export function feedbackTone(reward = false) {
  if (!context || context.state !== "running") return;
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
  }
}
