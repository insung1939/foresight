// 기기 표식(무작위). 오늘의 챌린지에서 '같은 기기의 첫 판만 순위'에 쓴다. 개인정보 아님.
import { read, write } from "./storage";

let cached: string | null = null;
export function deviceId(): string {
  if (cached) return cached;
  let id = read<string>("fs:device:v1");
  if (!id) {
    id = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^a-zA-Z0-9-]/g, "").slice(0, 36);
    write("fs:device:v1", id);
  }
  cached = id;
  return id;
}
