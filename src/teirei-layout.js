// 定例の議事録の「枠」（並び順と、足した枠）。画面の public/js/teirei-layout.js と同じ形
const FIXED = ["notice", "reports", "news", "exchange"];
export const FIXED_TITLES = { notice: "📢 事務連絡", reports: "📊 各PJの進捗共有", news: "📰 ニュース勉強会", exchange: "💬 意見交換会" };

export function parseLayout(text) {
  let raw = {};
  try { raw = JSON.parse(text || "{}") || {}; } catch { raw = {}; }
  const custom = {};
  for (const [id, c] of Object.entries(raw.custom || {}).slice(0, 20)) {
    if (!/^c[a-z0-9]{1,16}$/.test(id)) continue;
    custom[id] = { title: String(c?.title || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 40) || "（題名なし）", body: String(c?.body || "").slice(0, 5000) };
  }
  const order = (Array.isArray(raw.order) ? raw.order : []).filter((k, i, a) => (FIXED.includes(k) || custom[k]) && a.indexOf(k) === i);
  FIXED.forEach((k, i) => { if (!order.includes(k)) order.splice(Math.min(i, order.length), 0, k); });
  for (const id of Object.keys(custom)) if (!order.includes(id)) order.push(id);
  return { order, custom };
}

// 保存する形（送られたものを整える。何も足していない・並びも元のままなら空にしておく）
export function cleanLayout(text) {
  if (!text) return "";
  const l = parseLayout(text);
  if (!Object.keys(l.custom).length && l.order.join() === FIXED.join()) return "";
  return JSON.stringify(l);
}
