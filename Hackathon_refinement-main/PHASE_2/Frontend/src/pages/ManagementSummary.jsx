import React, { useState, useEffect, useCallback } from 'react'
import {
  ChevronDown, ChevronRight, ChevronUp,
  Clock, User, GitBranch, Zap, AlertTriangle
} from 'lucide-react'
import { api } from '../api/client'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtShort(iso) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) }
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

// ── 1. Delivery Forecast ──────────────────────────────────────────────────────
// Manager-friendly labels:
//   Committed Date        → What we promised (target_end_date from MC or forecast)
//   Expected Delivery     → Deterministic forecast (forecast.expected_finish_date)
//   High-Confidence       → 80th percentile Monte Carlo
//   Worst-Case            → 95th percentile Monte Carlo

function barPos(iso, p10, p95) {
  if (!iso || !p10 || !p95) return 50
  const min = new Date(p10).getTime(), max = new Date(p95).getTime(), val = new Date(iso).getTime()
  return max === min ? 0 : Math.min(100, Math.max(0, Math.round(((val - min) / (max - min)) * 100)))
}

function FinishDateWindow({ sessionId }) {
  const [mc, setMc]             = useState(null)
  const [forecast, setForecast] = useState(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    if (!sessionId) return
    Promise.all([
      api.monteCarlo(sessionId),
      api.forecast(sessionId).catch(() => null),
    ]).then(([m, f]) => {
      setMc(m?.monte_carlo ?? m)
      // Forecast wraps in .forecast key
      setForecast(f?.forecast ?? f)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [sessionId])

  const stats     = mc?.statistics || {}
  const p10       = stats.percentile_10
  const p95       = stats.percentile_95
  const onTimePct = mc?.on_time_probability != null ? Math.round(mc.on_time_probability * 100) : null
  const confidence = forecast?.confidence_score != null
    ? forecast.confidence_score
    : forecast?.forecast_result?.confidence_score

  // Dates: committed comes from the MC target; expected from deterministic forecast
  const targetDate      = mc?.target_end_date ?? forecast?.target_end_date ?? null
  const expectedFinish  = forecast?.expected_finish_date ?? null   // deterministic
  const p80             = stats.percentile_80 ?? null
  const worstCase       = stats.percentile_95 ?? null

  const dotMarkers = [
    { p: 50, dot: '#14b8a6', iso: stats.percentile_50 },
    { p: 80, dot: '#f59e0b', iso: p80 },
    { p: 95, dot: '#f43f5e', iso: worstCase },
  ].map(m => ({ ...m, left: barPos(m.iso, p10, p95) }))

  let onTimeMarker = null
  if (onTimePct != null && targetDate && p10 && p95) {
    onTimeMarker = { left: barPos(targetDate, p10, p95), date: fmtShort(targetDate), pct: onTimePct }
  }

  const onTimeColor = onTimePct == null ? 'text-slate-400'
    : onTimePct >= 60 ? 'text-teal-300'
    : onTimePct >= 40 ? 'text-amber-300'
    : 'text-rose-300'

  const DATE_CARDS = [
    {
      label: 'Committed Date',
      hint:  'What we promised',
      value: fmtShort(targetDate),
      color: 'text-violet-300', border: 'border-violet-500/40', bg: 'bg-violet-500/5', accent: 'text-violet-400',
    },
    {
      label: 'Expected Delivery',
      hint:  'Pessimistic deterministic forecast — assumes all active blockers and predicted spillover hit at full strength. Use this as the cautious planning date.',
      value: fmtShort(expectedFinish),
      color: 'text-teal-300',   border: 'border-teal-500/40',   bg: 'bg-teal-500/5',   accent: 'text-teal-400',
    },
    {
      label: 'High-Confidence Delivery',
      hint:  '80th percentile across 10 000 Monte Carlo simulations — includes optimistic scenarios where some blockers resolve early. This date is typically earlier than Expected because it reflects average-case outcomes, not worst-case.',
      value: fmtShort(p80),
      color: 'text-amber-300',  border: 'border-amber-400/40',  bg: 'bg-amber-400/5',  accent: 'text-amber-400',
    },
    {
      label: 'Worst-Case Forecast',
      hint:  'If most risks materialise',
      value: fmtShort(worstCase),
      color: 'text-rose-300',   border: 'border-rose-500/40',   bg: 'bg-rose-500/5',   accent: 'text-rose-400',
    },
  ]

  return (
    <Section label="Delivery forecast" border="border-slate-700">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] text-slate-500">
          When will we finish?
          {confidence != null && (
            <span className="ml-2 text-teal-400 font-medium">{Math.round(confidence * 100)}% confidence</span>
          )}
        </p>
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
          <div className="relative mt-8 mb-6">
            {onTimeMarker && (
              <div className="absolute -translate-x-1/2 flex flex-col items-center" style={{ left: `${onTimeMarker.left}%`, bottom: '14px' }}>
                <div className={`text-[10px] font-bold whitespace-nowrap px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 ${onTimeColor}`}>
                  {onTimeMarker.pct}% on-time by {onTimeMarker.date}
                </div>
                <div className="w-px h-2 bg-slate-600" />
              </div>
            )}
            <div className="h-1.5 rounded-full bg-gradient-to-r from-teal-500 via-amber-400 to-rose-500" />
            {dotMarkers.map(({ p, dot, left }) => (
              <div key={p} className="absolute w-3.5 h-3.5 rounded-full border-2 border-slate-900 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${left}%`, top: '50%', backgroundColor: dot }} />
            ))}
            {targetDate && (() => {
              const left = barPos(targetDate, p10, p95)
              return (
                <div className="absolute -translate-x-1/2 flex flex-col items-center" style={{ left: `${left}%`, top: '14px' }}>
                  <div className="w-px h-2 bg-violet-400" />
                  <div className="text-[10px] font-semibold whitespace-nowrap px-1.5 py-0.5 rounded bg-violet-500/15 border border-violet-500/40 text-violet-300">
                    Committed · {fmtShort(targetDate)}
                  </div>
                </div>
              )
            })()}
            <div className="flex justify-between mt-1 text-[10px] text-slate-600">
              <span>{fmtShort(p10)}</span>
              <span>{fmtShort(p95)}</span>
            </div>
          </div>

          {/* Manager date cards */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 mt-2">
            {DATE_CARDS.map(({ label, hint, value, color, border, bg, accent }) => (
              <div key={label} className={`rounded-lg border ${border} ${bg} p-2.5`}>
                <p className={`text-[10px] font-medium mb-0.5 ${accent}`}>{label}</p>
                <p className={`text-sm font-bold ${color}`}>{value}</p>
                <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">{hint}</p>
              </div>
            ))}
          </div>
          {/* Explain the Expected > High-Confidence apparent contradiction */}
          {expectedFinish && p80 && new Date(expectedFinish) > new Date(p80) && (
            <div className="mt-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2">
              <p className="text-[10px] font-semibold text-amber-400 mb-0.5">Why is Expected later than High-Confidence?</p>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                These two numbers answer different questions. <span className="text-teal-300 font-medium">Expected Delivery</span> is
                a single deterministic forecast that assumes every active blocker and predicted spillover hits at full strength — a
                deliberately cautious estimate. <span className="text-amber-300 font-medium">High-Confidence (P80)</span> is the
                80th-percentile outcome across 10 000 simulations, many of which model blockers resolving early or partial
                spillover — so it reflects a weighted average of possible futures, not the worst-case one.
                It is normal and expected for the pessimistic deterministic date to sit later than the probabilistic P80.
              </p>
            </div>
          )}
        </>
      )}
    </Section>
  )
}

