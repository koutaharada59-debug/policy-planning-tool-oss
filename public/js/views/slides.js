// スライドの構成（Figmaで作る発表資料のテンプレート）
//   share：政調での課題共有（現状・課題、決まっていれば今の方向性・仮の施策）
//   final：政調での最終発表（課題共有の現状・課題に加えて、施策をしっかり）
// PJの樹形図・施策・資料から、書けるところは下書きを入れておく。Figmaのテンプレートに1枚ずつ写して使う
import { api, esc, state, copyText, toast, hashQuery, fmtDate } from "../lib.js";

const lines = (...xs) => xs.flat().filter(Boolean).join("\n");
const bullet = (xs) => xs.filter(Boolean).map((x) => `・${x}`);

export async function renderSlides(el, projectId) {
  const kind = hashQuery().get("kind") === "final" ? "final" : "share";
  const [pj, tree] = await Promise.all([api(`/api/projects/${projectId}`), api(`/api/projects/${projectId}/tree`)]);
  const p = pj.project;
  const stageDate = (role) => {
    const no = state.types[p.type]?.stages.find((s) => s.role === role)?.no;
    return pj.stages.find((s) => s.stage_no === no)?.start_date;
  };
  const date = kind === "share" ? stageDate("share") : p.presentation_date || stageDate("presentation");
  const issues = tree.nodes.filter((n) => n.kind === "issue");
  const causesOf = (id) => tree.nodes.filter((n) => n.parent_id === id);
  const usedSources = new Set(tree.nodes.flatMap((n) => n.source_ids || []));
  const sources = (tree.sources || []).filter((s) => usedSources.has(s.id) || s.project_id === p.id);
  const measures = tree.measures || [];

  // 共通のスライド
  const cover = { title: "表紙", guide: "PJ名・発表の日・メンバー（本名の苗字）", draft: lines(p.name, date ? fmtDate(date) : "", `メンバー：${pj.members.map((m) => m.name).join("、")}`) };
  const intro = { title: "自己紹介", guide: "このテーマに関心を持ったきっかけ・バックグラウンド（1人1〜2行）", draft: lines(pj.members.map((m) => `${m.name}：`)) };
  const genjo = {
    title: "現状", guide: "いま何が起きているか。数字と出典を必ず入れる（出典のない数字は使わない）",
    draft: lines(issues.map((n) => n.evidence && `${n.title}：${n.evidence}`), measures.map((m) => m.current_state)),
  };
  const kadai = {
    title: "課題", guide: "現状のどこが問題か。数字で示す。対象（誰の問題か）をはっきりさせる",
    draft: lines(bullet(issues.map((n) => n.title)), measures.map((m) => m.problem)),
  };
  const genin = {
    title: "原因（なぜそうなっているのか）", guide: "樹形図の「原因」。課題 → 原因 のつながりを図で見せる",
    draft: lines(issues.map((n) => { const c = causesOf(n.id); return c.length ? `${n.title}\n${bullet(c.map((x) => x.title)).join("\n")}` : ""; })),
  };
  const refs = { title: "出典", guide: "使った数字・資料の出典の一覧（一次出典を確認したもの）", draft: lines(sources.map((s) => `・${s.title}${s.publisher ? `（${s.publisher}）` : ""}${s.url ? ` ${s.url}` : ""}`)) };

  const slides = kind === "share" ? [
    cover,
    intro,
    { title: "今日伝えたいこと", guide: "結論を先に。「〇〇が課題で、〇〇の方向で考えています」を1枚で", draft: lines(issues[0] && `課題：${issues[0].title}`, measures[0] && `方向性：${measures[0].title}`) },
    { title: "理想像", guide: "目指す姿（どうなっていたら良いか）。チームですり合わせたもの", draft: "" },
    genjo,
    kadai,
    genin,
    { title: "今の方向性（仮の施策）", guide: "決まっていれば。まだ「案」として、どの方向で施策を考えるかを書く。決まっていなければ省く", draft: lines(bullet(measures.map((m) => m.title))) },
    { title: "政調に聞きたいこと", guide: "フィードバックがほしい点（課題の絞り方・対象・方向性など）", draft: "" },
    refs,
  ] : [
    cover,
    intro,
    { title: "提言のまとめ", guide: "課題 → 施策を1枚で（アブストラクトと同じ内容）。いちばん伝えたいことを先に", draft: lines(bullet(issues.map((n) => n.title)), measures.length ? "↓" : "", bullet(measures.map((m) => m.title))) },
    genjo,
    kadai,
    genin,
    ...(measures.length ? measures : [{ title: "" }]).flatMap((m, i) => {
      const name = m.title ? `施策${measures.length > 1 ? i + 1 : ""}：${m.title}` : "施策";
      return [
        { title: `${name}（何をするか）`, guide: "誰が（主語を明確に）・何を・どうするか。1スライド1メッセージ", draft: m.what || "" },
        { title: `${name}（導入フロー）`, guide: "既存の枠組みに乗せる形で、どう導入するか", draft: m.flow || "" },
        { title: `${name}（参考事例）`, guide: "国内＝制度的に実現できる根拠、海外＝やってみたらできたという証明", draft: m.cases || "" },
        { title: `${name}（予算感）`, guide: "既存の類似事業を参考に試算する", draft: m.budget || "" },
        { title: `${name}（想定される質問・壁になる法律）`, guide: "FAQ。どの法律が壁になるか", draft: m.faq || "" },
      ];
    }),
    { title: "まとめ", guide: "もう一度、課題と施策と、いちばん伝えたいこと", draft: "" },
    refs,
  ];

  const label = kind === "share" ? "課題共有" : "最終発表";
  el.innerHTML = `
    <nav class="breadcrumb"><a href="#/projects">PJ</a> / <a href="#/projects/${p.id}">${esc(p.name)}</a> / スライドの構成</nav>
    <div class="page-heading left"><h1>📐 ${label}のスライドの構成</h1>
      <p>Figmaのスライドテンプレートに、この順で1枚ずつ作ります。下書きは、このPJの樹形図・施策・資料から入れています（空欄は、これから書くところ）。</p></div>
    <div class="tabs" role="tablist">
      <a role="tab" class="tab" aria-selected="${kind === "share"}" href="#/projects/${p.id}/slides?kind=share">課題共有</a>
      <a role="tab" class="tab" aria-selected="${kind === "final"}" href="#/projects/${p.id}/slides?kind=final">最終発表</a>
    </div>
    <p class="row-left"><button type="button" class="primary" id="copy-slides">📋 構成をまとめてコピー</button>
      <span class="muted small">${slides.length}枚・Figmaやドキュメントに貼り付けて使えます</span></p>
    <ol class="slide-list">${slides.map((s, i) => `
      <li class="card slide-card">
        <div class="slide-no">${i + 1}</div>
        <div class="slide-body">
          <h3>${esc(s.title)}</h3>
          <p class="muted small">${esc(s.guide)}</p>
          ${s.draft ? `<pre class="slide-draft">${esc(s.draft)}</pre>` : `<p class="slide-empty small">（ここはこれから書く）</p>`}
        </div>
      </li>`).join("")}</ol>
    <p class="muted small">樹形図・施策のタブを書き進めると、ここの下書きも増えます。発表のときは「1スライド1メッセージ」「要点を先に」「文字は少なく、図や表を使う」。</p>`;

  el.querySelector("#copy-slides").addEventListener("click", async () => {
    const text = [`${p.name}　${label}のスライドの構成`, "",
      ...slides.map((s, i) => lines(`【${i + 1}】${s.title}`, `（${s.guide}）`, s.draft) + "\n")].join("\n");
    await copyText(text);
    toast("スライドの構成をコピーしました");
  });
}
