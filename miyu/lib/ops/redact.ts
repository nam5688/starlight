// 로그 · 운영 기록 · 알림에 남기는 문자열에서 비밀키 · 토큰 · 연락처 · DB 오류에 딸려 오는 행 내용을 가린다.
// 고객 이름 · 생년월일 · 답변 · 고민 전문은 애초에 기록에 넣지 않지만, 외부 라이브러리나 DB 오류 문구에 섞여 나올 수 있어 한 번 더 거른다.

import { redactPersonalInfo } from "../personalization/context.ts";

const SECRET_PATTERNS: [RegExp, string][] = [
  [/sb_(secret|publishable)_[A-Za-z0-9_-]+/g, "[키 가림]"],
  [/\b(test|live)_(gsk|gck|sk|ck)_[A-Za-z0-9_-]+/g, "[결제 키 가림]"],
  [/\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g, "[토큰 가림]"],
  [/\b\d{6,}:[A-Za-z0-9_-]{30,}/g, "[봇 토큰 가림]"],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [가림]"],
  [/\b(authorization|cookie|set-cookie|api[_-]?key|secret|token|password|passwd)\b\s*[:=]\s*[^\s,;]+/gi, "$1=[가림]"],
  [/([?&](?:code|token|access_token|refresh_token|key|apikey|secret)=)[^&\s]+/gi, "$1[가림]"],
];

/** DB 오류 문구에 딸려 오는 행 내용 (입력한 글이 그대로 들어 있을 수 있다) */
const DB_ROW_DETAIL = /(Failing row contains|DETAIL:|Key \([^)]*\)=\([^)]*\)).*/gis;

export function redactSecrets(text: string): string {
  let out = text.replace(DB_ROW_DETAIL, "[상세 내용 가림]");
  for (const [re, label] of SECRET_PATTERNS) out = out.replace(re, label);
  return redactPersonalInfo(out).text;
}

/** 오류에서 사람이 읽을 메시지만 꺼낸다: 가리고, 길이를 제한한다 (stack · 요청 본문은 쓰지 않는다) */
export function safeErrorMessage(error: unknown, max = 300): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "알 수 없는 오류";
  const text = redactSecrets(raw).replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text || "알 수 없는 오류";
}

/** 요청 경로에서 쿼리 · 조각을 떼고, 길이를 제한한다 (주문번호 · 결과 ID 같은 경로 값은 추적에 쓰므로 남긴다) */
export function safePath(path: string, max = 200): string {
  const base = path.split(/[?#]/)[0] ?? "";
  return redactSecrets(base).slice(0, max);
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** 오류 식별번호 — 고객에게 보여 주고, 운영 기록과 이어 주는 번호 (예: ERR-7K3QX9ZP) */
export function newErrorId(random: (bytes: Uint8Array) => Uint8Array = (b) => globalThis.crypto.getRandomValues(b)): string {
  return `ERR-${Array.from(random(new Uint8Array(8)), (b) => ALPHABET[b % ALPHABET.length]).join("")}`;
}

function fnv1a(text: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * 서버 화면 오류의 식별번호 — Next.js가 오류마다 붙이는 digest에서 같은 번호를 만든다.
 * 고객 화면(브라우저)과 서버 기록이 같은 digest로 같은 번호를 계산하므로, 고객이 알려 준 번호로 서버 기록을 찾을 수 있다.
 */
export function errorIdFromDigest(digest: string): string {
  const bits = [fnv1a(digest, 2166136261), fnv1a(`${digest}#`, 2654435761)];
  let out = "";
  for (let i = 0; i < 8; i++) {
    const word = bits[i < 4 ? 0 : 1];
    out += ALPHABET[(word >>> ((i % 4) * 8)) % ALPHABET.length];
  }
  return `ERR-${out}`;
}

export const ERROR_ID_PATTERN = /^ERR-[A-Z2-9]{8}$/;
