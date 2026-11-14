// 랭킹 이름: 이 기기에 기억해 두고 새 게임마다 채워 준다. 안 정하면 귀여운 이름을 뽑아 준다.
import { read, write } from "./storage";

const KEY = "fs:nick:v1";
const A = ["용감한", "느긋한", "날카로운", "졸린", "부지런한", "겁없는", "신중한", "배고픈", "수상한", "반짝이는", "새벽의", "전설의"];
const B = ["부엉이", "개미", "곰", "황소", "다람쥐", "고양이", "펭귄", "수달", "여우", "판다", "고래", "참새"];

export const randomNick = () => `${A[Math.floor(Math.random() * A.length)]} ${B[Math.floor(Math.random() * B.length)]}${Math.floor(Math.random() * 90) + 10}`;
export const getNick = () => read<string>(KEY);
export const setNick = (n: string) => write(KEY, n);
export const NICK_RE = /^[0-9A-Za-z가-힣 _.\-]{2,12}$/;
