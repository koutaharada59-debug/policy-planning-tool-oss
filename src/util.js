// 共通ヘルパー

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "リクエストの形式が正しくありません");
  }
}

export function clean(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function required(value, max, label) {
  const v = clean(value, max);
  if (!v) throw new HttpError(400, `${label}を入力してください`);
  return v;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function optDate(value, label = "日付") {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !DATE_RE.test(value) || isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new HttpError(400, `${label}の形式が正しくありません`);
  }
  return value;
}

export function reqDate(value, label = "日付") {
  const v = optDate(value, label);
  if (!v) throw new HttpError(400, `${label}を入力してください`);
  return v;
}

export function reqDateTime(value, label = "日時") {
  if (typeof value !== "string" || !DATETIME_RE.test(value) || isNaN(Date.parse(`${value}:00Z`))) {
    throw new HttpError(400, `${label}を入力してください`);
  }
  return value;
}

export function optTime(value) {
  if (!value) return "";
  if (typeof value !== "string" || !TIME_RE.test(value)) throw new HttpError(400, "時刻の形式が正しくありません");
  return value;
}

export function int(value, { min, max, fallback, label = "数値" } = {}) {
  if (value === null || value === undefined || value === "") {
    if (fallback !== undefined) return fallback;
    throw new HttpError(400, `${label}を入力してください`);
  }
  const n = Number(value);
  if (!Number.isInteger(n) || (min !== undefined && n < min) || (max !== undefined && n > max)) {
    throw new HttpError(400, `${label}が正しくありません`);
  }
  return n;
}

export function oneOf(value, allowed, label) {
  if (!allowed.includes(value)) throw new HttpError(400, `${label}が正しくありません`);
  return value;
}

export function optUrl(value) {
  const v = clean(value, 500);
  if (!v) return "";
  if (!/^https?:\/\//i.test(v)) throw new HttpError(400, "URLは http:// か https:// で始めてください");
  return v;
}

// JST の今日 'YYYY-MM-DD' と現在 'YYYY-MM-DDTHH:MM'
export function todayJst(now = Date.now()) {
  return new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export function nowJst(now = Date.now()) {
  return new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 16);
}

// 'YYYY-MM-DDTHH:MM' → '10/8 21:00'（お知らせの文面用）
export function shortDateTime(dt) {
  const [, m, d] = dt.slice(0, 10).split("-").map(Number);
  return `${m}/${d} ${dt.slice(11, 16)}`;
}

export function idList(value) {
  return (value || "").split(",").map((s) => s.trim()).filter(Boolean);
}

// 楽観ロック：更新件数が0なら、他の人が先に更新している
export function assertUpdated(result, what = "この内容") {
  if (!result.meta || result.meta.changes === 0) {
    throw new HttpError(409, `${what}は他の人が更新しました。画面を再読み込みしてから、もう一度保存してください`);
  }
}
