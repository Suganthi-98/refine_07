import React, { useState, useEffect } from 'react'
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react'
import { api } from '../api/client'

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt  = (iso, o = { day: 'numeric', month: 'short' }) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', o) : '—'
const fmtL = (iso) => fmt(iso, { day: 'numeric', month: 'long', year: 'numeric' })
const hrsToD = (h) => h != null ? Number((h / 8).toFixed(1)) : null

function riskSig(s) {
  if (s >= 61) return { color: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/40',    bar: 'bg-rose-500',    word: 'High'   }
  if (s >= 41) return { color: 'text-amber-400',   bg: 'bg-amber-400/10',   border: 'border-amber-400/40',   bar: 'bg-amber-400',   word: 'Medium' }
  if (s >= 21) return { color: 'text-sky-400',     bg: 'bg-sky-500/10',     border: 'border-sky-500/30',     bar: 'bg-sky-500',     word: 'Low'    }
  return             { color: 'text-emerald-400',  bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', bar: 'bg-emerald-500', word: 'Low'    }
}

const Pulse = ({ h = 'h-5', w = 'w-full' }) =>
  <div className={`${h} ${w} rounded-xl animate-pulse bg-slate-800`} />

function Card({ children, className = '' }) {
  return (
    <div className={`rounded-2xl border border-slate-700 bg-slate-900 ${className}`}>
      {children}
    </div>
  )
}

function SectionTitle({ eyebrow, title, sub }) {
  return (
    <div className="mb-5">
      <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber-400 mb-1">{eyebrow}</p>
      {title && <h3 className="text-xl font-bold text-white">{title}</h3>}
      {sub   && <p className="text-sm text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — COMMIT DATE  (was Forecast tab)
// Unique: concrete P50/P80/P95 dates. Overview shows % probability, not dates.
// ══════════════════════════════════════════════════════════════════════════════

function CommitDate({ sessionId }) {
  const [mc,   setMc]   = useState(null)
  const [loading, setL] = useState(true)

  useEffect(() => {
    if (!sessionId) return
    api.monteCarlo(sessionId)
      .then(r => { setMc(r?.monte_carlo ?? r); setL(false) })
      .catch(() => setL(false))
  }, [sessionId])

  const stats  = mc?.statistics || {}
  const p50    = stats.percentile_50 || mc?.most_likely_finish_date
  const p80    = stats.percentile_80 || mc?.p80_finish_date
  const p95    = stats.percentile_95 || mc?.p95_finish_date
  const p10    = stats.percentile_10 || mc?.best_case_finish_date
  const target = mc?.target_end_date
  const delay  = stats.mean_delay_days
  const count  = mc?.simulation_count

  // position dots on the range bar
  const allPts = [p10, p50, p80, p95].filter(Boolean).map(d => new Date(d).getTime())
  const tMin   = Math.min(...allPts)
  const tMax   = Math.max(...allPts)
  const pos    = (iso) => tMax === tMin ? 0 : Math.round(((new Date(iso).getTime() - tMin) / (tMax - tMin)) * 100)

  return (
    <Card>
      <div className="p-6">
        <SectionTitle
          eyebrow={`Commit date · ${count ? count.toLocaleString() : '1,000'} Monte Carlo scenarios`}
          title="What date do we commit to?"
          sub="Overview shows the on-time probability. This answers the follow-up: which calendar date is safe to share with stakeholders?"
        />

        {loading ? (
          <div className="space-y-3"><Pulse h="h-14" /><Pulse h="h-5" w="w-2/3" /></div>
        ) : (
          <>
            {/* Hero — P80 is the commit number */}
            <div className="flex flex-col sm:flex-row sm:items-end gap-6 pb-6 border-b border-slate-800 mb-6">
              <div className="flex-1">
                <p className="text-sm text-slate-400 mb-2">
                  Share this date externally —
                  <span className="text-white font-semibold"> 8 in 10 scenarios finish by here</span>
                </p>
                <p className="text-5xl font-extrabold text-white tracking-tight">{fmtL(p80)}</p>
                {target && (
                  <p className="mt-3 text-sm text-slate-500">
                    Original target: <span className="text-white">{fmtL(target)}</span>
                    {delay != null && delay > 0
                      ? <span className="text-rose-400 font-semibold"> · running {Math.round(delay)} days late on average across all scenarios</span>
                      : delay != null && delay <= 0
                        ? <span className="text-emerald-400 font-semibold"> · P80 is within target</span>
                        : null}
                  </p>
                )}
              </div>
            </div>

            {/* Percentile range bar */}
            {allPts.length > 1 && (
              <div className="mb-6">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-4">
                  Completion window — all {count?.toLocaleString() ?? ''} scenarios
                </p>
                <div className="relative h-2.5 rounded-full bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500 mb-5">
                  {[
                    { iso: p50, color: 'bg-teal-400',   label: 'P50' },
                    { iso: p80, color: 'bg-amber-400',  label: 'P80' },
                    { iso: p95, color: 'bg-rose-500',   label: 'P95' },
                  ].filter(d => d.iso).map(({ iso, color, label }) => (
                    <div
                      key={label}
                      className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 border-slate-900 ${color}`}
                      style={{ left: `${pos(iso)}%` }}
                    />
                  ))}
                </div>
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>Earliest (P10): {fmt(p10)}</span>
                  <span>Latest (P95): {fmt(p95)}</span>
                </div>
              </div>
            )}

            {/* Three cards */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Optimistic (P50)', date: p50, note: 'Half of scenarios finish here — do not commit this date', color: 'text-teal-300', border: 'border-teal-500/20', bg: 'bg-teal-500/5', badge: false },
                { label: 'Commit this (P80)', date: p80, note: 'Safe for stakeholder commitments', color: 'text-white', border: 'border-amber-400/50', bg: 'bg-amber-400/8', badge: true },
                { label: 'Ceiling (P95)', date: p95, note: '1 in 20 scenarios runs past this — use for buffer planning', color: 'text-rose-300', border: 'border-rose-500/20', bg: 'bg-rose-500/5', badge: false },
              ].map(({ label, date, note, color, border, bg, badge }) => (
                <div key={label} className={`rounded-xl border ${border} ${bg} p-4`}>
                  <p className={`text-[10px] uppercase tracking-[0.2em] mb-2 ${badge ? 'text-amber-400 font-bold' : 'text-slate-500'}`}>{label}</p>
                  <p className={`text-2xl font-bold ${color}`}>{fmt(date)}</p>
                  <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">{note}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Card>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — RISK BREAKDOWN  (was Risk tab)
// Unique: overall score, category scores with reasons, top drivers, sprint heatmap.
// Overview shows root cause + chosen action — not the scored breakdown.
// ══════════════════════════════════════════════════════════════════════════════

const CAT_META = {
  schedule:   { label: 'Schedule',   weight: '40%', q: 'Are we running late?' },
  dependency: { label: 'Dependency', weight: '25%', q: 'Are blockers cascading?' },
  resource:   { label: 'Resource',   weight: '20%', q: 'Is the team overloaded?' },
  scope:      { label: 'Scope',      weight: '15%', q: 'Is scope growing?' },
}

function RiskBreakdown({ sessionId }) {
  const [risk,    setRisk]   = useState(null)
  const [loading, setL]      = useState(true)
  const [openCat, setOpenCat]= useState(null)   // expanded category
  const [showAll, setShowAll]= useState(false)  // show all drivers

  useEffect(() => {
    if (!sessionId) return
    api.risk(sessionId)
      .then(r => { setRisk(r?.risk_analysis ?? r); setL(false) })
      .catch(() => setL(false))
  }, [sessionId])

  const overall  = Math.round(risk?.overall_risk_score ?? 0)
  const oSig     = riskSig(overall)
  const drivers  = risk?.top_risk_drivers ?? []
  const sprints  = [...(risk?.sprint_risks ?? [])].sort((a, b) => a.sprint_id - b.sprint_id)
  const conc     = risk?.blocker_risk_concentration ?? 0
  const concPct  = Math.round(conc * 100)

  const cats = risk ? [
    { key: 'schedule',   data: risk.schedule_risk },
    { key: 'dependency', data: risk.dependency_risk },
    { key: 'resource',   data: risk.resource_risk },
    { key: 'scope',      data: risk.scope_risk },
  ] : []

  const visibleDrivers = showAll ? drivers : drivers.slice(0, 3)

  return (
    <Card>
      <div className="p-6">
        <SectionTitle
          eyebrow="Risk breakdown"
          title="What is threatening the delivery date?"
          sub="Overall score, category breakdown, and ranked actions. Root cause and decision already shown on Overview."
        />

        {loading ? (
          <div className="space-y-3">{[1,2,3,4].map(i => <Pulse key={i} h="h-12" />)}</div>
        ) : (
          <>
            {/* Overall score */}
            <div className="flex items-center gap-4 mb-6">
              <div className={`flex-none flex items-baseline gap-1 rounded-2xl border px-5 py-3 ${oSig.border} ${oSig.bg}`}>
                <span className={`text-4xl font-extrabold ${oSig.color}`}>{overall}</span>
                <span className="text-slate-600 text-sm">/100</span>
              </div>
              <div>
                <p className={`text-xl font-bold ${oSig.color}`}>{oSig.word} risk</p>
                <p className="text-sm text-slate-400 mt-0.5">
                  {overall >= 61 ? 'Needs management action before next sprint.' :
                   overall >= 41 ? 'Monitor closely — one escalation away.' :
                                   'Project is in good shape.'}
                </p>
                <p className="text-[11px] text-slate-600 mt-1">
                  Formula: 40% schedule + 25% dependency + 20% resource + 15% scope
                </p>
              </div>
            </div>

            {/* Blocker concentration callout */}
            {concPct >= 40 && (
              <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 mb-5 ${concPct >= 60 ? 'border-rose-500/40 bg-rose-500/5' : 'border-amber-400/30 bg-amber-400/5'}`}>
                <AlertTriangle className={`h-4 w-4 flex-none mt-0.5 ${concPct >= 60 ? 'text-rose-400' : 'text-amber-400'}`} />
                <p className={`text-sm ${concPct >= 60 ? 'text-rose-200' : 'text-amber-200'}`}>
                  <span className="font-bold">{concPct}% of the risk score</span> comes from a single active blocker.
                  Resolving it drops the overall score from <span className="text-white font-semibold">{overall}</span> to approximately <span className="text-emerald-300 font-semibold">{overall - Math.round(overall * conc)}</span>.
                  Highest-leverage action available.
                </p>
              </div>
            )}

            {/* Category bars — expandable */}
            <div className="space-y-2 mb-6">
              {cats.map(({ key, data }) => {
                if (!data) return null
                const s    = Math.round(data.score ?? 0)
                const sig  = riskSig(s)
                const meta = CAT_META[key]
                const open = openCat === key
                return (
                  <div key={key} className={`rounded-xl border ${sig.border} overflow-hidden`}>
                    <button
                      onClick={() => setOpenCat(open ? null : key)}
                      className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-slate-800/40 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="text-sm font-semibold text-white">{meta.label}</span>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold ${sig.color}`}>{s}/100</span>
                            <span className="text-[10px] text-slate-600">{meta.weight} of score</span>
                            <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${sig.bg} ${sig.color} border ${sig.border}`}>{sig.word}</span>
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-800">
                          <div className={`${sig.bar} h-1.5 rounded-full`} style={{ width: `${s}%` }} />
                        </div>
                      </div>
                      {open ? <ChevronUp className="h-3.5 w-3.5 text-slate-500 flex-none" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-500 flex-none" />}
                    </button>
                    {open && (data.reasons ?? []).length > 0 && (
                      <div className="border-t border-slate-800 bg-slate-950/60 px-4 py-3">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-600 mb-2">{meta.q}</p>
                        <ul className="space-y-1.5">
                          {data.reasons.map((r, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-slate-300 leading-relaxed">
                              <span className="mt-1.5 flex-none w-1 h-1 rounded-full bg-slate-600" />
                              {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Top risk drivers */}
            {drivers.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] uppercase tracking-[0.25em] text-slate-500 font-semibold">
                    Risk drivers — ranked by impact
                  </p>
                  <span className="text-[11px] text-slate-600">{drivers.length} total</span>
                </div>
                <div className="space-y-2">
                  {visibleDrivers.map((d, i) => (
                    <div key={i} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <span className="text-[10px] uppercase tracking-[0.2em] text-slate-600">#{i + 1} · {d.category}</span>
                          <p className="text-sm font-bold text-white mt-0.5">{d.title}</p>
                        </div>
                        <span className={`flex-none rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${riskSig(d.score).border} ${riskSig(d.score).bg} ${riskSig(d.score).color}`}>
                          {Math.round(d.score)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed mb-2">{d.description}</p>
                      <div className="flex items-start gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 flex-none text-teal-400 mt-0.5" />
                        <p className="text-xs text-teal-300 font-semibold">{d.recommendation_hint}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {drivers.length > 3 && (
                  <button
                    onClick={() => setShowAll(s => !s)}
                    className="mt-2 flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
                  >
                    {showAll ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    {showAll ? 'Show fewer' : `Show ${drivers.length - 3} more driver${drivers.length - 3 > 1 ? 's' : ''}`}
                  </button>
                )}
              </div>
            )}

            {/* Sprint risk heatmap */}
            {sprints.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-slate-500 font-semibold mb-3">
                  Risk by sprint — where does it peak?
                </p>
                <div className="space-y-2">
                  {sprints.map(s => {
                    const sc  = Math.round(s.risk_score ?? 0)
                    const sig = riskSig(sc)
                    return (
                      <div key={s.sprint_id} className="flex items-center gap-3">
                        <span className="flex-none text-xs text-slate-400 w-16">Sprint {s.sprint_id}</span>
                        <div className="flex-1 h-2 rounded-full bg-slate-800">
                          <div className={`${sig.bar} h-2 rounded-full`} style={{ width: `${sc}%` }} />
                        </div>
                        <span className={`flex-none text-xs font-bold w-8 text-right ${sig.color}`}>{sc}</span>
                        <span className={`flex-none text-[10px] w-14 ${sig.color}`}>{sig.word}</span>
                        {s.blocked_items > 0 && (
                          <span className="flex-none text-[10px] text-rose-400">{s.blocked_items} blocked</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — CRITICAL PATH DETAIL  (was Critical Path tab)
// Unique: item names + effort + slack + sprint per item (tab showed only IDs).
// Also carries: duration, growth, high/medium/low risk item lists.
// ══════════════════════════════════════════════════════════════════════════════

function CriticalPathDetail({ sessionId }) {
  const [deps,    setDeps] = useState(null)
  const [loading, setL]   = useState(true)

  useEffect(() => {
    if (!sessionId) return
    api.dependencies(sessionId)
      .then(d => { setDeps(d); setL(false) })
      .catch(() => setL(false))
  }, [sessionId])

  const details   = deps?.critical_path_details ?? []
  const chain     = deps?.critical_path ?? []
  const highRisk  = deps?.high_risk_items   ?? []
  const medRisk   = deps?.medium_risk_items ?? []
  const lowRisk   = deps?.low_risk_items    ?? []
  const blocked   = deps?.items_blocked     ?? []
  const activeBl  = deps?.active_blockers   ?? []
  const duration  = deps?.critical_path_duration_days
  const origHrs   = deps?.critical_path_duration_hours_original
  const growth    = deps?.critical_path_growth_percent
  const itemCount = deps?.critical_path_item_count ?? chain.length
  const total     = deps?.total_work_items

  const needsAction = details.filter(d => highRisk.includes(d.item_id) || blocked.includes(d.item_id))
  const clean       = details.filter(d => !highRisk.includes(d.item_id) && !blocked.includes(d.item_id))

  return (
    <Card>
      <div className="p-6">
        <SectionTitle
          eyebrow="Critical path · CPM"
          title="Which items control the finish date?"
          sub={`These ${itemCount} item${itemCount !== 1 ? 's' : ''} have zero slack. A delay on any one moves the delivery date. Everything else can slip without affecting it.`}
        />

        {loading ? (
          <div className="space-y-2">{[1,2,3,4].map(i => <Pulse key={i} h="h-14" />)}</div>
        ) : (
          <>
            {deps?.has_cycles && (
              <div className="flex items-center gap-2 rounded-xl border border-rose-500 bg-rose-950/30 px-4 py-3 mb-5 text-sm font-semibold text-rose-200">
                <AlertTriangle className="h-4 w-4 flex-none text-rose-400" />
                Circular dependency — critical path cannot be trusted until resolved
              </div>
            )}

            {/* 3 stat pills */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              {[
                {
                  label: 'Path length',
                  value: duration != null ? `${Number(duration).toFixed(1)} days` : '—',
                  sub: origHrs != null ? `was ${(origHrs/8).toFixed(1)}d at baseline` : 'current estimate',
                  warn: false,
                },
                {
                  label: 'Items on path',
                  value: itemCount,
                  sub: total ? `out of ${total} total items` : '',
                  warn: false,
                },
                {
                  label: 'Scope growth',
                  value: growth != null ? `+${growth.toFixed(1)}%` : '—',
                  sub: growth > 15 ? 'Significant — added days to delivery chain'
                     : growth > 5  ? 'Moderate — monitor for further additions'
                     :               'Within acceptable range',
                  warn: growth > 5,
                },
              ].map(({ label, value, sub, warn }) => (
                <div key={label} className={`rounded-xl border p-4 ${warn ? 'border-amber-400/40 bg-amber-400/5' : 'border-slate-700 bg-slate-950/50'}`}>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-1">{label}</p>
                  <p className={`text-2xl font-bold ${warn ? 'text-amber-300' : 'text-white'}`}>{value}</p>
                  <p className={`text-[11px] mt-1 leading-relaxed ${warn ? 'text-amber-400' : 'text-slate-500'}`}>{sub}</p>
                </div>
              ))}
            </div>

            {/* Active blockers on path */}
            {activeBl.length > 0 && (
              <div className="flex items-start gap-3 rounded-xl border border-rose-500/40 bg-rose-500/5 px-4 py-3 mb-5">
                <AlertTriangle className="h-4 w-4 flex-none text-rose-400 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-rose-200">
                    {activeBl.length} active blocker{activeBl.length > 1 ? 's' : ''} on the critical path
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {activeBl.join(', ')} — resolving {activeBl.length > 1 ? 'these' : 'this'} will pull the finish date forward
                  </p>
                </div>
              </div>
            )}

            {/* Items needing attention */}
            {needsAction.length > 0 && (
              <div className="mb-4">
                <p className="text-[10px] uppercase tracking-[0.25em] text-rose-400 font-bold mb-2">
                  ⚠ Needs attention ({needsAction.length})
                </p>
                <div className="space-y-2">
                  {needsAction.map(item => {
                    const isBlocked = blocked.includes(item.item_id)
                    const isHigh    = highRisk.includes(item.item_id)
                    const slack     = hrsToD(item.float_hours)
                    const noRoom    = slack !== null && slack < 0.1
                    return (
                      <div key={item.item_id} className={`rounded-xl border px-4 py-3 ${isBlocked ? 'border-rose-500/40 bg-rose-500/5' : 'border-amber-400/30 bg-amber-400/5'}`}>
                        <div className="flex items-start justify-between gap-3 mb-1.5">
                          <div className="min-w-0">
                            <span className="font-mono text-[11px] text-slate-500 mr-2">{item.item_id}</span>
                            <span className="text-sm font-bold text-white">{item.name}</span>
                          </div>
                          <div className="flex gap-1.5 flex-none">
                            {isBlocked && <span className="rounded-full border border-rose-500/50 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-300">BLOCKED</span>}
                            {isHigh    && <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">HIGH RISK</span>}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-4 text-[11px] text-slate-500">
                          {item.sprint_id != null  && <span>Sprint {item.sprint_id}</span>}
                          {item.effort_hours != null && <span>{hrsToD(item.effort_hours)}d effort</span>}
                          <span className={noRoom ? 'text-rose-400 font-semibold' : ''}>
                            {noRoom ? 'No room to slip — any delay hits the finish date'
                                    : slack != null ? `${slack}d buffer before it impacts the finish date` : ''}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Clean items — condensed table */}
            {clean.length > 0 && (
              <div className="mb-5">
                <p className="text-[10px] uppercase tracking-[0.25em] text-emerald-400 font-bold mb-2">
                  ✓ On track ({clean.length})
                </p>
                <div className="rounded-xl border border-slate-700 bg-slate-950/40 divide-y divide-slate-800">
                  {clean.map((item, i) => (
                    <div key={item.item_id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="font-mono text-[11px] text-slate-600 flex-none w-16 truncate">{item.item_id}</span>
                      <span className="text-sm text-slate-300 flex-1 truncate">{item.name}</span>
                      {item.sprint_id != null    && <span className="text-[11px] text-slate-500 flex-none">Sprint {item.sprint_id}</span>}
                      {item.effort_hours != null && <span className="text-[11px] text-slate-500 flex-none">{hrsToD(item.effort_hours)}d</span>}
                      {i < clean.length - 1      && <ArrowRight className="h-3 w-3 text-slate-700 flex-none" />}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Risk tier summary (high / medium / low counts) */}
            {(highRisk.length > 0 || medRisk.length > 0) && (
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'High risk',   items: highRisk, color: 'text-rose-400',    border: 'border-rose-500/30',    bg: 'bg-rose-500/5'    },
                  { label: 'Medium risk', items: medRisk,  color: 'text-amber-400',   border: 'border-amber-400/30',   bg: 'bg-amber-400/5'   },
                  { label: 'Low risk',    items: lowRisk,  color: 'text-emerald-400', border: 'border-emerald-500/20', bg: 'bg-emerald-500/5' },
                ].map(({ label, items, color, border, bg }) => (
                  <div key={label} className={`rounded-xl border ${border} ${bg} px-3 py-2.5 text-center`}>
                    <p className={`text-xl font-bold ${color}`}>{items.length}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════

export function ManagementSummary({ session }) {
  const sessionId = session?.project_summary?.session_id || ''

  return (
    <div className="space-y-4 pb-6">

      {/* Page header */}
      <div className="px-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber-400 mb-1">
          Delivery intelligence
        </p>
        <h2 className="text-3xl font-bold text-white">Dates, risk, and dependency math</h2>
        <p className="text-sm text-slate-400 mt-1 max-w-2xl">
          Status narrative, root cause, decision, blockers, and resource overload live on Overview.
          This tab covers the three things a manager needs beyond that:
          <span className="text-white"> what date to commit to</span>,
          <span className="text-white"> what's threatening it and by how much</span>, and
          <span className="text-white"> which specific items must not slip</span>.
        </p>
      </div>

      {/* 1 — Commit date */}
      <CommitDate sessionId={sessionId} />

      {/* 2 + 3 — Risk breakdown and critical path detail side by side on XL */}
      <div className="grid gap-4 xl:grid-cols-2">
        <RiskBreakdown sessionId={sessionId} />
        <CriticalPathDetail sessionId={sessionId} />
      </div>

      <p className="text-[11px] text-slate-600 px-1">
        <span className="text-amber-500 font-semibold">Scope — </span>
        People patterns and execution causes: Sprint Health. Recovery options: Recovery Plans.
      </p>

    </div>
  )
}
