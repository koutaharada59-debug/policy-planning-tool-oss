// PJの型ごとの工程とチェックリストの雛形（運用マニュアル「提言書型PJの進め方」より）
// 型を増やすときは PROJECT_TYPES に1件足す。PJ作成時にチェックリストをPJ側へ複製するので、
// ここを変えても既存PJのチェックリストは変わらない。
//
// schedule: 工程の予定期間の決め方
//   { fromStart: [開始日からの日数, 終了日の日数] }  … 開始日（1週目の初日）基準
//   { beforePresentation: true }                    … 発表日の前日まで
//   { presentation: true }                          … 発表日当日
//   { afterPresentation: [開始, 終了] }              … 発表日からの日数
//
// checklist: [項目, ヒント, { notifyLeaders }]。notifyLeaders はチェックしたら部門長・副部門長に知らせる項目
// role: 画面やAPIが工程を探すときの名前（番号は工程を足すとずれるので、番号ではなく role で探す）

export const PROJECT_TYPES = {
  teigen: {
    label: "提言書型",
    defaultPresentationOffset: 55, // 発表日が未定のあいだは「8週目の最終日」とみなす
    stages: [
      {
        no: 0,
        name: "PJ決め",
        period: "0週目",
        summary: "ニュースや身の回りから「政策の種」を見つけ、深掘りする価値を見極めてPJを決めます。",
        schedule: { fromStart: [-7, -1] },
        checklist: [
          ["「なぜAはBなのか」の形で政策の種をフォーラムに投稿する", "例：なぜ地熱発電の推進は進まないのか"],
          ["軽くリサーチして、深掘りする価値があるか見極める", "AIで調べた情報は必ず一次出典を確認する"],
          ["話し合って合意し、PJを決める", ""],
          ["本文を書くGoogleドキュメントを用意し、PJに登録する", ""],
          ["MTGの進め方（定例 or 毎回決める）を決める", "目安は週1〜2回"],
        ],
      },
      {
        no: 1,
        role: "research",
        name: "課題・現状リサーチ",
        period: "1〜2週目",
        summary: "対象の全体像をつかみ、課題を絞ります。いきなり施策を考えないこと。",
        schedule: { fromStart: [0, 9] },
        checklist: [
          ["理想像・現状・対象をチームですり合わせる", ""],
          ["国内・海外の先行事例をリサーチする", ""],
          ["テーマと対象を絞り、課題を決める", ""],
          ["（任意）現場の人へのヒアリングから始める", "学生チーム外の人へはヒアリング申請を出す"],
        ],
      },
      {
        no: 2,
        role: "share_prep",
        name: "課題共有の資料作成・発表準備",
        period: "2週目後半",
        summary: "絞った課題を政調に共有するための資料を作り、発表の準備をします。",
        schedule: { fromStart: [10, 12] },
        checklist: [
          ["共有する内容（理想像・現状・対象・絞った課題）を資料にまとめる", "どこが問題かを数字で示す。出典のない数字は使わない"],
          ["資料の形式を決める（ドキュメント or スライド）", ""],
          ["役割分担を決める（司会・資料係・議事録係）", ""],
          ["リハーサルをする", "PJメンバー以外にも見てもらう"],
          ["部門長をメンションして、共有資料を前日までにフォーラムに投稿する", "政調への送付は部門長が行います。チェックすると部門長・副部門長に通知が届きます", { notifyLeaders: true }],
        ],
      },
      {
        no: 3,
        role: "share",
        name: "政調での課題共有",
        period: "2週目末",
        summary: "政調に課題を共有し、フィードバックをもらいます。直後にふり返り、施策考案の方針を決めます。",
        schedule: { fromStart: [13, 13] },
        checklist: [
          ["自己紹介を入れる（関心を持ったきっかけ・バックグラウンド）", ""],
          ["議事録係（発表しないメンバー）を決めておく", ""],
          ["政調からのフィードバックを記録する", ""],
          ["共有の直後にふり返りをし、施策考案の方針を決める", ""],
        ],
      },
      {
        no: 4,
        role: "measures",
        name: "施策考案",
        period: "3〜5週目",
        summary: "課題ごとに担当を決め、施策を型に沿って整理します。",
        schedule: { fromStart: [14, 34] },
        checklist: [
          ["課題ごとに担当を決める", ""],
          ["施策を型で整理する", "現状・課題・参考事例・施策（何をするか・導入フロー・予算感）・FAQ"],
          ["課題は、現状のどこが問題かを数字で示す", "出典のない数字は使わない"],
          ["参考事例を国内・海外の両方で探す", "国内＝制度的な実現可能性の根拠、海外＝概念実証"],
          ["主語を明確にする", ""],
          ["壁になる法律を整理する", ""],
          ["予算は既存の類似事業を参考に試算する", ""],
          ["導入フローは既存の枠組みに乗せる形で考える", ""],
          ["課題・施策を明確にしたうえで現場ヒアリングをする", "学生チーム外の人へはヒアリング申請を出す"],
        ],
      },
      {
        no: 5,
        role: "final_prep",
        name: "提言書作成・発表準備",
        period: "6〜8週目",
        summary: "アブストラクトを先に出し、発表資料を作ってリハーサルを重ねます。",
        schedule: { fromStart: [35, null], beforePresentation: true },
        checklist: [
          ["アブストラクト（A4・1ページ）を本文の完成前に提出する", "どんな課題があり、どう解決する提案かをひと目で分かるように"],
          ["アウトプットの形式を決める（ドキュメント or スライド）", "スライドはFigmaのテンプレートで政策立案部門が作成"],
          ["役割分担を決める（司会・スライド係・議事録係・スクショ係）", ""],
          ["リハーサルを2週間前から複数回行う", "PJメンバー以外、他部門の人にも見てもらう"],
          ["部門長をメンションして、発表資料を前日までにフォーラムに投稿する", "党本部への送付は部門長が行います。チェックすると部門長・副部門長に通知が届きます", { notifyLeaders: true }],
        ],
      },
      {
        no: 6,
        role: "presentation",
        name: "政調での最終発表",
        period: "8週目末",
        summary: "政調で発表し、フィードバックをもらいます。直後にレビュー会を開きます。",
        schedule: { presentation: true },
        checklist: [
          ["自己紹介を入れる（関心を持ったきっかけ・バックグラウンド）", ""],
          ["メンバー同士は本名（苗字）で呼ぶ", ""],
          ["議事録係（発表しないメンバー）を決めておく", ""],
          ["口語（「じゃあ」等）に注意する", ""],
          ["（可能であれば）録画・録音を依頼する", ""],
          ["発表直後にレビュー会を開き、1カ月の修正方針を決める", ""],
        ],
      },
      {
        no: 7,
        role: "final",
        name: "修正・最終提出",
        period: "9〜12週目",
        summary: "フィードバックをもとに、残り約1カ月で完成させて提出します。",
        schedule: { afterPresentation: [1, 28] },
        checklist: [
          ["フィードバックをもとに改めてリサーチする", ""],
          ["リサーチ内容をもとに提言書へ直接修正を加える", ""],
          ["読み合わせをする", ""],
          ["部門長をメンションして、改訂版をフォーラムに投稿する", "党本部への提出は部門長が行います。チェックすると部門長・副部門長に通知が届きます", { notifyLeaders: true }],
        ],
      },
    ],
  },
};

