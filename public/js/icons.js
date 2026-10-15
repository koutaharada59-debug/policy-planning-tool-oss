// 画面のアイコン（線で描いたもの。メニューのバーと同じ太さ・同じ角の丸さ）
// ico("check") のように名前で呼ぶと、<svg> を返す。色は文字の色（見出しの中では緑）
// 絵文字の代わりに使う。議事録の中身（💡・▶ など）や、Notion・Discordに送る文字には使わない
const P = {
  bell: `<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.6 2.2H4.4z"/><path d="M10 20.6a2.1 2.1 0 0 0 4 0"/>`,
  check: `<circle cx="12" cy="12" r="8.5"/><path d="M8.2 12.3l2.6 2.6 5-5.3"/>`,
  note: `<path d="M13.5 4.5H7A1.5 1.5 0 0 0 5.5 6v12A1.5 1.5 0 0 0 7 19.5h10a1.5 1.5 0 0 0 1.5-1.5v-6.5"/><path d="M17.3 3.9a1.7 1.7 0 0 1 2.4 2.4l-7.4 7.4-3.1.8.8-3.1z"/>`,
  edit: `<path d="M15.3 4.7a1.9 1.9 0 0 1 2.7 0l1.3 1.3a1.9 1.9 0 0 1 0 2.7L9 19H5v-4z"/><path d="M13.5 6.5l4 4"/>`,
  play: `<path class="solid" d="M8 5.6v12.8a.8.8 0 0 0 1.2.7l10-6.4a.8.8 0 0 0 0-1.4l-10-6.4A.8.8 0 0 0 8 5.6z"/>`,
  pause: `<path class="solid" d="M7 5h3.2v14H7zM13.8 5H17v14h-3.2z"/>`,
  calendar: `<rect x="3.5" y="5.5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3.5v4M16 3.5v4"/><path class="pt" d="M8 14h.01M12 14h.01M16 14h.01M8 17.2h.01M12 17.2h.01"/>`,
  mic: `<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v3M9 20.5h6"/>`,
  party: `<path d="M4.5 19.5l3.8-10.8 7 7z"/><path d="M8.3 8.7c1.6 1.6 4.4 4.4 7 7"/><path d="M13 3.8l.4 1.8M20.2 11l-1.8-.4M17.5 5l-1.6 1.6M14.5 9.5c.8-1.4 2.2-2 3.8-1.7"/>`,
  chart: `<path d="M3.5 20h17"/><path d="M6.5 20v-7M11 20V5.5M15.5 20v-9.5M20 20V8"/>`,
  chat: `<path d="M5 5.5h14A1.5 1.5 0 0 1 20.5 7v8.5A1.5 1.5 0 0 1 19 17h-8.2L6.5 20.3V17H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5z"/><path d="M8 10.2h8M8 13.2h5"/>`,
  undo: `<path d="M8.5 14.5 4 10l4.5-4.5"/><path d="M4 10h10.5a5 5 0 0 1 0 10H11"/>`,
  sprout: `<path d="M12 20.5V11.5"/><path d="M12 11.5C12 7.6 9.4 5.2 5.2 5.3c0 4.1 2.6 6.4 6.8 6.2z"/><path d="M12 14c.1-3.3 2.3-5.4 6.3-5.4 0 3.6-2.2 5.6-6.3 5.4z"/>`,
  users: `<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.2a5.5 5.5 0 0 1 11 0"/><circle cx="16.8" cy="9.6" r="2.6"/><path d="M15.6 14.1a4.8 4.8 0 0 1 4.9 5"/>`,
  doc: `<path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3.5V8h4.5M9 12.5h6M9 16h6"/>`,
  megaphone: `<path d="M4 10v3.8a1 1 0 0 0 1 1h2.2l8.3 4.7V4.5L7.2 9H5a1 1 0 0 0-1 1z"/><path d="M18.6 9.3a3.6 3.6 0 0 1 0 5.4M7.6 14.8l1.3 4.7"/>`,
  link: `<path d="M10.2 13.8a4 4 0 0 0 5.6 0l3-3a4 4 0 0 0-5.6-5.6l-1 1"/><path d="M13.8 10.2a4 4 0 0 0-5.6 0l-3 3a4 4 0 0 0 5.6 5.6l1-1"/>`,
  search: `<circle cx="10.8" cy="10.8" r="6.3"/><path d="M15.6 15.6l4.9 4.9"/>`,
  landmark: `<path d="M3.5 9.4 12 4.5l8.5 4.9M5 9.6h14M6.5 10.5v6.5M10 10.5v6.5M14 10.5v6.5M17.5 10.5v6.5M4 19.5h16"/>`,
  clipboard: `<rect x="5.5" y="5" width="13" height="15.5" rx="1.8"/><path d="M9 5V4.3a.8.8 0 0 1 .8-.8h4.4a.8.8 0 0 1 .8.8V5M9 11h6M9 14.5h4"/>`,
  handshake: `<path d="M2.8 11.8 6.3 7.6l3.2 1.1"/><path d="M21.2 11.8 17.7 7.6l-4.6 1.5-3.3 2.6a1.5 1.5 0 0 0 2 2.2l2.6-2 3.9 3.8"/><path d="M18.3 15.7 15.6 18a1.3 1.3 0 0 1-1.9-.1l-.5-.5-1 .8a1.3 1.3 0 0 1-1.8-.1l-.4-.4-.8.6a1.3 1.3 0 0 1-1.8-.2L5 15.3l-2.2-3.5"/>`,
  trash: `<path d="M4.5 7h15M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2"/><path d="M6.5 7l.8 12.1a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7M10 11v5.5M14 11v5.5"/>`,
  history: `<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.3v3.4h3.4M12 8v4.2l2.8 1.8"/>`,
  ballot: `<path d="M4.5 12.5h15v7a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z"/><path d="M8.5 12.5v-7a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v7M10.5 8.5l1.2 1.2 2.3-2.4"/>`,
  folder: `<path d="M3.5 7A1.5 1.5 0 0 1 5 5.5h4.3l2 2.2H19a1.5 1.5 0 0 1 1.5 1.5V18a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18z"/><path d="M3.5 10.2h17"/>`,
  books: `<path d="M4.5 4.5h3.5v15H4.5zM10 4.5h3.5v15H10z"/><path d="M15.4 5.6l3.2-.9 3.5 14-3.2.9z"/>`,
  info: `<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.3M12 7.9h.01"/>`,
  rocket: `<path d="M12 3.5c3.4 1.9 4.9 5.4 4.4 9.8L14 15.8h-4l-2.4-2.5C7.1 8.9 8.6 5.4 12 3.5z"/><circle cx="12" cy="9.6" r="1.7"/><path d="M9.6 15.8 8 20l3-1.4M14.4 15.8 16 20l-3-1.4"/>`,
  tools: `<path d="M15 3.8a4.6 4.6 0 0 0-4.4 6L4.4 16a2.2 2.2 0 0 0 3.1 3.1l6.2-6.2a4.6 4.6 0 0 0 6-4.4l-2.9 1.3-2.4-2.4z"/>`,
  puzzle: `<path d="M9.5 4.5h3.2v1.8a1.6 1.6 0 1 0 3.2 0V4.5h3.6v4.4h-1.8a1.6 1.6 0 1 0 0 3.2h1.8v7.4h-4.4v-1.8a1.6 1.6 0 1 0-3.2 0v1.8H4.5v-4.4h1.8a1.6 1.6 0 1 0 0-3.2H4.5V4.5z"/>`,
  talk: `<path d="M4.2 5.5h10.6a1.2 1.2 0 0 1 1.2 1.2v6.1a1.2 1.2 0 0 1-1.2 1.2H9.3l-3.6 3v-3H4.2A1.2 1.2 0 0 1 3 12.8V6.7a1.2 1.2 0 0 1 1.2-1.2z"/><path d="M18.5 9.2h1.3A1.2 1.2 0 0 1 21 10.4v6a1.2 1.2 0 0 1-1.2 1.2h-1.3v2.6l-3.1-2.6h-3.8a1.2 1.2 0 0 1-1.2-1.2v-.6"/>`,
  hourglass: `<path d="M7 3.5h10M7 20.5h10"/><path d="M8 3.5c0 4.3 8 4.3 8 8.5s-8 4.2-8 8.5M16 3.5c0 4.3-8 4.3-8 8.5s8 4.2 8 8.5"/>`,
  timer: `<circle cx="12" cy="13.5" r="7"/><path d="M12 13.5V10M10 3.5h4M17.8 7.7l1.5-1.5"/>`,
  warning: `<path d="M10.5 4.6a1.7 1.7 0 0 1 3 0l7.2 12.6a1.7 1.7 0 0 1-1.5 2.6H4.8a1.7 1.7 0 0 1-1.5-2.6z"/><path d="M12 9.8v4.2M12 16.8h.01"/>`,
  crown: `<path d="M4.3 17.5 3.5 8.2l4.6 3.6L12 6l3.9 5.8 4.6-3.6-.8 9.3z"/><path d="M4.8 20.3h14.4"/>`,
  archive: `<rect x="3.5" y="5" width="17" height="4.2" rx="1"/><path d="M5 9.2v9.3a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V9.2M10 13h4"/>`,
  image: `<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.7"/><path d="m4 17.5 5-4.6 3.5 3.2 2.5-2.3 5 4.2"/>`,
  bolt: `<path d="M13 3.5 5.5 13.5H12l-1 7 7.5-10H12z"/>`,
  trophy: `<path d="M7.5 4.5h9v4a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 6H4.8a3 3 0 0 0 2.9 3.5M16.5 6h2.7a3 3 0 0 1-2.9 3.5M12 13v3.5M8.5 20.5h7M9.5 16.5h5v4h-5z"/>`,
  clock: `<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>`,
  shuffle: `<path d="M3.5 7.5H7c4.6 0 5.4 9 10 9h3.5M3.5 16.5H7c1.8 0 3-1.4 4-3.1M20.5 7.5H17c-1.8 0-3 1.4-4 3.1"/><path d="M18 5l2.5 2.5L18 10M18 14l2.5 2.5L18 19"/>`,
  minus: `<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12h7"/>`,
  square: `<rect x="4.5" y="4.5" width="15" height="15" rx="3"/>`,
  home: `<path d="M3.5 11.4 12 4.5l8.5 6.9"/><path d="M5.5 9.9v9.6h4v-5h5v5h4V9.9"/>`,
  news: `<path d="M5 5.5h11.5v13a1.5 1.5 0 0 0 1.5 1.5H6.5A1.5 1.5 0 0 1 5 18.5z"/><path d="M16.5 9h2.5v9.5a1.5 1.5 0 0 1-3 0M8 9h5.5M8 12.5h5.5M8 16h3.5"/>`,
};

