import { rpVideos } from "./rpVideos";
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
export type Demonstration = {
  id: string;
  title: string;
  creator: string;
  verified: string;
  source?: string;
  personal?: boolean;
};
export const demonstrations: Record<string, Demonstration> = Object.fromEntries(
  rpVideos.flatMap((v) =>
    v.exerciseIds.map((id) => [
      id,
      { ...v, creator: "Renaissance Periodization" },
    ]),
  ),
);
const normalise = (name: string) =>
  name
    .toLowerCase()
    .replace(/\bflyes?\b/g, "fly")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const aliasIndex = new Map(
  rpVideos.flatMap((v) =>
    v.equipment.flatMap((equipment) =>
      v.names.map((name) => [equipment + ":" + normalise(name), v] as const),
    ),
  ),
);
export function demonstrationFor(
  exercise: { id: string; name: string; equipment: string },
  personalLinks: { exerciseId: string; url: string }[] = [],
): Demonstration | undefined {
  const personal = personalLinks.find((v) => v.exerciseId === exercise.id),
    ownId = personal && videoId(personal.url);
  if (ownId)
    return {
      id: ownId,
      title: "Personal demonstration",
      creator: "Your saved video",
      verified: "",
      personal: true,
    };
  const builtIn = demonstrations[exercise.id];
  if (builtIn) return builtIn;
  const match = aliasIndex.get(
    exercise.equipment + ":" + normalise(exercise.name),
  );
  return match ? { ...match, creator: "Renaissance Periodization" } : undefined;
}
