"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { ArrowLeft, RotateCcw, Sparkles, TicketCheck, Trophy, Users } from "lucide-react";
import { drawRaffleWinnerAction, resetRaffleAction } from "@/app/dashboard/events/[eventId]/raffle/actions";

type RaffleEntry = {
  id: string;
  name: string;
};

type RaffleWinner = RaffleEntry & {
  drawnAt: string;
};

export function LiveRafflePicker({
  checkedInCount,
  eventId,
  eventName,
  initialEntries,
  initialWinners,
}: {
  checkedInCount: number;
  eventId: string;
  eventName: string;
  initialEntries: RaffleEntry[];
  initialWinners: RaffleWinner[];
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [winners, setWinners] = useState(initialWinners);
  const [availableCount, setAvailableCount] = useState(initialEntries.length);
  const [displayName, setDisplayName] = useState(initialWinners[0]?.name ?? "Ready to draw");
  const [currentWinner, setCurrentWinner] = useState<RaffleWinner | null>(initialWinners[0] ?? null);
  const [pendingWinner, setPendingWinner] = useState<RaffleWinner | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!spinning || !pendingWinner) return;

    const rollNames = entries.map((entry) => entry.name);
    const interval = window.setInterval(() => {
      setDisplayName(rollNames.length ? rollNames[Math.floor(Math.random() * rollNames.length)] : "Drawing...");
    }, 75);
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 650 : 3800;
    const timeout = window.setTimeout(() => {
      setDisplayName(pendingWinner.name);
      setCurrentWinner(pendingWinner);
      setWinners((current) => [pendingWinner, ...current]);
      setSpinning(false);
      setPendingWinner(null);
    }, duration);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [entries, pendingWinner, spinning]);

  function drawWinner() {
    setError("");
    startTransition(async () => {
      const result = await drawRaffleWinnerAction(eventId);
      if (!result.success) {
        setError(result.error);
        return;
      }

      const remainingEntries = entries.filter((entry) => entry.id !== result.winner.id);
      setEntries(remainingEntries);
      setAvailableCount(result.remainingCount);
      setPendingWinner(result.winner);
      setDisplayName(remainingEntries[0]?.name ?? "Drawing...");
      setSpinning(true);
    });
  }

  function resetRaffle() {
    if (!window.confirm("Reset this raffle? This clears all winners and makes every checked-in guest eligible again.")) return;
    setError("");
    startTransition(async () => {
      const result = await resetRaffleAction(eventId);
      if (!result.success) {
        setError(result.error ?? "The raffle could not be reset.");
        return;
      }

      setEntries((current) => {
        const allEntries = new Map(current.map((entry) => [entry.id, entry]));
        for (const winner of winners) allEntries.set(winner.id, winner);
        return [...allEntries.values()];
      });
      setWinners([]);
      setAvailableCount(checkedInCount);
      setCurrentWinner(null);
      setPendingWinner(null);
      setDisplayName("Ready to draw");
      setSpinning(false);
    });
  }

  const busy = isPending || spinning;

  return (
    <main className="live-raffle">
      <header className="live-raffle-topbar">
        <Link className="live-raffle-back" href={`/dashboard/events/${eventId}`}>
          <ArrowLeft aria-hidden="true" size={16} /> Back to event
        </Link>
        <span className="live-raffle-event">{eventName}</span>
        <span className="live-raffle-brand"><Sparkles aria-hidden="true" size={14} /> VenuGuestPass Live Draw</span>
      </header>

      <div className="live-raffle-layout">
        <section aria-label="Lucky draw" className="live-raffle-stage">
          <div className="live-raffle-kicker"><TicketCheck aria-hidden="true" size={14} /> CHECKED-IN GUESTS ONLY</div>
          <h1>Live Raffle</h1>
          <p className="live-raffle-description">One fair draw from your arrivals. Winners stay out of the pool until you reset.</p>

          <div aria-live="polite" className={`raffle-slot${spinning ? " spinning" : ""}${currentWinner && !spinning ? " has-winner" : ""}`}>
            <div className="raffle-slot-label">{spinning ? "Picking a winner..." : currentWinner ? "Latest winner" : "The next lucky guest is"}</div>
            <div className="raffle-slot-name" key={spinning ? "spinning" : displayName}>{displayName}</div>
            <div className="raffle-slot-glow" aria-hidden="true" />
          </div>

          {error && <p className="live-raffle-error" role="alert">{error}</p>}

          <div className="live-raffle-controls">
            <button
              className="live-raffle-draw"
              disabled={busy || availableCount === 0}
              onClick={drawWinner}
              type="button"
            >
              <Sparkles aria-hidden="true" size={17} />
              {isPending ? "Selecting..." : spinning ? "Drawing..." : "Spin The Draw"}
            </button>
            {winners.length > 0 && (
              <button className="live-raffle-reset" disabled={busy} onClick={resetRaffle} type="button">
                <RotateCcw aria-hidden="true" size={14} /> Reset Raffle
              </button>
            )}
          </div>

          <div className="live-raffle-stats">
            <span><Users aria-hidden="true" size={15} /><strong>{checkedInCount}</strong> Checked In</span>
            <span><Sparkles aria-hidden="true" size={15} /><strong>{availableCount}</strong> Eligible</span>
          </div>
        </section>

        <aside aria-label="Raffle winners" className="live-raffle-history">
          <div className="live-raffle-history-heading">
            <span className="live-raffle-trophy"><Trophy aria-hidden="true" size={17} /></span>
            <div><h2>Winners</h2><p>{winners.length ? `${winners.length} drawn so far` : "Your winners will appear here"}</p></div>
          </div>
          {winners.length ? (
            <ol>
              {winners.map((winner, index) => (
                <li key={`${winner.id}-${winner.drawnAt}`}>
                  <span className="raffle-winner-rank">{winners.length - index}</span>
                  <span className="raffle-winner-copy"><strong>{winner.name}</strong><small>{new Date(winner.drawnAt).toLocaleString()}</small></span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="raffle-history-empty"><Trophy aria-hidden="true" size={24} /><span>No winners yet</span></div>
          )}
          <p className="raffle-history-note">Each guest can win once per raffle. Reset to make previous winners eligible again.</p>
        </aside>
      </div>
    </main>
  );
}