// 役割（role）から工程番号を探す（例：stageNo("teigen", "presentation")）
export function stageNo(type, role) {
  return getType(type).stages.find((s) => s.role === role)?.no;
}

export function getType(type) {
  const t = PROJECT_TYPES[type];
  if (!t) throw new Error(`unknown project type: ${type}`);
  return t;
}

// 'YYYY-MM-DD' に日数を足す
export function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// 開始日と発表日から、各工程の予定期間を出す。発表日が未定なら型の既定（8週目末）を使う
export function computeStageDates(type, startDate, presentationDate) {
  const t = getType(type);
  const presentation = presentationDate || addDays(startDate, t.defaultPresentationOffset);
  return t.stages.map((s) => {
    const sc = s.schedule;
    let start;
    let due;
    if (sc.presentation) {
      start = due = presentation;
    } else if (sc.afterPresentation) {
      start = addDays(presentation, sc.afterPresentation[0]);
      due = addDays(presentation, sc.afterPresentation[1]);
    } else {
      start = addDays(startDate, sc.fromStart[0]);
      due = sc.beforePresentation ? addDays(presentation, -1) : addDays(startDate, sc.fromStart[1]);
    }
    return { stage_no: s.no, start_date: start, due_date: due };
  });
}

// 画面に渡す用（関数を含まない形）
export function typesForClient() {
  return Object.fromEntries(
    Object.entries(PROJECT_TYPES).map(([key, t]) => [
      key,
      { label: t.label, stages: t.stages.map(({ no, role, name, period, summary }) => ({ no, role, name, period, summary })) },
    ])
  );
}