// 絵文字 → アイコンの名前（同じ意味の絵文字はまとめる）
export const EMOJI_ICON = {
  "🔔": "bell", "✅": "check", "☑": "check", "📝": "note", "✏": "edit", "▶": "play", "⏸": "pause", "🗓": "calendar", "📅": "calendar",
  "🎤": "mic", "🎉": "party", "📊": "chart", "💬": "chat", "↩": "undo", "🌱": "sprout", "👥": "users", "📄": "doc", "📣": "megaphone",
  "📢": "megaphone", "🔗": "link", "🔎": "search", "🔍": "search", "🏛": "landmark", "📋": "clipboard", "🤝": "handshake", "🗑": "trash",
  "🕘": "history", "🗳": "ballot", "📁": "folder", "📚": "books", "ℹ": "info", "🚀": "rocket", "🛠": "tools", "🧩": "puzzle",
  "🗣": "talk", "⏳": "hourglass", "⏱": "timer", "⚠": "warning", "👑": "crown", "🗂": "archive", "🖼": "image", "⚡": "bolt",
  "🏆": "trophy", "🕒": "clock", "🔀": "shuffle", "➖": "minus", "⬜": "square", "📰": "news", "🏠": "home",
};

export function ico(name, cls = "") {
  const body = P[name];
  if (!body) return "";
  return `<svg class="ico ico-${name}${cls ? ` ${cls}` : ""}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
}

// 頭に絵文字の付いた見出し（例：「📢 事務連絡」）を、アイコン＋文字（エスケープ済み）にする。絵文字がなければ文字だけ
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function iconText(text) {
  const s = String(text ?? "");
  const m = s.match(/^(\p{Extended_Pictographic}|[↩ℹ])️?\s*/u);
  const name = m && EMOJI_ICON[m[1]];
  const rest = (name ? s.slice(m[0].length) : s).replace(/[&<>"']/g, (c) => ESC[c]);
  return name ? `${ico(name)} ${rest}` : rest;
}
