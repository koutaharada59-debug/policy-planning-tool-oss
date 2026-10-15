// 日程調整アンケートの「画面そっくりの画像」を作る（Discordの投稿に付ける。src/discord-post.js）
// サーバーでは画像を作れない（無料プランの計算時間の上限）ので、答えた人の画面で canvas に描いて送る。
// 描くもの：PJ名・回答人数・まだの人、候補ごとの日時・○△×の数・いちばん集まっている印・○△の人のアイコン
import { api } from "./lib.js";

const W = 720;            // 画像の幅（CSSのピクセル。2倍の細かさで描く）
const PAD = 24;
const FONT = '"Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif';
const C = { bg: "#f7faf8", ink: "#2b3533", muted: "#5b6563", line: "#d9e9e3", green: "#3cc4ad", bestBg: "#f3fbf7", yes: "#3fc58f", maybe: "#d9a400", tagBg: "#fff3c4", tagInk: "#7a5a00", chip: "#d8f3ea", chipInk: "#1a9c86" };
const WEEK = "日月火水木金土";
const when = (dt) => {
  const d = new Date(`${dt.slice(0, 10)}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${WEEK[d.getUTCDay()]}）${dt.slice(11, 16)}`;
};

// アイコンの画像を読む（読めないとき・描くと画像を送れなくなるときは、名前の1文字目で描く）
const loadImg = (src) => new Promise((resolve) => {
  if (!src) return resolve(null);
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = src;
  setTimeout(() => resolve(null), 4000);
});

function wrap(ctx, text, maxWidth) {
  const lines = [];
  let cur = "";
  for (const ch of text) {
    if (ctx.measureText(cur + ch).width > maxWidth && cur) { lines.push(cur); cur = ""; }
    cur += ch;
  }
  if (cur) lines.push(cur);
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// d：/api/schedule-polls/:id の返事。withAvatars=false なら、アイコンは名前の1文字目
export async function draw(d, withAvatars) {
  const { slots, members, project } = d;
  const ans = {};
  for (const a of d.answers) (ans[a.slot_id] ||= {})[a.user_id] = a.answer;
  const count = (s, k) => Object.values(ans[s.id] || {}).filter((a) => a === k).length;
  const score = (s) => count(s, "yes") * 2 + count(s, "maybe");
  const best = Math.max(0, ...slots.map(score));
  const answered = new Set(d.answers.map((a) => a.user_id));
  const waiting = members.filter((m) => !answered.has(m.id));
  await document.fonts?.load(`700 22px ${FONT}`).catch(() => {});
  await document.fonts?.load(`400 15px ${FONT}`).catch(() => {});
  const avatars = new Map();
  if (withAvatars) await Promise.all(members.map(async (m) => avatars.set(m.id, await loadImg(m.avatar))));

  // 先に高さを測る
  const probe = document.createElement("canvas").getContext("2d");
  probe.font = `400 15px ${FONT}`;
  const waitLines = waiting.length ? wrap(probe, `まだ答えていない人：${waiting.map((m) => m.name).join("、")}`, W - PAD * 2) : [];
  const PERSON = 76;                       // 1人分の幅（アイコン＋○△）
  const perRow = Math.max(1, Math.floor((W - PAD * 2 - 32) / PERSON));
  const who = (s) => members.map((m) => ({ m, a: ans[s.id]?.[m.id] })).filter((x) => x.a === "yes" || x.a === "maybe");
  const slotH = (s) => 16 + 30 + 26 + (who(s).length ? Math.ceil(who(s).length / perRow) * 40 : 0) + 12;
  const headH = 24 + 34 + 26 + waitLines.length * 22 + 14;
  const H = headH + slots.reduce((h, s) => h + slotH(s) + 12, 0) + 40;

  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "top";

  // 見出し
  let y = 24;
  ctx.fillStyle = C.ink;
  ctx.font = `800 24px ${FONT}`;
  ctx.fillText(`🗓 ${project.name}`.slice(0, 40), PAD, y);
  y += 34;
  ctx.font = `700 16px ${FONT}`;
  ctx.fillStyle = C.muted;
  ctx.fillText(`次回MTGの日程調整　回答 ${answered.size} / ${members.length}人${waiting.length ? `（あと${waiting.length}人）` : "（全員回答）"}`, PAD, y);
  y += 26;
  ctx.font = `400 15px ${FONT}`;
  for (const l of waitLines) { ctx.fillText(l, PAD, y); y += 22; }
  y += 14;

  // 候補
  for (const s of slots) {
    const h = slotH(s);
    const isBest = best > 0 && score(s) === best;
    roundRect(ctx, PAD, y, W - PAD * 2, h, 14);
    ctx.fillStyle = isBest ? C.bestBg : "#fff";
    ctx.fill();
    ctx.lineWidth = isBest ? 2 : 1.5;
    ctx.strokeStyle = isBest ? C.green : C.line;
    ctx.stroke();
    let x = PAD + 16;
    let yy = y + 16;
    ctx.fillStyle = C.ink;
    ctx.font = `800 22px ${FONT}`;
    const date = when(s.starts_at);
    ctx.fillText(date, x, yy);
    if (isBest) {
      const tx = x + ctx.measureText(date).width + 12;
      ctx.font = `700 13px ${FONT}`;
      const label = "いちばん集まっている";
      const tw = ctx.measureText(label).width + 20;
      roundRect(ctx, tx, yy + 1, tw, 26, 13);
      ctx.fillStyle = C.tagBg;
      ctx.fill();
      ctx.fillStyle = C.tagInk;
      ctx.fillText(label, tx + 10, yy + 6);
    }
    yy += 30;
    ctx.font = `500 15px ${FONT}`;
    ctx.fillStyle = C.muted;
    ctx.fillText(`○ ${count(s, "yes")}・△ ${count(s, "maybe")}・× ${count(s, "no")}`, x, yy);
    yy += 26;
    // ○△の人
    who(s).forEach(({ m, a }, i) => {
      const px = x + (i % perRow) * PERSON;
      const py = yy + Math.floor(i / perRow) * 40;
      const img = avatars.get(m.id);
      ctx.save();
      ctx.beginPath();
      ctx.arc(px + 16, py + 16, 16, 0, Math.PI * 2);
      ctx.closePath();
      if (img) { ctx.clip(); ctx.drawImage(img, px, py, 32, 32); } else {
        ctx.fillStyle = C.chip;
        ctx.fill();
        ctx.fillStyle = C.chipInk;
        ctx.font = `700 15px ${FONT}`;
        ctx.textAlign = "center";
        ctx.fillText((m.name || "?").slice(0, 1), px + 16, py + 7);
      }
      ctx.restore();
      ctx.font = `800 18px ${FONT}`;
      ctx.fillStyle = a === "yes" ? C.yes : C.maybe;
      ctx.fillText(a === "yes" ? "○" : "△", px + 38, py + 5);
    });
    y += h + 12;
  }
  // 下：いつの状態か
  ctx.font = `400 13px ${FONT}`;
  ctx.fillStyle = C.muted;
  const now = new Date();
  ctx.fillText(`政策立案ツールで答えられます（${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} の状態）`, PAD, y + 4);
  return canvas;
}

const toBase64 = (canvas) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (!blob) return reject(new Error("画像を作れませんでした"));
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(blob);
  }, "image/png");
});

// 作って送る（失敗しても画面の操作には影響させない）
export async function sendPollImage(d) {
  if (!d?.discord) return;
  let png;
  try {
    png = await toBase64(await draw(d, true));
  } catch {
    // アイコンの画像のせいで送れないときは、名前の1文字目で描き直す
    png = await toBase64(await draw(d, false));
  }
  await api("/api/discord-posts/image", { method: "POST", body: { kind: "p", id: d.poll.id, version: d.discord.version, png } });
}
