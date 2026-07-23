import React, { useState, useEffect } from 'react'
import {
  ChevronDown, ChevronRight,
  Clock, User, GitBranch, Zap, Info, ArrowDown, Construction
} from 'lucide-react'
import { api } from '../api/client'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtShort(iso) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }
  catch { return iso }
}

function riskLevel(score) {
  if (score >= 70) return { label: 'High',   bar: 'bg-rose-500',  text: 'text-rose-400',  border: 'border-rose-500/40',  bg: 'bg-rose-500/10'  }
  if (score >= 45) return { label: 'Medium', bar: 'bg-amber-400', text: 'text-amber-400', border: 'border-amber-400/40', bg: 'bg-amber-400/10' }
  return              { label: 'Low',    bar: 'bg-teal-400',  text: 'text-teal-400',  border: 'border-teal-500/40',  bg: 'bg-teal-500/10'  }
}

function StatusPill({ status }) {
  const s = (status || '').toLowerCase()
  const cls = s.includes('progress') ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
    : s.includes('block')            ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
    : s.includes('done') || s.includes('complet') ? 'bg-teal-500/15 text-teal-300 border-teal-500/30'
    : 'bg-slate-700/50 text-slate-400 border-slate-600'
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {status || 'Unknown'}
    </span>
  )
}

// ── Shared section wrapper ────────────────────────────────────────────────────

