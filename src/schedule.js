// 定例MTGの日時を求める（DBに依存しない純粋関数。test/ でテストする）
import { addDays } from "./project-types.js";

// 'YYYY-MM-DD' の曜日（0=日〜6=土）
export function weekday(date) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

// from〜to（両端含む）のあいだの定例の日時 'YYYY-MM-DDTHH:MM' を返す。
// 隔週は anchor（PJ開始日）を含む週を1回目として数える（週は日曜始まり）
export function regularOccurrences({ weekdays, time, interval = 1, anchor }, from, to) {
  if (!weekdays.length || !time) return [];
  const anchorWeekStart = addDays(anchor, -weekday(anchor));
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (!weekdays.includes(weekday(d))) continue;
    const weekIndex = Math.floor(daysBetween(anchorWeekStart, d) / 7);
    if (((weekIndex % interval) + interval) % interval !== 0) continue;
    out.push(`${d}T${time}`);
  }
  return out;
}

export function parseWeekdays(value) {
  return (value || "").split(",").filter((s) => /^[0-6]$/.test(s)).map(Number);
}
