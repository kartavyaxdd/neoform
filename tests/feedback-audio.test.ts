import { it, expect, vi, afterEach } from "vitest";
import { renderRestChime } from "../src/feedbackAudio";
afterEach(() => vi.unstubAllGlobals());
it("renders a short bounded chime with fades and cleans up its audio graph", () => {
  const values: number[] = [],
    stops: number[] = [],
    disconnect = vi.fn(),
    nodes: any[] = [];
  const ctx = {
    currentTime: 10,
    destination: {},
    createOscillator: () => {
      const o = {
        type: "",
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: (t: number) => stops.push(t),
        disconnect,
        onended: () => {},
      };
      nodes.push(o);
      return o;
    },
    createGain: () => ({
      connect: vi.fn(),
      disconnect,
      gain: {
        setValueAtTime: (v: number) => values.push(v),
        exponentialRampToValueAtTime: (v: number) => values.push(v),
      },
    }),
  } as unknown as BaseAudioContext;
  renderRestChime(ctx, 10);
  expect(Math.max(...values)).toBeLessThanOrEqual(0.08);
  expect(Math.max(...stops)).toBeLessThan(11);
  nodes.forEach((n) => n.onended());
  expect(disconnect).toHaveBeenCalled();
});
it("requests mixable audio, falls back when unsupported and never lets audio failure break logging", async () => {
  vi.resetModules();
  const audioSession = { type: "auto" };
  vi.stubGlobal("navigator", { audioSession });
  vi.stubGlobal(
    "AudioContext",
    class {
      state = "running";
      resume = async () => {};
      createOscillator() {
        throw Error("audio unavailable");
      }
    },
  );
  const audio = await import("../src/feedbackAudio");
  audio.unlockFeedbackAudio();
  expect(audioSession.type).toBe("ambient");
  expect(() => audio.feedbackTone()).not.toThrow();
});

it("prepares audio once without resuming or playing until a timer interaction", async () => {
  vi.resetModules();
  const resume = vi.fn(async () => {}),
    create = vi.fn();
  const audioSession = { type: "auto" };
  vi.stubGlobal("navigator", { audioSession });
  vi.stubGlobal(
    "AudioContext",
    class {
      state = "suspended";
      resume = resume;
      constructor() {
        create();
      }
    },
  );
  const audio = await import("../src/feedbackAudio");
  audio.prepareFeedbackAudio();
  audio.prepareFeedbackAudio();
  expect(create).toHaveBeenCalledTimes(1);
  expect(audioSession.type).toBe("ambient");
  expect(resume).not.toHaveBeenCalled();
  audio.unlockFeedbackAudio();
  expect(create).toHaveBeenCalledTimes(1);
  expect(resume).toHaveBeenCalledTimes(1);
});