// ── 2. Risk Snapshot ──────────────────────────────────────────────────────────

const RISK_META = {
  schedule:   { oneliner: 'Delay vs. deadline',          weight: 0.40 },
  dependency: { oneliner: 'Task chain tangles',          weight: 0.25 },
  resource:   { oneliner: 'Team load & single points',   weight: 0.20 },
  scope:      { oneliner: 'Work added vs. original plan',weight: 0.15 },
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

  const overall   = Math.round(risk?.overall_risk_score ?? 0)
  const overallRl = riskLevel(overall)

  const cats = risk ? [
    { key: 'schedule',   label: 'Schedule',     score: risk.schedule_risk?.score,   drivers: risk.schedule_risk?.drivers   || [] },
    { key: 'dependency', label: 'Dependencies', score: risk.dependency_risk?.score, drivers: risk.dependency_risk?.drivers || [] },
    { key: 'resource',   label: 'Team load',    score: risk.resource_risk?.score,   drivers: risk.resource_risk?.drivers   || [] },
    { key: 'scope',      label: 'Scope',        score: risk.scope_risk?.score,      drivers: risk.scope_risk?.drivers      || [] },
  ].filter(c => c.score !== undefined) : []

  return (
    <Section label="Risk snapshot" border="border-slate-700">
      {loading ? <p className="text-sm text-slate-500">Analysing…</p> : (
        <>
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

          <div className="space-y-1">
            {cats.map(({ key, label, score, drivers }) => {
              const s      = Math.round(score ?? 0)
              const rl     = riskLevel(s)
              const isOpen = expanded === key
              const meta   = RISK_META[key] || {}
              const driverTitles = [...new Set((drivers || []).map(d => d.title).filter(Boolean))].slice(0, 4)

              return (
                <div key={key} className={`rounded-lg border ${rl.border} bg-slate-950 overflow-hidden`}>
                  <button
                    className="w-full px-3 py-2 hover:bg-slate-800/30 transition-colors text-left"
                    onClick={() => setExpanded(isOpen ? null : key)}>
                    <div className="flex items-center gap-2">
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
                    <div className="px-3 pb-2.5 border-t border-slate-800 pt-2">
                      {driverTitles.length > 0 ? (
                        <ul className="space-y-1">
                          {driverTitles.map((title, i) => (
                            <li key={i} className="flex items-center gap-2 text-[11px] text-slate-300">
                              <span className={`h-1.5 w-1.5 rounded-full flex-none ${rl.bar}`} />
                              {title}
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

          {/* Collapsible formula */}
          {cats.length > 0 && (
            <div className="mt-3">
              <button
                className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-slate-400 transition-colors"
                onClick={() => setShowFormula(f => !f)}>
                {showFormula ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {showFormula ? 'Hide' : 'Show'} score formula
              </button>
              {showFormula && (
                <div className="mt-2 rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 space-y-1">
                  {cats.map(({ key, label, score }) => {
                    const meta = RISK_META[key] || {}
                    const s    = Math.round(score ?? 0)
                    const rl   = riskLevel(s)
                    return (
                      <div key={key} className="flex items-center gap-2 text-[11px]">
                        <span className="text-slate-500 w-20 truncate">{label}</span>
                        <span className="text-slate-600">{s} × {Math.round((meta.weight || 0) * 100)}%</span>
                        <span className="text-slate-600">=</span>
                        <span className={`font-semibold ${rl.text}`}>{(s * (meta.weight || 0)).toFixed(1)} pts</span>
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

// ── 3. Critical Path — horizontal dependency flow ─────────────────────────────

function CriticalPathPanel({ deps }) {
  const [selectedId, setSelectedId] = useState(null)

  const cpItems        = deps?.critical_path_details || []
  const cpDurationDays = deps?.critical_path_duration_days
  const cpGrowthPct    = deps?.critical_path_growth_percent
  const growth         = cpGrowthPct != null ? Math.round(cpGrowthPct) : null

  if (!cpItems.length) {
    return (
      <Section label="Critical path" border="border-slate-700">
        <p className="text-sm text-slate-500">No dependency chain found — tasks may be running in parallel.</p>
      </Section>
    )
  }

  const blockedCount = cpItems.filter(i => i.is_blocked).length
  const selectedIdx  = selectedId ? cpItems.findIndex(i => i.item_id === selectedId) : -1
  const selectedItem = selectedId ? cpItems.find(i => i.item_id === selectedId) : null

  // Only show upstream/downstream relative to the selected node
  const getNodeState = (item, idx) => {
    if (isDone(item)) return selectedId && item.item_id === selectedId ? 'selected' : 'completed'
    if (!selectedId) return item.is_blocked ? 'blocked' : 'default'
    if (item.item_id === selectedId) return 'selected'
    if (idx < selectedIdx) return 'upstream'
    if (idx > selectedIdx) return 'downstream'
    return 'default'
  }

  const nodeStyles = {
    default:    'border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-500',
    selected:   'border-amber-400 bg-amber-400/10 text-amber-200 ring-1 ring-amber-400/40',
    upstream:   'border-teal-500/60 bg-teal-500/8 text-teal-200 hover:border-teal-400',
    downstream: 'border-sky-500/60 bg-sky-500/8 text-sky-200 hover:border-sky-400',
    blocked:    'border-rose-500/50 bg-rose-500/8 text-rose-200 hover:border-rose-400',
    completed:  'border-emerald-600/50 bg-emerald-900/20 text-slate-400 opacity-70 hover:opacity-90',
  }

  const isDone = (item) => {
    const s = (item.status || '').toUpperCase()
    return s === 'COMPLETED' || s === 'DONE'
  }

  const arrowColor = (fromIdx) => {
    if (!selectedId) return 'text-slate-700'
    if (fromIdx < selectedIdx) return 'text-teal-600/60'
    if (fromIdx >= selectedIdx) return 'text-sky-600/60'
    return 'text-slate-700'
  }

  return (
    <Section label="Critical path" accent="text-amber-500" border="border-amber-500/20">
      {/* Header */}
      <div className="flex items-center gap-4 mb-4 pb-3 border-b border-slate-800 flex-wrap">
        <div className="flex flex-col">
          <p className="text-[10px] text-slate-500 mb-0.5 uppercase tracking-wide">Chain length</p>
          <p className="text-xl font-bold text-amber-300">
            {cpDurationDays != null ? `${cpDurationDays.toFixed(1)} days` : '—'}
          </p>
        </div>
        <div className="w-px h-8 bg-slate-800 flex-none" />
        {growth != null && (
          <>
            <div className="flex flex-col">
              <p className="text-[10px] text-slate-500 mb-0.5 uppercase tracking-wide">Scope growth</p>
              <p className={`text-xl font-bold ${growth > 10 ? 'text-rose-400' : growth > 0 ? 'text-amber-400' : 'text-teal-400'}`}>
                {growth > 0 ? `+${growth}%` : growth === 0 ? 'None' : `${growth}%`}
              </p>
            </div>
            <div className="w-px h-8 bg-slate-800 flex-none" />
          </>
        )}
        {blockedCount > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30">
            <AlertTriangle className="h-3.5 w-3.5 text-rose-400 flex-none" />
            <span className="text-[11px] font-semibold text-rose-300">
              {blockedCount} blocked task{blockedCount !== 1 ? 's' : ''} on this chain
            </span>
          </div>
        )}
        {selectedId && (
          <button className="ml-auto text-[10px] text-slate-500 hover:text-slate-300 underline" onClick={() => setSelectedId(null)}>
            Clear selection
          </button>
        )}
      </div>

      {/* Legend — only shown when something is selected */}
      <div className="flex items-center gap-3 mb-3 text-[10px] text-slate-400 flex-wrap">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm border border-emerald-600/50 bg-emerald-900/30 inline-block" /> Completed</span>
        {selectedId && (
          <>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm border border-teal-500/60 bg-teal-500/20 inline-block" /> Upstream</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm border border-amber-400 bg-amber-400/20 inline-block" /> Selected</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm border border-sky-500/60 bg-sky-500/20 inline-block" /> Downstream</span>
          </>
        )}
      </div>

      {/* Horizontal flow */}
      <div className="overflow-x-auto pb-2">
        <div className="inline-flex items-center gap-0 min-w-max">
          {cpItems.map((item, idx) => {
            const isLast     = idx === cpItems.length - 1
            const nodeState  = getNodeState(item, idx)
            const isSelected = item.item_id === selectedId

            return (
              <div key={item.item_id} className="inline-flex items-center">
                <button
                  onClick={() => setSelectedId(isSelected ? null : item.item_id)}
                  className={`relative rounded-lg border px-3 py-2.5 text-left transition-all cursor-pointer min-w-[100px] max-w-[140px] ${nodeStyles[nodeState]}`}>
                  {isDone(item) && (
                    <span className="absolute top-1.5 right-1.5 text-emerald-400 text-[10px]" title="Completed">✓</span>
                  )}
                  <p className={`text-[10px] font-mono mb-0.5 ${isDone(item) ? 'text-emerald-600' : 'text-slate-500'}`}>{item.item_id}</p>
                  <p className={`text-[11px] font-semibold leading-tight line-clamp-2 ${isDone(item) ? 'line-through text-slate-500' : ''}`}>{item.name}</p>
                  <div className="flex items-center gap-1 mt-1.5">
                    {isDone(item) ? (
                      <span className="text-[9px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded px-1 py-px font-bold">DONE</span>
                    ) : (
                      <>
                        {item.is_blocked && (
                          <span className="text-[9px] bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded px-1 py-px font-bold">BLK</span>
                        )}
                        <span className="text-[10px] text-slate-500">{(item.remaining_hours ?? 0).toFixed(0)}h</span>
                      </>
                    )}
                  </div>
                </button>

                {!isLast && (
                  <div className={`flex items-center px-1.5 ${arrowColor(idx)}`}>
                    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
                      <line x1="0" y1="8" x2="20" y2="8" stroke="currentColor" strokeWidth="1.5" />
                      <polyline points="14,3 20,8 14,13" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Selected node detail */}
      {selectedItem && (
        <SelectedNodeDetail item={selectedItem} />
      )}
    </Section>
  )
}

function SelectedNodeDetail({ item }) {
  // depends_on_labels and blocking_labels come from backend (FIX bug-1/bug-2 already in route)
  // depends_on_count = in-degree from full DAG, blocking_count = out-degree from full DAG
  // We show the actual label lists when available, else fall back to counts
  const upstreamLabels   = item.depends_on_labels   || []
  const downstreamLabels = item.blocking_labels      || []
  const upstreamCount    = item.depends_on_count     ?? upstreamLabels.length
  const downstreamCount  = item.blocking_count       ?? downstreamLabels.length

  return (
    <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[10px] font-mono text-slate-500">{item.item_id}</span>
          <p className="text-[13px] font-semibold text-amber-200">{item.name}</p>
        </div>
        <StatusPill status={item.status} />
      </div>

      {/* 4-col stat grid */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { icon: User,      label: 'Owner',      value: item.assigned_resource || '—' },
          { icon: Zap,       label: 'Hours left',  value: `${(item.remaining_hours ?? 0).toFixed(0)} h` },
          { icon: Clock,     label: 'Sprint',      value: item.sprint_id || '—' },
          { icon: GitBranch, label: 'Gates',       value: `${downstreamCount} task${downstreamCount !== 1 ? 's' : ''}` },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="rounded bg-slate-900 border border-slate-800 px-2 py-1.5">
            <p className="text-[9px] text-slate-500 uppercase mb-0.5 flex items-center gap-1">
              <Icon className="h-2.5 w-2.5" /> {label}
            </p>
            <p className="text-[11px] font-semibold text-white truncate">{value}</p>
          </div>
        ))}
      </div>

      {/* Dependency connections — only shown when data exists */}
      {(upstreamCount > 0 || downstreamCount > 0) && (
        <div className="rounded bg-slate-900 border border-slate-800 px-2.5 py-2 space-y-1.5">
          {upstreamCount > 0 && (
            <div>
              <p className="text-[10px] text-slate-500 mb-0.5">
                Waits on <span className="font-semibold text-teal-300">{upstreamCount} upstream task{upstreamCount !== 1 ? 's' : ''}</span>
              </p>
              {upstreamLabels.length > 0 && (
                <ul className="space-y-0.5">
                  {upstreamLabels.map((lbl, i) => (
                    <li key={i} className="text-[10px] text-teal-400 font-mono truncate pl-2 border-l border-teal-500/30">{lbl}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {downstreamCount > 0 && (
            <div>
              <p className="text-[10px] text-slate-500 mb-0.5">
                Gates <span className="font-semibold text-sky-300">{downstreamCount} downstream task{downstreamCount !== 1 ? 's' : ''}</span>
              </p>
              {downstreamLabels.length > 0 && (
                <ul className="space-y-0.5">
                  {downstreamLabels.map((lbl, i) => (
                    <li key={i} className="text-[10px] text-sky-400 font-mono truncate pl-2 border-l border-sky-500/30">{lbl}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <div className={`rounded px-2.5 py-2 text-[11px] font-medium ${
        item.is_blocked
          ? 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
          : 'bg-amber-500/8 border border-amber-500/20 text-amber-300'
      }`}>
        {item.is_blocked
          ? '⚠ Blocked — work cannot proceed until the blocker is resolved.'
          : '⚠ Any delay to this task delays the project completion.'}
      </div>
    </div>
  )
}

// ── 4. High-Risk Items ────────────────────────────────────────────────────────
// Backend provides: item_id, name, risk_score, status, assigned_resource,
// remaining_hours, float_hours, blocking_count, cascade_depth, risk_drivers, is_blocked, is_on_critical_path
// No schedule_impact_days — derive impact from float_hours + blocking_count + cascade_depth

function HighRiskItemsPanel({ deps }) {
  const [expanded, setExpanded] = useState(null)
  const items = deps?.high_risk_item_details || []
  if (!items.length) return null

  return (
    <Section label={`At-risk items · ${items.length}`} accent="text-rose-400" border="border-rose-500/25">
      <div className="space-y-2">
        {items.map((item) => {
          const isOpen  = expanded === item.item_id
          const riskPct = Math.min(item.risk_score ?? 0, 100)
          const rl      = riskLevel(riskPct)

          // Why bullets — directly from backend risk_drivers
          const whyBullets = item.risk_drivers || []

          // Impact: derive from what we actually have
          // float_hours=0 → zero float (cannot slip at all)
          // blocking_count → fan-out risk
          // cascade_depth → downstream chain length
          const impactLines = []
          if (item.float_hours === 0) {
            impactLines.push('Zero float — any delay directly extends project end date')
          } else if (item.float_hours != null && item.float_hours < 8) {
            impactLines.push(`Only ${item.float_hours.toFixed(0)}h of scheduling buffer remaining`)
          }
          if ((item.blocking_count ?? 0) >= 3) {
            impactLines.push(`Blocks ${item.blocking_count} downstream tasks if it slips`)
          } else if ((item.blocking_count ?? 0) > 0) {
            impactLines.push(`Delays ${item.blocking_count} downstream task${item.blocking_count !== 1 ? 's' : ''}`)
          }
          if ((item.cascade_depth ?? 0) >= 2) {
            impactLines.push(`Triggers a ${item.cascade_depth}-level dependency cascade`)
          }

          return (
            <div key={item.item_id} className={`rounded-lg border ${rl.border} bg-slate-950 overflow-hidden`}>
              {/* Collapsed row */}
              <button
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-slate-800/30 transition-colors"
                onClick={() => setExpanded(isOpen ? null : item.item_id)}>
                <span className={`text-[10px] font-mono font-bold flex-none ${rl.text}`}>{item.item_id}</span>
                <span className="flex-1 text-[12px] text-slate-200 font-medium truncate">{item.name}</span>
                <div className="flex items-center gap-1.5 flex-none">
                  {item.is_blocked && (
                    <span className="text-[10px] text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded px-1.5 py-px font-semibold">Blocked</span>
                  )}
                  {item.is_on_critical_path && (
                    <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-px font-semibold">Critical path</span>
                  )}
                  <span className={`text-[10px] font-semibold px-1.5 py-px rounded border ${rl.border} ${rl.bg} ${rl.text}`}>{rl.label} Risk</span>
                  {isOpen ? <ChevronDown className="h-3 w-3 text-slate-600" /> : <ChevronRight className="h-3 w-3 text-slate-600" />}
                </div>
              </button>

              {/* Expanded detail */}
              {isOpen && (
                <div className="px-3 pb-3 border-t border-slate-800 pt-2.5 space-y-2">
                  {/* Stat row */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { icon: Clock,     label: 'Remaining', value: `${(item.remaining_hours ?? 0).toFixed(0)} h` },
                      { icon: User,      label: 'Owner',     value: item.assigned_resource || '—' },
                      { icon: GitBranch, label: 'Gates',     value: (item.blocking_count ?? 0) > 0 ? `${item.blocking_count} task${item.blocking_count !== 1 ? 's' : ''}` : 'None' },
                    ].map(({ icon: Icon, label, value }) => (
                      <div key={label} className="rounded bg-slate-900 border border-slate-800 px-2 py-1.5">
                        <div className="flex items-center gap-1 mb-0.5">
                          <Icon className="h-2.5 w-2.5 text-slate-600" />
                          <span className="text-[9px] text-slate-600 uppercase tracking-wide">{label}</span>
                        </div>
                        <p className="text-[11px] font-semibold text-white truncate">{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Why? — only render if backend gave us drivers */}
                  {whyBullets.length > 0 && (
                    <div className={`rounded-lg border ${rl.border} ${rl.bg} px-3 py-2`}>
                      <p className={`text-[10px] font-semibold uppercase tracking-wide mb-1.5 ${rl.text}`}>Why?</p>
                      <ul className="space-y-1">
                        {whyBullets.map((d, i) => (
                          <li key={i} className="flex items-start gap-2 text-[11px] text-slate-300">
                            <span className={`mt-1 h-1.5 w-1.5 rounded-full flex-none ${rl.bar}`} />
                            {d}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Impact — only render if we could derive something meaningful */}
                  {impactLines.length > 0 && (
                    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Impact</p>
                      <ul className="space-y-0.5">
                        {impactLines.map((line, i) => (
                          <li key={i} className={`text-[12px] font-semibold ${rl.text}`}>{line}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Section>
  )
}

// ── PMO KPI Suite ─────────────────────────────────────────────────────────────

function spiColor(spi) {
  if (spi == null) return 'text-slate-400'
  if (spi >= 0.95) return 'text-teal-300'
  if (spi >= 0.80) return 'text-amber-300'
  return 'text-rose-300'
}

function spiLabel(spi) {
  if (spi == null) return '—'
  if (spi >= 0.95) return 'On pace'
  if (spi >= 0.80) return 'Slightly behind'
  return 'Behind plan'
}

function pct(v, decimals = 0) {
  if (v == null) return '—'
  return `${(v * 100).toFixed(decimals)}%`
}

function confBar(score, label, color) {
  const w = Math.round((score ?? 0) * 100)
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 text-[10px] text-slate-400 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-slate-700">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${w}%` }} />
      </div>
      <span className="w-8 text-right text-[10px] font-semibold text-slate-300">{w}%</span>
    </div>
  )
}

function PMOKpiPanel({ sessionId }) {
  const [kpi, setKpi]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(null)

  useEffect(() => {
    if (!sessionId) { setLoading(false); return }
    api.forecast(sessionId)
      .then(f => {
        // pmo_kpi is nested inside the forecast response
        const suite = f?.pmo_kpi ?? null
        setKpi(suite)
        setLoading(false)
      })
      .catch(err => { setError(err); setLoading(false) })
  }, [sessionId])

  if (loading) return (
    <Section label="PMO health indicators" accent="text-indigo-400" border="border-indigo-500/20">
      <p className="text-sm text-slate-500">Computing PMO KPIs…</p>
    </Section>
  )

  if (error || !kpi) return (
    <Section label="PMO health indicators" accent="text-indigo-400" border="border-indigo-500/20">
      <p className="text-sm text-slate-500">{error?.message || 'PMO KPIs unavailable for this session.'}</p>
    </Section>
  )

  const spi = kpi.schedule_performance_index
  const cd  = kpi.confidence_decomposition || {}

  return (
    <Section label="PMO health indicators" accent="text-indigo-400" border="border-indigo-500/20">
      {/* Legend / definition row */}
      <div className="mb-3 rounded-lg border border-indigo-500/15 bg-indigo-500/5 px-3 py-2 text-[10px] text-slate-400 leading-relaxed">
        <span className="font-semibold text-indigo-300">How to read these:</span>
        {' '}SPI ≥ 1.0 = on/ahead of plan; Sprint Adherence = % of past-due sprints closed on time (≥80% healthy);
        Release Readiness = % of blockers resolved (100% = nothing blocking release); Recovery = can we still hit the target date even at maximum sustainable team pace?
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">

        {/* SPI */}
        <div className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-slate-500 mb-1">Schedule Perf. Index</p>
          <p className={`text-2xl font-bold ${spiColor(spi)}`}>{spi != null ? spi.toFixed(2) : '—'}</p>
          <p className={`text-[10px] mt-0.5 ${spiColor(spi)}`}>{spiLabel(spi)}</p>
          <p className="text-[9px] text-slate-500 mt-1">
            {pct(kpi.actual_completion_pct)} done · {pct(kpi.planned_completion_pct)} planned
          </p>
          <p className="text-[9px] text-slate-600 mt-1 leading-tight">
            actual % complete ÷ planned % complete. 1.0 = exactly on pace.
          </p>
        </div>

        {/* Sprint adherence */}
        <div className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-slate-500 mb-1">Sprint Adherence</p>
          <p className={`text-2xl font-bold ${kpi.sprint_adherence_index >= 0.8 ? 'text-teal-300' : kpi.sprint_adherence_index >= 0.6 ? 'text-amber-300' : 'text-rose-300'}`}>
            {pct(kpi.sprint_adherence_index)}
          </p>
          <p className="text-[9px] text-slate-500 mt-1.5">
            {kpi.sprints_on_time_count}/{kpi.sprints_due_count} sprints closed on time
          </p>
          <p className="text-[9px] text-slate-500">
            Milestone score: {pct(kpi.milestone_adherence_score)}
          </p>
          <p className="text-[9px] text-slate-600 mt-1 leading-tight">
            Milestone = weighted avg item progress in each sprint window.
          </p>
        </div>

        {/* Release readiness */}
        <div className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-slate-500 mb-1">Release Readiness</p>
          <p className={`text-2xl font-bold ${kpi.release_readiness_index >= 0.8 ? 'text-teal-300' : kpi.release_readiness_index >= 0.5 ? 'text-amber-300' : 'text-rose-300'}`}>
            {pct(kpi.release_readiness_index)}
          </p>
          <p className="text-[9px] text-slate-500 mt-1.5">
            {kpi.resolved_blocker_count} resolved · {kpi.open_blocker_count} open blockers
          </p>
          <p className="text-[9px] text-slate-600 mt-1 leading-tight">
            resolved ÷ total blockers. 100% = all blockers cleared; release is gated on the rest.
          </p>
        </div>

        {/* Recovery feasibility */}
        <div className={`rounded-lg border bg-slate-800/60 px-3 py-2.5 ${kpi.recovery_feasible ? 'border-teal-500/30' : 'border-rose-500/40'}`}>
          <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-slate-500 mb-1">Recovery Feasible</p>
          <p className={`text-2xl font-bold ${kpi.recovery_feasible ? 'text-teal-300' : 'text-rose-300'}`}>
            {kpi.recovery_feasible ? 'Yes' : 'No'}
          </p>
          <p className={`text-[10px] mt-0.5 ${kpi.recovery_feasible ? 'text-teal-400' : 'text-rose-400'}`}>
            {kpi.recovery_feasibility_margin_days >= 0
              ? `${kpi.recovery_feasibility_margin_days.toFixed(1)}d spare at max pace`
              : `${Math.abs(kpi.recovery_feasibility_margin_days).toFixed(1)}d shortfall even at max pace`}
          </p>
          {kpi.max_sustainable_velocity != null && (
            <p className="text-[9px] text-slate-500 mt-1">
              Max sustainable: {kpi.max_sustainable_velocity.toFixed(0)}h/sprint
            </p>
          )}
          <p className="text-[9px] text-slate-600 mt-1 leading-tight">
            Can remaining effort fit inside the window at avg+1σ pace? "No" means scope or pace adjustment is required regardless of blockers resolving.
          </p>
        </div>
      </div>

      {/* Critical path drift + dependency pressure */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div className="rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-slate-500 mb-2">Critical Path Drift</p>
          <div className="flex gap-4">
            <div>
              <p className={`text-lg font-bold ${kpi.critical_path_drift_days > 0 ? 'text-rose-300' : 'text-teal-300'}`}>
                {kpi.critical_path_drift_days > 0 ? `+${kpi.critical_path_drift_days.toFixed(1)}d` : `${kpi.critical_path_drift_days.toFixed(1)}d`}
              </p>
              <p className="text-[9px] text-slate-500">calendar shift</p>
            </div>
            <div>
              <p className={`text-lg font-bold ${kpi.critical_path_scope_growth_percent > 0 ? 'text-amber-300' : 'text-teal-300'}`}>
                {kpi.critical_path_scope_growth_percent > 0 ? `+${kpi.critical_path_scope_growth_percent.toFixed(1)}%` : `${kpi.critical_path_scope_growth_percent.toFixed(1)}%`}
              </p>
              <p className="text-[9px] text-slate-500">scope growth</p>
            </div>
            <div>
              <p className={`text-lg font-bold ${kpi.critical_path_floored_item_count > 0 ? 'text-amber-300' : 'text-teal-300'}`}>
                {kpi.critical_path_floored_item_count}
              </p>
              <p className="text-[9px] text-slate-500">stalled items</p>
            </div>
          </div>
          {kpi.dependency_pressure_item_count > 0 && (
            <p className="mt-2 text-[10px] text-rose-300">
              ⚠ {kpi.dependency_pressure_item_count} downstream item{kpi.dependency_pressure_item_count !== 1 ? 's' : ''} blocked behind a stalled predecessor
              ({kpi.dependency_pressure_hours.toFixed(0)}h at risk)
            </p>
          )}
          <p className="text-[9px] text-slate-600 mt-2 leading-tight">
            Calendar shift = how many days the entire dependency network was pushed forward because stalled items can't be scheduled in the past.
            Stalled items = work items whose earliest possible start was forced to "today" by the real-time floor.
          </p>
        </div>

        {/* Calendar variance */}
        <div className="rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-slate-500 mb-2">Calendar Variance</p>
          <p className={`text-lg font-bold ${Math.abs(kpi.calendar_variance_days) > 7 ? 'text-rose-300' : Math.abs(kpi.calendar_variance_days) > 2 ? 'text-amber-300' : 'text-teal-300'}`}>
            {kpi.calendar_variance_days > 0 ? `+${kpi.calendar_variance_days.toFixed(1)}d` : `${kpi.calendar_variance_days.toFixed(1)}d`}
          </p>
          <p className="text-[9px] text-slate-500 mt-0.5 leading-relaxed">
            Gap between real elapsed time and what sprint status labels imply.
            {Math.abs(kpi.calendar_variance_days) > 7
              ? ' Large gap — sprint statuses are stale vs. the real calendar.'
              : Math.abs(kpi.calendar_variance_days) > 2
                ? ' Moderate gap — check in-progress sprint dates.'
                : ' Sprint statuses are tracking the real calendar closely.'}
          </p>
          <p className="text-[9px] text-slate-600 mt-1 leading-tight">
            Positive = real calendar has advanced further than sprint labels suggest (e.g. an "In Progress" sprint is running past its planned end date without being marked complete).
            This is what caused stall detection to fail before the real-time floor fix.
          </p>
        </div>
      </div>

      {/* Sprint Drift Ledger — Gap 3 */}
      {Array.isArray(kpi.sprint_drift_ledger) && kpi.sprint_drift_ledger.length > 0 && (() => {
        const ledger = kpi.sprint_drift_ledger
        const hasAnyDrift = ledger.some(r => r.drift_days > 0)
        const totalDrift = kpi.cumulative_drift_days ?? 0
        return (
          <div className="rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-3 mb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-slate-500">Sprint Schedule Drift Ledger</p>
              {totalDrift > 0 ? (
                <span className="text-[10px] font-semibold text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded px-2 py-0.5">
                  {totalDrift.toFixed(1)}d total accumulated drift
                </span>
              ) : (
                <span className="text-[10px] font-semibold text-teal-300 bg-teal-500/10 border border-teal-500/25 rounded px-2 py-0.5">
                  No accumulated drift
                </span>
              )}
            </div>
            <p className="text-[9px] text-slate-600 mb-3 leading-relaxed">
              Each row shows whether a sprint closed on time. Drift accrues when a sprint remains open past its planned end date —
              every calendar day beyond that date is real schedule debt. Completed sprints before the real-time floor fix may show 0d
              even if they actually closed late (no close-date field in the workbook).
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px] border-collapse">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-700">
                    <th className="text-left py-1.5 pr-3 font-semibold uppercase tracking-wide">Sprint</th>
                    <th className="text-left py-1.5 pr-3 font-semibold uppercase tracking-wide">Planned End</th>
                    <th className="text-left py-1.5 pr-3 font-semibold uppercase tracking-wide">Status</th>
                    <th className="text-right py-1.5 font-semibold uppercase tracking-wide">Drift</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((row, i) => {
                    const drift = row.drift_days ?? 0
                    const isPastDue = row.past_due
                    const isCompleted = (row.status || '').toUpperCase() === 'COMPLETED'
                    const rowClass = drift > 0
                      ? 'border-b border-rose-500/10 bg-rose-500/5'
                      : isCompleted && isPastDue
                        ? 'border-b border-teal-500/10 bg-teal-500/5'
                        : 'border-b border-slate-800'
                    const driftColor = drift > 5 ? 'text-rose-300 font-bold' : drift > 0 ? 'text-amber-300 font-semibold' : 'text-teal-400'
                    const statusColor = isCompleted ? 'text-teal-400' : isPastDue ? 'text-rose-400' : 'text-slate-400'
                    return (
                      <tr key={i} className={rowClass}>
                        <td className="py-1.5 pr-3 text-slate-200 font-medium">{row.sprint_name}</td>
                        <td className="py-1.5 pr-3 text-slate-400 font-mono">{row.planned_end}</td>
                        <td className={`py-1.5 pr-3 ${statusColor}`}>
                          {isCompleted ? '✓ Closed' : isPastDue ? '⚠ Still open' : '◌ Future'}
                        </td>
                        <td className={`py-1.5 text-right ${driftColor}`}>
                          {drift > 0 ? `+${drift.toFixed(1)}d` : drift === 0 && isCompleted && isPastDue ? '0d ✓' : drift === 0 ? '—' : `${drift.toFixed(1)}d`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {totalDrift > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-600">
                      <td colSpan={3} className="py-1.5 pr-3 text-slate-400 font-semibold">Accumulated schedule debt</td>
                      <td className="py-1.5 text-right text-rose-300 font-bold">+{totalDrift.toFixed(1)}d</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )
      })()}

      {/* Forecast confidence decomposition */}
      {cd && (
        <div className="rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2.5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-slate-500">Forecast Confidence Breakdown</p>
            {cd.weakest_component && (
              <span className="text-[9px] bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded px-1.5 py-px">
                Weakest: {cd.weakest_component.replace('_confidence', '')}
              </span>
            )}
          </div>
          <p className="text-[9px] text-slate-600 mb-2 leading-relaxed">
            Three independent signals that degrade forecast reliability. Low bar = that signal is adding uncertainty.
          </p>
          <div className="space-y-1.5">
            <div>
              {confBar(cd.effort_confidence, 'Effort', 'bg-indigo-400')}
              <p className="text-[9px] text-slate-600 pl-0.5 mt-0.5">Penalised by scope growth: the more estimates have already moved, the less trustworthy remaining estimates are.</p>
            </div>
            <div>
              {confBar(cd.velocity_confidence, 'Velocity', 'bg-blue-400')}
              <p className="text-[9px] text-slate-600 pl-0.5 mt-0.5">Penalised by sprint-to-sprint velocity variance: an inconsistent team is harder to forecast than a steady one.</p>
            </div>
            <div>
              {confBar(cd.calendar_confidence, 'Calendar', 'bg-violet-400')}
              <p className="text-[9px] text-slate-600 pl-0.5 mt-0.5">Penalised by calendar variance: a large gap between real elapsed time and sprint status labels means the schedule model's clock is unreliable.</p>
            </div>
          </div>
        </div>
      )}
    </Section>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function ManagementSummary({ session }) {
  const sessionId = session?.project_summary?.session_id || ''
  const [deps, setDeps]               = useState(null)
  const [depsLoading, setDepsLoading] = useState(true)
  const [depsError, setDepsError]     = useState(null)

  const fetchDeps = useCallback(() => {
    if (!sessionId) {
      setDepsError(new Error('No session ID — upload a workbook first.'))
      setDepsLoading(false)
      return
    }
    setDepsLoading(true)
    setDepsError(null)
    api.dependencies(sessionId)
      .then(d => { setDeps(d); setDepsLoading(false) })
      .catch(err => { setDepsError(err); setDepsLoading(false) })
  }, [sessionId])

  useEffect(() => { fetchDeps() }, [fetchDeps])

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between px-0.5">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-amber-400 mb-0.5">Delivery intelligence</p>
          <h2 className="text-2xl font-bold text-white">Delivery outlook</h2>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-3">
        <div className="xl:col-span-3"><FinishDateWindow sessionId={sessionId} /></div>
        <div className="xl:col-span-2"><RiskConcentration sessionId={sessionId} /></div>
      </div>

      {depsLoading ? (
        <div className="rounded-xl border border-amber-500/20 bg-slate-900 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-500 mb-2">Critical path</p>
          <p className="text-sm text-slate-500">Loading dependency graph…</p>
        </div>
      ) : depsError ? (
        <div className="rounded-xl border border-rose-500/30 bg-slate-900 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-rose-400 mb-1">Critical path</p>
          <p className="text-sm text-rose-300 mb-2">{depsError.message || 'Failed to load dependency data.'}</p>
          <button onClick={fetchDeps} className="text-[11px] font-semibold text-rose-300 border border-rose-500/40 rounded px-2.5 py-1 hover:bg-rose-500/10 transition-colors">
            Retry
          </button>
        </div>
      ) : (
        <CriticalPathPanel deps={deps} />
      )}

      {!depsLoading && !depsError && <HighRiskItemsPanel deps={deps} />}

      <PMOKpiPanel sessionId={sessionId} />
    </div>
  )
}
