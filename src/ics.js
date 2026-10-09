// ICS（iCalendar）の生成。時刻はすべて日本時間（Asia/Tokyo）で書く

const VTIMEZONE = [
  "BEGIN:VTIMEZONE", "TZID:Asia/Tokyo",
  "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZOFFSETFROM:+0900", "TZOFFSETTO:+0900", "TZNAME:JST", "END:STANDARD",
  "END:VTIMEZONE",
];

const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function escapeText(s) {
  return String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
}

// 'YYYY-MM-DDTHH:MM' → 'YYYYMMDDTHHMM00'
function icsLocal(dt) {
  return `${dt.replace(/[-:]/g, "")}00`;
}

function addMinutes(dt, minutes) {
  const d = new Date(`${dt}:00Z`);
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return d.toISOString().slice(0, 16);
}

// 75 オクテットで折り返す（日本語は文字単位で安全側に 40 文字ずつ）
function fold(line) {
  const out = [];
  for (let i = 0; i < line.length; i += 40) out.push((i ? " " : "") + line.slice(i, i + 40));
  return out.join("\r\n");
}

export function weeklyRule(weekdays, interval) {
  // 隔週の数え方を schedule.js（日曜始まり）とそろえる
  return `FREQ=WEEKLY;INTERVAL=${interval};WKST=SU;BYDAY=${weekdays.map((d) => BYDAY[d]).join(",")}`;
}

// events: [{ uid, start, durationMin, title, description, location, rrule? }]
export function buildIcs(events) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//policy-planning//JA", "CALSCALE:GREGORIAN", ...VTIMEZONE];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Asia/Tokyo:${icsLocal(e.start)}`,
      `DTEND;TZID=Asia/Tokyo:${icsLocal(addMinutes(e.start, e.durationMin))}`,
      `SUMMARY:${escapeText(e.title)}`,
    );
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    if (e.rrule) lines.push(`RRULE:${e.rrule}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function icsResponse(body, filename) {
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
