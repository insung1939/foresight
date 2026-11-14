// 로그인(선택): Supabase Auth 구글 로그인. 로그인 안 해도 게임은 그대로.
// 설정: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY(공개용 키라 화면에 있어도 됨). 없으면 로그인 버튼이 '준비 중'.
// 서버에는 access token 만 보낸다(Authorization: Bearer). 서버가 검증하고 Supabase 사용자 id 만 쓴다.
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const authEnabled = !!(URL && ANON);

let client: Promise<SupabaseClient> | null = null;
function sb(): Promise<SupabaseClient> {
  // 로그인을 안 쓰는 사람은 라이브러리를 받지 않게 필요할 때만 불러온다
  client ??= import("@supabase/supabase-js").then(({ createClient }) => createClient(URL!, ANON!, { auth: { persistSession: true, detectSessionInUrl: true } }));
  return client;
}

let session: Session | null = null;
const subs = new Set<(s: Session | null) => void>();
let started = false;

export function startAuth() {
  if (!authEnabled || started) return;
  started = true;
  sb().then(async (c) => {
    const { data } = await c.auth.getSession();
    set(data.session);
    c.auth.onAuthStateChange((_e, s) => set(s));
  });
}

function set(s: Session | null) {
  const was = session?.user.id;
  session = s;
  subs.forEach((f) => f(s));
  if (s && s.user.id !== was) loginHooks.forEach((f) => f());
}

const loginHooks = new Set<() => void>();
/** 로그인되는 순간 할 일(기기 기록 합치기 등) */
export const onLogin = (f: () => void) => {
  loginHooks.add(f);
  return () => {
    loginHooks.delete(f);
  };
};

export const isLoggedIn = () => !!session;

export async function authHeader(): Promise<Record<string, string>> {
  if (!authEnabled || !session) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

export async function signInWithGoogle() {
  const c = await sb();
  await c.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/#/me` } });
}

export async function signOut() {
  const c = await sb();
  await c.auth.signOut();
}

export function useSession() {
  const [s, setS] = useState<Session | null>(session);
  useEffect(() => {
    subs.add(setS);
    setS(session);
    return () => {
      subs.delete(setS);
    };
  }, []);
  return s;
}

/** 화면에 보일 이름(구글 프로필 이름은 서버에 저장하지 않는다) */
export const displayName = (s: Session | null) => (s?.user.user_metadata?.name as string | undefined) ?? s?.user.email?.split("@")[0] ?? "";
