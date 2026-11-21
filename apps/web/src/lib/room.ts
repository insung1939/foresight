// 내 방 가구: 모은 별(★) 개수만큼 열린다. 3D 방과 홈 목록이 같은 표를 쓴다.
export interface Furniture {
  id: string;
  name: string;
  icon: string;
  stars: number; // 열리는 별 개수(누적)
}

export const FURNITURE: Furniture[] = [
  { id: "rug", name: "포근한 러그", icon: "🟪", stars: 0 },
  { id: "desk", name: "책상", icon: "🪑", stars: 0 },
  { id: "monitor", name: "주식 모니터", icon: "🖥️", stars: 1 },
  { id: "plant", name: "몬스테라", icon: "🪴", stars: 3 },
  { id: "lamp", name: "스탠드 조명", icon: "💡", stars: 5 },
  { id: "sofa", name: "소파", icon: "🛋️", stars: 8 },
  { id: "shelf", name: "투자 책장", icon: "📚", stars: 11 },
  { id: "window", name: "시티뷰 창문", icon: "🌃", stars: 14 },
  { id: "trophy", name: "트로피", icon: "🏆", stars: 18 },
  { id: "coins", name: "동전 산", icon: "🪙", stars: 23 },
  { id: "statue", name: "황금 개미상", icon: "🗽", stars: 29 },
  { id: "penthouse", name: "펜트하우스", icon: "🏙️", stars: 38 },
];

export const OUTFITS: { id: string; name: string; icon: string; stars: number }[] = [
  { id: "shades", name: "선글라스", icon: "🕶️", stars: 8 },
  { id: "crown", name: "왕관", icon: "👑", stars: 20 },
];

export const unlockedFurniture = (stars: number) => FURNITURE.filter((f) => f.stars <= stars).map((f) => f.id);
export const nextFurniture = (stars: number) => FURNITURE.find((f) => f.stars > stars) ?? null;
