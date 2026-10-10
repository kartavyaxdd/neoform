import { stateSchema, type State } from "./domain";
export type Remote = { data: State; revision: number };
export type Outbox = {
  data: State;
  revision: number;
  dirty: boolean;
  generation: number;
  base?: Remote;
};
export function acknowledge(
  box: Outbox,
  sentGeneration: number,
  revision: number,
  sentData?: State,
): Outbox {
  const data =
    sentData ?? (box.generation === sentGeneration ? box.data : undefined);
  return {
    ...box,
    revision,
    dirty: box.generation !== sentGeneration,
    ...(data
      ? { base: { data: structuredClone(data), revision } }
      : { base: undefined }),
  };
}
export function receiveRemote(
  box: Outbox,
  remote: Remote,
): { box: Outbox; conflict: boolean } {
  if (box.dirty) return { box, conflict: remote.revision !== box.revision };
  return {
    box: {
      ...box,
      data: remote.data,
      revision: remote.revision,
      base: structuredClone(remote),
    },
    conflict: false,
  };
}

// Import precedence is deliberately separate from sync. Only a common server
// snapshot can tell an unchanged local record from a local edit or deletion.
export function mergeThreeWay(base: State, remote: State, local: State): State {
  const same = (a: unknown, b: unknown): boolean => {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b))
      return a.length === b.length && a.every((v, i) => same(v, b[i]));
    if (object(a) && object(b)) {
      const keys = Object.keys(a);
      return (
        keys.length === Object.keys(b).length &&
        keys.every((k) => Object.hasOwn(b, k) && same(a[k], b[k]))
      );
    }
    return false;
  };
  function object(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === "object" && !Array.isArray(v);
  }
  const fail = (path: string, why: string): never => {
    throw new Error(
      `Cannot safely merge ${path}: ${why}. Export both copies, then choose Use cloud or Replace cloud explicitly.`,
    );
  };
  const merge = (b: unknown, r: unknown, l: unknown, path: string): unknown => {
    if (same(l, b)) return r;
    if (same(r, b) || same(r, l)) return l;
    if (r === undefined || l === undefined || r === null || l === null)
      return fail(path, "an edit conflicts with a deletion or replacement");
    if (Array.isArray(b) && Array.isArray(r) && Array.isArray(l)) {
      const all = [...b, ...r, ...l];
      const field = all.every((v) => object(v) && typeof v.id === "string")
        ? "id"
        : all.every((v) => object(v) && typeof v.key === "string")
          ? "key"
          : null;
      if (!field) return fail(path, "both devices changed this list");
      const map = (items: Record<string, unknown>[]) => {
        const result = new Map(items.map((v) => [v[field] as string, v]));
        if (result.size !== items.length)
          fail(path, "duplicate record identities are ambiguous");
        return result;
      };
      const bm = map(b),
        rm = map(r),
        lm = map(l);
      // Deletions/additions do not count as reorders; conflicting reorders do.
      const shared = b
        .map((v) => v[field] as string)
        .filter((id) => rm.has(id) && lm.has(id));
      const order = (items: Record<string, unknown>[]) =>
        items
          .map((v) => v[field] as string)
          .filter((id) => shared.includes(id));
      const ro = order(r),
        lo = order(l);
      if (!same(ro, shared) && !same(lo, shared) && !same(ro, lo))
        return fail(path, "both devices reordered records differently");
      const ordered = (!same(lo, shared) ? [...l, ...r] : [...r, ...l]).map(
        (v) => v[field] as string,
      );
      const result = [];
      for (const id of new Set(ordered)) {
        const value = merge(
          bm.get(id),
          rm.get(id),
          lm.get(id),
          `${path}[${id}]`,
        );
        if (value !== undefined) result.push(value);
      }
      return result;
    }
    if (object(b) && object(r) && object(l)) {
      const result: Record<string, unknown> = {};
      for (const k of new Set([
        ...Object.keys(b),
        ...Object.keys(r),
        ...Object.keys(l),
      ])) {
        const value = merge(b[k], r[k], l[k], `${path}.${k}`);
        if (value !== undefined) result[k] = value;
      }
      return result;
    }
    return fail(path, "both devices changed this value differently");
  };
  const result = stateSchema.safeParse(merge(base, remote, local, "account"));
  if (!result.success)
    return fail(
      "account",
      result.error.issues[0]?.message || "combined changes are invalid",
    );
  return result.data;
}
