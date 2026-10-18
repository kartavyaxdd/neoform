export function videoId(raw: string): string | null {
  try {
    if (raw.length > 300) return null;
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || u.port)
      return null;
    let id: string | null = null;
    if (u.hostname === "youtu.be" && /^\/[\w-]{11}$/.test(u.pathname))
      id = u.pathname.slice(1);
    if (
      ["www.youtube.com", "youtube.com", "m.youtube.com"].includes(u.hostname)
    ) {
      if (u.pathname === "/watch") id = u.searchParams.get("v");
      else if (/^\/(shorts|embed)\/[\w-]{11}$/.test(u.pathname))
        id = u.pathname.split("/")[2];
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
export const watchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
export const demonstrations: Record<
  string,
  { id: string; title: string; creator: string; verified: string }
> = {
  squat: {
    id: "bEv6CCg2BC8",
    title: "How To Get A Huge Squat With Perfect Technique (Fix Mistakes)",
    creator: "Jeff Nippard",
    verified: "2026-10-10",
  },
  bench: {
    id: "vcBig73ojpE",
    title: "How To Get A Huge Bench Press with Perfect Technique",
    creator: "Jeff Nippard",
    verified: "2026-10-10",
  },
  rdl: {
    id: "_oyxCn2iSjU",
    title:
      "HOW TO DO ROMANIAN DEADLIFTS (RDLs): Build Beefy Hamstrings With Perfect Technique",
    creator: "Jeff Nippard",
    verified: "2026-10-10",
  },
  "db-row": {
    id: "k2kVniB5eQI",
    title: "RP 1-Arm Dumbbell Row",
    creator: "Renaissance Periodization",
    verified: "2026-10-10",
  },
  lateral: {
    id: "4hTUCDUQaNA",
    title:
      "The Only Dumbbell Lateral Raise Guide You Need (For Side Delt Growth)",
    creator: "Renaissance Periodization",
    verified: "2026-10-10",
  },
  pulldown: {
    id: "sRcA-68KOAA",
    title: "Lat Pulldown Flaws and Better Back Exercises to Consider",
    creator: "Renaissance Periodization",
    verified: "2026-10-10",
  },
};
