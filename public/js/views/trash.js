// 最近削除した項目：消したMTG（議事録ごと）とタスクを30日のあいだ残し、元に戻せる
import { api, esc, busy, toast, confirmDialog, fmtDateTime, jstDateTime } from "../lib.js";
import { ico } from "../icons.js";

export async function renderTrash(el) {
  const { items, keepDays } = await api("/api/trash");
  el.innerHTML = `
    <nav class="breadcrumb"><a href="#/check">確認する</a> / 最近削除した項目</nav>
    <div class="page-heading left"><h1>${ico("trash")} 最近削除した項目</h1>
      <p>消したMTG（議事録・そこで作ったタスクごと）とタスクは、${keepDays}日のあいだここに残ります。「元に戻す」で戻せます。</p></div>
    ${items.length ? `<ul class="list">${items.map((t) => `
      <li class="list-item">
        <span><strong>${ico(t.kind === "meeting" ? "calendar" : "check")} ${esc(t.title)}</strong>
          <span class="muted small">${esc(t.project_name)}・${esc(t.deleted_by_name || "")}が ${fmtDateTime(jstDateTime(t.deleted_at))} に削除</span></span>
        <div class="meta"><button type="button" class="small" data-restore="${t.id}">${ico("undo")} 元に戻す</button></div>
      </li>`).join("")}</ul>` : `<p class="muted">最近削除したものはありません。</p>`}`;
  el.querySelectorAll("[data-restore]").forEach((b) => b.addEventListener("click", async () => {
    const t = items.find((x) => x.id === Number(b.dataset.restore));
    if (!await confirmDialog(`「${t.title}」を元に戻しますか？`, { ok: "元に戻す" })) return;
    busy(b, () => api(`/api/trash/${t.id}/restore`, { method: "POST", body: {} }))
      .then((res) => { toast("元に戻しました"); location.hash = res.link; }).catch(() => {});
  }));
}
