// 내 방 가구: 모은 별(★) 개수만큼 열린다. 3D 방과 '내 방' 목록이 같은 표를 쓴다.
// 후기: '동전 산·펜트하우스는 뭐가 바뀐 건지 모르겠다' → 모든 가구에 '무엇이 생기는지' 한 줄(desc),
// 방 자체가 넓어지는 단계(확장 공사 → 펜트하우스)는 눈에 띄게 다르게.
export interface Furniture {
  id: string;
  name: string;
  icon: string;
  stars: number; // 열리는 별 개수(누적)
  desc: string;
}

export const FURNITURE: Furniture[] = [
  { id: "rug", name: "포근한 러그", icon: "🟫", stars: 0, desc: "원목 바닥 위 손으로 짠 러그" },
  { id: "desk", name: "원목 책상과 의자", icon: "🪑", stars: 0, desc: "창가 쪽 작업 책상" },
  { id: "monitor", name: "주식 모니터", icon: "🖥️", stars: 1, desc: "빨간 차트가 켜진 모니터" },
  { id: "bed", name: "침대", icon: "🛏️", stars: 2, desc: "폭신한 이불과 베개" },
  { id: "plant", name: "몬스테라", icon: "🪴", stars: 3, desc: "구석에 큰 잎 화분" },
  { id: "lamp", name: "아치형 스탠드", icon: "💡", stars: 5, desc: "따뜻한 불빛이 방을 밝혀요" },
  { id: "sofa", name: "3인용 소파", icon: "🛋️", stars: 7, desc: "쿠션 세 개짜리 패브릭 소파" },
  { id: "shelf", name: "투자 책장", icon: "📚", stars: 9, desc: "책이 빼곡한 벽 책장" },
  { id: "window", name: "큰 창문", icon: "🪟", stars: 11, desc: "커튼 달린 창, 바깥 풍경이 보여요" },
  { id: "tv", name: "TV와 거실장", icon: "📺", stars: 13, desc: "벽 쪽 낮은 장 위 큰 TV" },
  { id: "table", name: "커피 테이블", icon: "☕", stars: 15, desc: "소파 앞 원목 테이블과 머그컵" },
  { id: "dual", name: "듀얼 모니터", icon: "🖥️", stars: 17, desc: "모니터가 두 대로" },
  { id: "aquarium", name: "대형 수족관", icon: "🐠", stars: 19, desc: "2.4m 수족관: 물고기 떼·엔젤피시·꼬마 범고래·해초·산호·기포" },
  { id: "wide", name: "확장 공사", icon: "📐", stars: 20, desc: "방이 1.5배 넓어져요" },
  { id: "gallery", name: "벽 갤러리", icon: "🖼️", stars: 22, desc: "벽에 거는 그림 세 점과 선반" },
  { id: "cabinet", name: "트로피 장식장", icon: "🏆", stars: 25, desc: "유리 장 속 트로피들" },
  { id: "safe", name: "금고", icon: "🔐", stars: 28, desc: "문이 열린 금고 속 금괴" },
  { id: "cat", name: "반려묘", icon: "🐈", stars: 31, desc: "방을 돌아다니는 고양이" },
  { id: "statue", name: "황금 개미상", icon: "🗽", stars: 35, desc: "조명을 받는 황금 개미 동상" },
  { id: "penthouse", name: "펜트하우스", icon: "🏙️", stars: 40, desc: "더 넓은 방, 대리석 바닥, 통유리 너머 밤의 도시" },
];

export const OUTFITS: { id: string; name: string; icon: string; stars: number }[] = [
  { id: "shades", name: "선글라스", icon: "🕶️", stars: 8 },
  { id: "crown", name: "왕관", icon: "👑", stars: 20 },
];

export const unlockedFurniture = (stars: number) => FURNITURE.filter((f) => f.stars <= stars).map((f) => f.id);
export const nextFurniture = (stars: number) => FURNITURE.find((f) => f.stars > stars) ?? null;
