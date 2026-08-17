import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Clock3, Layers, Radio, Volume2, VolumeX } from "lucide-react";
import { promoMedia } from "@/lib/mock-data";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const active = promoMedia.filter((m) => m.status === "Active").sort((a, b) => a.priority - b.priority);

export function PromoWall({ compact = false }: { compact?: boolean }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [mounted, setMounted] = useState(false);
  const reduced = useRef(false);

  useEffect(() => {
    setMounted(true);
    reduced.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced.current) setPlaying(false);
  }, []);

  const current = active[index]!;

  const next = useCallback(() => {
    setIndex((i) => (i + 1) % active.length);
    setProgress(0);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const total = current.durationSec * 1000;
    const step = 100;
    const id = window.setInterval(() => {
      setProgress((p) => {
        const nextP = p + (step / total) * 100;
        if (nextP >= 100) {
          next();
          return 0;
        }
        return nextP;
      });
    }, step);
    return () => window.clearInterval(id);
  }, [playing, current, next]);

  const meta = useMemo(
    () => [
      { icon: Layers, label: `Priority ${current.priority}` },
      { icon: Radio, label: current.target },
      ...(mounted
        ? [
            {
              icon: Clock3,
              label: `${formatDate(current.startAt)} – ${formatDate(current.endAt)}`,
            },
          ]
        : []),
    ],
    [current, mounted],
  );

  return (
    <section
      aria-label="Bluetorn announcements"
      className={cn(
        "bg-foreground/95 relative isolate overflow-hidden",
        compact ? "h-64 rounded-2xl" : "h-full min-h-[520px]",
      )}
    >
      {active.map((m, i) => (
        <img
          key={m.id}
          src={m.src}
          alt={m.title}
          loading={i === 0 ? "eager" : "lazy"}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-[1200ms] ease-out",
            i === index ? "scale-100 opacity-100" : "scale-105 opacity-0",
          )}
        />
      ))}

      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/25" />

      <div className="relative flex h-full flex-col justify-between p-5 sm:p-8">
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px] font-medium tracking-wide text-white/90 uppercase backdrop-blur">
            {current.type}
          </span>
          {current.ctaLabel && (
            <span className="rounded-full border border-white/25 px-3 py-1 text-[11px] font-medium text-white/80 backdrop-blur">
              {current.ctaLabel}
            </span>
          )}
          {current.type === "Video" && (
            <span className="ml-auto flex items-center gap-1.5 text-[11px] text-white/70">
              {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              {muted ? "Muted autoplay" : "Sound on"}
            </span>
          )}
        </div>

        <div className="max-w-lg">
          <h2 className={cn("font-semibold tracking-tight text-white", compact ? "text-xl" : "text-2xl sm:text-3xl")}>
            {current.title}
          </h2>
          <p className="mt-2 text-sm text-white/75">{current.subtitle}</p>

          {!compact && (
            <ul className="mt-5 flex flex-wrap gap-2">
              {meta.map((m) => (
                <li
                  key={m.label}
                  className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-[11px] text-white/75 backdrop-blur"
                >
                  <m.icon className="h-3 w-3" />
                  {m.label}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? "Pause announcements" : "Play announcements"}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/25 bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? "Unmute video" : "Mute video"}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/25 bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <div className="flex flex-1 items-center gap-2">
            {active.map((m, i) => (
              <button
                key={m.id}
                onClick={() => {
                  setIndex(i);
                  setProgress(0);
                }}
                aria-label={`Show ${m.title}`}
                className="group h-1.5 flex-1 overflow-hidden rounded-full bg-white/25"
              >
                <span
                  className="bg-primary block h-full rounded-full transition-[width] duration-100 ease-linear"
                  style={{ width: i === index ? `${progress}%` : i < index ? "100%" : "0%" }}
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
