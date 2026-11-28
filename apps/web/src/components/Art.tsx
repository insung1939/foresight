// 게임 그림(ChatGPT 이미지 생성 · scripts/gen_image.sh): /art/<이름>.webp. 그림이 없거나 못 받으면 이모지로 돌아간다.
import { useState, type ReactNode } from "react";

export function Art({ name, alt = "", fallback, className = "" }: { name: string; alt?: string; fallback: ReactNode; className?: string }) {
  const [bad, setBad] = useState(false);
  if (bad) return <>{fallback}</>;
  return <img className={`art ${className}`} src={`/art/${name}.webp`} alt={alt} loading="lazy" decoding="async" onError={() => setBad(true)} />;
}
