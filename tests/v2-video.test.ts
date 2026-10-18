import { it, expect } from "vitest";
import { videoId } from "../src/videos";
import { emptyState, stateSchema, catalog, mergeStates } from "../src/domain";
import { mergeThreeWay } from "../src/syncPolicy";
it("allows specific HTTPS YouTube videos, strips tracking, rejects spoofed URLs and executable schemes", () => {
  expect(videoId("https://youtu.be/vcBig73ojpE?si=abc")).toBe("vcBig73ojpE");
  expect(videoId("https://www.youtube.com/watch?v=vcBig73ojpE")).toBe(
    "vcBig73ojpE",
  );
  for (const url of [
    "javascript:alert(1)",
    "http://youtu.be/vcBig73ojpE",
    "https://youtube.com.evil.test/watch?v=vcBig73ojpE",
    "https://youtube.com/results?search_query=squat",
    "https://evil@youtube.com/watch?v=vcBig73ojpE",
    "https://youtu.be/no",
  ])
    expect(videoId(url)).toBeNull();
});
it("merges imported personal video links and independent device additions by exercise identity", () => {
  const base = emptyState(),
    remote = {
      ...base,
      exerciseVideos: [
        {
          exerciseId: "bench",
          url: "https://www.youtube.com/watch?v=vcBig73ojpE",
        },
      ],
    },
    local = {
      ...base,
      exerciseVideos: [
        {
          exerciseId: "squat",
          url: "https://www.youtube.com/watch?v=bEv6CCg2BC8",
        },
      ],
    };
  expect(mergeStates(remote, local).exerciseVideos).toHaveLength(2);
  expect(mergeThreeWay(base, remote, local).exerciseVideos).toHaveLength(2);
  const conflict = {
    ...base,
    exerciseVideos: [
      {
        exerciseId: "bench",
        url: "https://www.youtube.com/watch?v=bEv6CCg2BC8",
      },
    ],
  };
  expect(() => mergeThreeWay(base, remote, conflict)).toThrow();
});
it("retains validated per-exercise personal links and loads old backups without migrating personal records", () => {
  const old = emptyState();
  expect(stateSchema.parse(old)).toBeDefined();
  const next = {
    ...old,
    exerciseVideos: [
      {
        exerciseId: catalog[0].id,
        url: "https://www.youtube.com/watch?v=vcBig73ojpE",
      },
    ],
  };
  expect((stateSchema.parse(next) as any).exerciseVideos).toEqual(
    next.exerciseVideos,
  );
  expect(
    stateSchema.safeParse({
      ...next,
      exerciseVideos: [{ exerciseId: "unknown", url: "https://evil.test" }],
    }).success,
  ).toBe(false);
});