function Section({ label, accent = 'text-slate-500', border = 'border-slate-700', children }) {
  return (
    <div className={`rounded-xl border ${border} bg-slate-900`}>
      <div className={`px-4 py-2 border-b ${border} flex items-center`}>
        <span className={`text-[10px] font-semibold uppercase tracking-[0.22em] ${accent}`}>{label}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

// ── 1. Delivery Forecast (Monte Carlo) ───────────────────────────────────────

const DATE_CARDS = [
  { p: 50, label: 'Most likely',    hint: '50% of simulations',  color: 'text-teal-300',  dot: '#14b8a6' },
  { p: 80, label: 'Safe to commit', hint: '80% of simulations',  color: 'text-amber-300', dot: '#f59e0b' },
  { p: 95, label: 'Worst case',     hint: '95% of simulations',  color: 'text-rose-300',  dot: '#f43f5e' },
]

function barPos(iso, p10, p95) {
  if (!iso || !p10 || !p95) return 50
  const min = new Date(p10).getTime(), max = new Date(p95).getTime(), val = new Date(iso).getTime()
  return max === min ? 0 : Math.min(100, Math.max(0, Math.round(((val - min) / (max - min)) * 100)))
}

function FinishDateWindow({ sessionId }) {
  const [mc, setMc]           = useState(null)
  const [forecast, setForecast] = useState(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    if (!sessionId) return
    Promise.all([
      api.monteCarlo(sessionId),
      api.forecast(sessionId).catch(() => null),
    ]).then(([m, f]) => { setMc(m?.monte_carlo ?? m); setForecast(f?.forecast ?? f); setLoading(false) })
      .catch(() => setLoading(false))
  }, [sessionId])

  const stats      = mc?.statistics || {}
  const p10        = stats.percentile_10
  const p95        = stats.percentile_95
  const onTimePct  = mc?.on_time_probability != null ? Math.round(mc.on_time_probability * 100) : null
  const confidence = forecast?.confidence_score != null ? forecast.confidence_score : forecast?.forecast_result?.confidence_score
  const targetDate = mc?.target_end_date ?? null

  const dotMarkers = DATE_CARDS.map(({ p, dot }) => ({
    p, dot, left: barPos(stats[`percentile_${p}`], p10, p95),
  }))

  // Interpolate the on-time probability position on the bar
  let onTimeMarker = null
  if (onTimePct != null && p10 && p95 && stats.percentile_50) {
    const knownPts = [
      { pct: 10, ts: new Date(p10).getTime() },
      { pct: 50, ts: new Date(stats.percentile_50).getTime() },
      ...(stats.percentile_80 ? [{ pct: 80, ts: new Date(stats.percentile_80).getTime() }] : []),
      { pct: 95, ts: new Date(p95).getTime() },
    ].sort((a, b) => a.pct - b.pct)
    let ts = null
    for (let i = 0; i < knownPts.length - 1; i++) {
      const lo = knownPts[i], hi = knownPts[i + 1]
      if (onTimePct >= lo.pct && onTimePct <= hi.pct) {
        ts = lo.ts + ((onTimePct - lo.pct) / (hi.pct - lo.pct)) * (hi.ts - lo.ts)
        break
      }
    }
    if (ts === null) ts = onTimePct < knownPts[0].pct ? knownPts[0].ts : knownPts[knownPts.length - 1].ts
    onTimeMarker = { left: barPos(new Date(ts).toISOString(), p10, p95), date: fmtShort(new Date(ts).toISOString()), pct: onTimePct }
  }

  const onTimeColor = onTimePct == null ? 'text-slate-400' : onTimePct >= 60 ? 'text-teal-300' : onTimePct >= 40 ? 'text-amber-300' : 'text-rose-300'

  return (
    <Section label="Delivery forecast" border="border-slate-700">
      {/* Top: on-time % + confidence */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[11px] text-slate-500">
            When will we finish?
            {confidence != null && <span className="ml-2 text-teal-400 font-medium">{Math.round(confidence * 100)}% confidence</span>}
          </p>
        </div>
        {onTimePct != null && (
          <div className="text-right">
            <span className={`text-2xl font-bold ${onTimeColor}`}>{onTimePct}%</span>
            <span className="text-[11px] text-slate-500 ml-1.5">on-time</span>
          </div>
        )}
      </div>

      {loading ? <p className="text-sm text-slate-500">Calculating…</p> : (
        <>
          {/* Timeline bar */}
          <div className="relative mt-8 mb-8">
            {/* On-time marker — above bar */}
            {onTimeMarker && (
              <div className="absolute -translate-x-1/2 flex flex-col items-center" style={{ left: `${onTimeMarker.left}%`, bottom: '14px' }}>
                <div className={`text-[10px] font-bold whitespace-nowrap px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 ${onTimeColor}`}>
                  {onTimeMarker.pct}% · {onTimeMarker.date}
                </div>
                <div className="w-px h-2 bg-slate-600" />
              </div>
            )}

            <div className="h-1.5 rounded-full bg-gradient-to-r from-teal-500 via-amber-400 to-rose-500" />

            {/* Percentile dots */}
            {dotMarkers.map(({ p, dot, left }) => (
              <div key={p} className="absolute w-3.5 h-3.5 rounded-full border-2 border-slate-900 -translate-x-1/2 -translate-y-1/2" style={{ left: `${left}%`, top: '50%', backgroundColor: dot }} />
            ))}

            {/* Deadline marker — below bar */}
            {targetDate && (() => {
              const left = barPos(targetDate, p10, p95)
              return (
                <div className="absolute -translate-x-1/2 flex flex-col items-center" style={{ left: `${left}%`, top: '14px' }}>
                  <div className="w-px h-2 bg-violet-400" />
                  <div className="text-[10px] font-semibold whitespace-nowrap px-1.5 py-0.5 rounded bg-violet-500/15 border border-violet-500/40 text-violet-300">
                    Deadline · {fmtShort(targetDate)}
                  </div>
                </div>
              )
            })()}

            <div className="flex justify-between mt-1 text-[10px] text-slate-600">
              <span>{fmtShort(p10)}</span>
              <span>{fmtShort(p95)}</span>
            </div>
          </div>

          {/* Date cards */}
          <div className="grid grid-cols-4 gap-2 mt-2">
            {targetDate && (
              <div className="rounded-lg border border-violet-500/40 bg-violet-500/5 p-2.5">
                <p className="text-[10px] text-violet-400 font-medium mb-1">Deadline</p>
                <p className="text-base font-bold text-violet-300">{fmtShort(targetDate)}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Fixed</p>
              </div>
            )}
            {DATE_CARDS.map(({ p, label, hint, color }) => (
              <div key={p} className="rounded-lg border border-slate-700/60 bg-slate-950 p-2.5">
                <p className="text-[10px] text-slate-500 mb-1">{label}</p>
                <p className={`text-base font-bold ${color}`}>{fmtShort(stats[`percentile_${p}`])}</p>
                <p className="text-[10px] text-slate-600 mt-0.5">{hint}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </Section>
  )
}

// ── 2. Risk Snapshot ──────────────────────────────────────────────────────────

const RISK_META = {
  schedule:   { oneliner: 'Delay vs. deadline',               how: 'Expected delay against the sprint deadline.',              weight: 0.40 },
  dependency: { oneliner: 'Task chain tangles',               how: 'Count of tasks blocking or blocked by others.',            weight: 0.25 },
  resource:   { oneliner: 'Team load & single points',        how: 'Individual workload and key-person concentration.',        weight: 0.20 },
  scope:      { oneliner: 'Work added vs. original plan',     how: 'New work added beyond the baseline scope.',               weight: 0.15 },
}

function RiskConcentration({ sessionId }) {
  const [risk, setRisk]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [showFormula, setShowFormula] = useState(false)

  useEffect(() => {
    if (!sessionId) return
    api.risk(sessionId)
      .then(r => { setRisk(r?.risk_analysis ?? r?.risk_assessment ?? r); setLoading(false) })
      .catch(() => setLoading(false))
  }, [sessionId])

  const overall = Math.round(risk?.overall_risk_score ?? 0)
  const overallRl = riskLevel(overall)

  const cats = risk ? [
    { key: 'schedule',   label: 'Schedule',      score: risk.schedule_risk?.score,   reasons: risk.schedule_risk?.reasons   || [], drivers: risk.schedule_risk?.drivers   || [] },
    { key: 'dependency', label: 'Dependencies',  score: risk.dependency_risk?.score, reasons: risk.dependency_risk?.reasons || [], drivers: risk.dependency_risk?.drivers || [] },
    { key: 'resource',   label: 'Team load',     score: risk.resource_risk?.score,   reasons: risk.resource_risk?.reasons   || [], drivers: risk.resource_risk?.drivers   || [] },
    { key: 'scope',      label: 'Scope',         score: risk.scope_risk?.score,      reasons: risk.scope_risk?.reasons      || [], drivers: risk.scope_risk?.drivers      || [] },
  ].filter(c => c.score !== undefined) : []

  return (
    <Section label="Risk snapshot" border="border-slate-700">
      {loading ? <p className="text-sm text-slate-500">Analysing…</p> : (
        <>
          {/* Overall score pill */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] text-slate-500">Where is the pressure?</p>
            {risk && (
              <div className="flex items-center gap-1.5">
                <span className={`text-xl font-bold ${overallRl.text}`}>{overall}</span>
                <span className="text-slate-600 text-sm">/100</span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${overallRl.border} ${overallRl.bg} ${overallRl.text}`}>{overallRl.label}</span>
              </div>
            )}
          </div>

          {/* Category rows */}
          <div className="space-y-1">
            {cats.map(({ key, label, score, reasons, drivers }) => {
              const s    = Math.round(score ?? 0)
              const rl   = riskLevel(s)
              const isOpen = expanded === key
              const meta = RISK_META[key] || {}
              const allReasons = [...reasons, ...(drivers || []).map(d => d.description || d.title).filter(Boolean)]
                .filter((v, i, a) => a.indexOf(v) === i).slice(0, 4)

              return (
                <div key={key} className={`rounded-lg border ${rl.border} bg-slate-950 overflow-hidden`}>
                  <button
                    className="w-full px-3 py-2 hover:bg-slate-800/30 transition-colors text-left"
                    onClick={() => setExpanded(isOpen ? null : key)}>
                    <div className="flex items-center gap-2">
                      {/* Score badge */}
                      <span className={`w-8 text-center text-sm font-bold flex-none ${rl.text}`}>{s}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[11px] font-semibold text-slate-300">{label}</span>
                          <span className="text-[10px] text-slate-600">{meta.oneliner}</span>
                        </div>
                        <div className="h-1 rounded-full bg-slate-800">
                          <div className={`${rl.bar} h-1 rounded-full`} style={{ width: `${Math.min(s, 100)}%` }} />
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-none">
                        <span className={`text-[10px] font-semibold px-1.5 py-px rounded ${rl.bg} ${rl.text}`}>{rl.label}</span>
                        <span className="text-[10px] text-slate-600">·{Math.round((meta.weight || 0) * 100)}%</span>
                        {isOpen ? <ChevronDown className="h-3 w-3 text-slate-600" /> : <ChevronRight className="h-3 w-3 text-slate-600" />}
                      </div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-3 pb-2.5 border-t border-slate-800 pt-2 space-y-1.5">
                      <p className="text-[11px] text-slate-500">{meta.how} · <span className="text-slate-400">{Math.round(s * (meta.weight || 0))} pts</span> of overall score ({Math.round((meta.weight||0)*100)}% × {s})</p>
                      {allReasons.length > 0 ? (
                        <ul className="space-y-1">
                          {allReasons.map((r, i) => (
                            <li key={i} className="flex items-start gap-2 text-[11px] text-slate-300">
                              <span className={`mt-1 h-1.5 w-1.5 rounded-full flex-none ${rl.bar}`} />
                              {r}
                            </li>
                          ))}
                        </ul>
                      ) : <p className="text-[11px] text-slate-600">No signals.</p>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Score formula toggle */}
          {cats.length > 0 && (
            <div className="mt-2">
              <button
                className="flex items-center gap-1.5 text-[10px] text-slate-600 hover:text-slate-400 transition-colors py-1"
                onClick={() => setShowFormula(f => !f)}>
                <Info className="h-3 w-3" />
                How is the overall score calculated?
                {showFormula ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
              {showFormula && (
                <div className="mt-1 rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 space-y-1">
                  {cats.map(({ key, label, score }) => {
                    const meta = RISK_META[key] || {}
                    const s   = Math.round(score ?? 0)
                    const rl  = riskLevel(s)
                    return (
                      <div key={key} className="flex items-center gap-2 text-[11px]">
                        <span className="text-slate-500 w-20 truncate">{label}</span>
                        <span className="text-slate-600">{s} × {Math.round((meta.weight||0)*100)}%</span>
                        <span className="text-slate-600">=</span>
                        <span className={`font-semibold ${rl.text}`}>{(s*(meta.weight||0)).toFixed(1)} pts</span>
                      </div>
                    )
                  })}
                  <div className="border-t border-slate-800 pt-1 flex items-center gap-2 text-[11px]">
                    <span className="text-slate-400 w-20">Total</span>
                    <span className="text-slate-600">sum =</span>
                    <span className={`font-bold ${overallRl.text}`}>{overall} / 100</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Section>
  )
}

// ── 3. Critical Path ──────────────────────────────────────────────────────────

function CriticalPathPanel({ deps }) {
  const [expandedItem, setExpandedItem] = useState(null)

  if (!deps) return null

  const cpItems        = deps?.critical_path_details || []
  const cpDurationDays = deps?.critical_path_duration_days
  const cpGrowthPct    = deps?.critical_path_growth_percent
  const itemCount      = deps?.critical_path_item_count ?? cpItems.length
  const growth         = cpGrowthPct != null ? Math.round(cpGrowthPct) : null

  if (!cpItems.length && !itemCount) {
    return (
      <Section label="Critical path" border="border-slate-700">
        <p className="text-sm text-slate-500">No dependency chain found — tasks may be running in parallel.</p>
      </Section>
    )
  }

  return (
    <Section label="Critical path" accent="text-amber-500" border="border-amber-500/20">
      {/* Summary strip */}
      <div className="flex items-center gap-6 mb-3 pb-3 border-b border-slate-800">
        <div>
          <p className="text-[10px] text-slate-500 mb-0.5">Chain length</p>
          <p className="text-base font-bold text-amber-300">{cpDurationDays != null ? `${cpDurationDays.toFixed(1)} days` : '—'}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500 mb-0.5">Tasks in chain</p>
          <p className="text-base font-bold text-white">{itemCount}</p>
        </div>
        {growth != null && (
          <div>
            <p className="text-[10px] text-slate-500 mb-0.5">Scope growth</p>
            <p className={`text-base font-bold ${growth > 10 ? 'text-rose-400' : growth > 0 ? 'text-amber-400' : 'text-teal-400'}`}>
              {growth > 0 ? `+${growth}%` : growth === 0 ? 'None' : `${growth}%`}
            </p>
          </div>
        )}
        <p className="text-[11px] text-slate-500 ml-auto">Any delay in this chain pushes the delivery date.</p>
      </div>

      {/* Task sequence */}
      {cpItems.length > 0 && (
        <div className="space-y-px">
          {cpItems.map((item, idx) => {
            const isLast    = idx === cpItems.length - 1
            const isOpen    = expandedItem === item.item_id
            const isBlocked = item.is_blocked
            const borderCls = isBlocked ? 'border-rose-500/40' : 'border-slate-800'

            return (
              <div key={item.item_id}>
                <div className={`rounded-lg border ${borderCls} bg-slate-950 overflow-hidden`}>
                  {/* Collapsed row — name, owner, status, blocked badge, hours */}
                  <button
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-800/30 transition-colors"
                    onClick={() => setExpandedItem(isOpen ? null : item.item_id)}>
                    <span className="flex-none w-4 h-4 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[9px] text-slate-500 font-bold">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-mono text-slate-600">{item.item_id}</span>
                        <span className="text-[12px] text-slate-200 font-medium truncate">{item.name}</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">{item.assigned_resource || 'Unassigned'}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-none">
                      {isBlocked && (
                        <span className="text-[10px] text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded px-1.5 py-px font-semibold">Blocked</span>
                      )}
                      <StatusPill status={item.status} />
                      <span className="text-[10px] text-slate-400 font-medium">{(item.remaining_hours ?? 0).toFixed(0)}h left</span>
                      {isOpen ? <ChevronDown className="h-3 w-3 text-slate-600" /> : <ChevronRight className="h-3 w-3 text-slate-600" />}
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div className="px-3 pb-3 pt-2 border-t border-slate-800 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        {/* Owner */}
                        <div className="rounded bg-slate-900 border border-slate-800 px-2.5 py-2">
                          <p className="text-[10px] text-slate-500 mb-0.5 flex items-center gap-1"><User className="h-2.5 w-2.5" /> Owner</p>
                          <p className="text-[12px] font-semibold text-white">{item.assigned_resource || '—'}</p>
                        </div>
                        {/* Sprint */}
                        <div className="rounded bg-slate-900 border border-slate-800 px-2.5 py-2">
                          <p className="text-[10px] text-slate-500 mb-0.5 flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> Sprint</p>
                          <p className="text-[12px] font-semibold text-white">{item.sprint_id || '—'}</p>
                        </div>
                        {/* Hours remaining */}
                        <div className="rounded bg-slate-900 border border-slate-800 px-2.5 py-2">
                          <p className="text-[10px] text-slate-500 mb-0.5 flex items-center gap-1"><Zap className="h-2.5 w-2.5" /> Hours remaining</p>
                          <p className="text-[12px] font-semibold text-white">{(item.remaining_hours ?? 0).toFixed(0)} h</p>
                        </div>
                        {/* Depends on */}
                        <div className="rounded bg-slate-900 border border-slate-800 px-2.5 py-2">
                          <p className="text-[10px] text-slate-500 mb-0.5 flex items-center gap-1"><GitBranch className="h-2.5 w-2.5" /> Depends on</p>
                          <p className="text-[12px] font-semibold text-white">
                            {(item.depends_on_count ?? 0) > 0
                              ? `${item.depends_on_count} task${item.depends_on_count !== 1 ? 's' : ''} must finish first`
                              : 'No upstream dependencies'}
                          </p>
                        </div>
                      </div>

                      {/* Deadline impact — plain language, always shown */}
                      <div className={`rounded px-2.5 py-2 text-[11px] font-medium ${
                        isBlocked
                          ? 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
                          : 'bg-amber-500/8 border border-amber-500/20 text-amber-300'
                      }`}>
                        {isBlocked
                          ? `⚠ Blocked — work cannot proceed until the blocker is resolved.`
                          : `⚠ Any delay here pushes the delivery date by the same amount.`}
                      </div>
                    </div>
                  )}
                </div>
                {!isLast && <div className="flex justify-center py-px"><ArrowDown className="h-3 w-3 text-slate-700" /></div>}
              </div>
            )
          })}
        </div>
      )}
    </Section>
  )
}

// ── 4. High-Risk Items ────────────────────────────────────────────────────────

function HighRiskItemsPanel({ deps }) {
  const [expanded, setExpanded] = useState(null)
  const items = deps?.high_risk_item_details || []
  if (!items.length) return null

  return (
    <Section label={`At-risk items · ${items.length}`} accent="text-rose-400" border="border-rose-500/25">
      <div className="space-y-1">
        {items.map((item) => {
          const isOpen  = expanded === item.item_id
          const riskPct = Math.min(item.risk_score ?? 0, 100)
          const rl      = riskLevel(riskPct)
          return (
            <div key={item.item_id} className={`rounded-lg border ${rl.border} bg-slate-950 overflow-hidden`}>
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-800/30 transition-colors"
                onClick={() => setExpanded(isOpen ? null : item.item_id)}>
                <span className={`text-[10px] font-bold flex-none ${rl.text}`}>{item.item_id}</span>
                <span className="flex-1 text-[12px] text-slate-200 font-medium truncate">{item.name}</span>
                <div className="flex items-center gap-1.5 flex-none">
                  {item.is_blocked && <span className="text-[10px] text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded px-1.5 py-px font-semibold">Blocked</span>}
                  <StatusPill status={item.status} />
                  <span className={`text-[10px] font-semibold px-1.5 py-px rounded ${rl.bg} ${rl.text}`}>{rl.label}</span>
                  {isOpen ? <ChevronDown className="h-3 w-3 text-slate-600" /> : <ChevronRight className="h-3 w-3 text-slate-600" />}
                </div>
              </button>

              {isOpen && (
                <div className="px-3 pb-3 border-t border-slate-800 pt-2">
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    {[
                      { icon: Clock,     label: 'Remaining', value: `${(item.remaining_hours ?? 0).toFixed(0)} h` },
                      { icon: User,      label: 'Owner',     value: item.assigned_resource || '—' },
                      { icon: GitBranch, label: 'Blocks',    value: item.blocking_count > 0 ? `${item.blocking_count}` : 'None' },
                      { icon: Zap,       label: 'Float',     value: item.float_hours > 0 ? `${item.float_hours.toFixed(0)} h` : 'Zero' },
                    ].map(({ icon: Icon, label, value }) => (
                      <div key={label} className="rounded bg-slate-900 border border-slate-800 px-2 py-1.5">
                        <div className="flex items-center gap-1 mb-0.5">
                          <Icon className="h-2.5 w-2.5 text-slate-600" />
                          <span className="text-[9px] text-slate-600 uppercase tracking-wide">{label}</span>
                        </div>
                        <p className="text-[11px] font-semibold text-white">{value}</p>
                      </div>
                    ))}
                  </div>
                  <ul className="space-y-1">
                    {(item.risk_drivers || []).map((d, i) => (
                      <li key={i} className="flex items-start gap-2 text-[11px] text-slate-300">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-rose-400 flex-none" />
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Section>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function ManagementSummary({ session }) {
  const sessionId = session?.project_summary?.session_id || ''
  const [deps, setDeps] = useState(null)

  useEffect(() => {
    if (!sessionId) return
    api.dependencies(sessionId).then(d => setDeps(d)).catch(() => {})
  }, [sessionId])

  return (
    <div className="space-y-3">
      {/* Page header — compact */}
      <div className="flex items-baseline justify-between px-0.5">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-amber-400 mb-0.5">Delivery intelligence</p>
          <h2 className="text-2xl font-bold text-white">Delivery outlook</h2>
        </div>
      </div>

      {/* Row 1: Forecast + Risk side by side */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-3">
        <div className="xl:col-span-3"><FinishDateWindow sessionId={sessionId} /></div>
        <div className="xl:col-span-2"><RiskConcentration sessionId={sessionId} /></div>
      </div>

      {/* Row 2: Critical path */}
      <CriticalPathPanel deps={deps} />

      {/* Row 3: High-risk items */}
      <HighRiskItemsPanel deps={deps} />
    </div>
  )
}
