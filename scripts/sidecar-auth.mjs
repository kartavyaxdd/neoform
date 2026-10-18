import { timingSafeEqual } from "node:crypto";
export function equalAuthorization(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = Buffer.from(a, "utf8"),
    right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}
