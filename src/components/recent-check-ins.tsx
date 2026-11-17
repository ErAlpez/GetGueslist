"use client";

import { useState } from "react";
import { CheckCircle2, Clock3 } from "lucide-react";
import { localizeNode, type Locale } from "@/lib/localization";
import "./recent-check-ins.css";

type RecentLog = { id: string; name: string; method: string; time: string };

export function RecentCheckIns({ logs, locale }: { logs: RecentLog[]; locale: Locale }) {
  const ids = logs.map((log) => log.id);
  const signature = JSON.stringify(ids);
  const [previous, setPrevious] = useState(() => ({ signature, ids: new Set(ids), highlighted: new Set<string>() }));

  if (previous.signature !== signature) {
    setPrevious({
      signature,
      ids: new Set(ids),
      highlighted: new Set(ids.filter((id) => !previous.ids.has(id) || previous.highlighted.has(id))),
    });
  }

  return localizeNode((
    <section className="app-panel recent-checkins">
      <div className="panel-heading-row"><div><h2>Recent check-ins</h2><p>Latest validated tickets for this event.</p></div><span className="recent-live"><CheckCircle2 size={13} /> Live log</span></div>
      {logs.length ? (
        <div className="recent-checkin-list">{logs.map((log) => (
          <div className={`recent-checkin-row${previous.highlighted.has(log.id) ? " recent-checkin-new" : ""}`} key={log.id}>
            <span aria-hidden="true" className="recent-checkin-icon"><CheckCircle2 size={18} /></span>
            <span className="recent-checkin-copy"><strong>{log.name}</strong><small>{log.method} check-in</small></span>
            <span className="recent-checkin-time"><Clock3 size={12} />{log.time}</span>
          </div>
        ))}</div>
      ) : <div className="recent-empty">Check-ins will appear here as guests arrive.</div>}
    </section>
  ), locale);
}
