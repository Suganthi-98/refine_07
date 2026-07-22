import React, { useState, useEffect } from 'react'
import {
  AlertTriangle, ChevronDown, ChevronRight, Info,
  Clock, User, GitBranch, Zap, Shield, TrendingUp
} from 'lucide-react'
import { api } from '../api/client'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtShort(iso) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }
  catch { return iso }
}

function riskLevel(score) {
  if (score >= 70) return { label: 'High',   bar: 'bg-rose-500',    text: 'text-rose-400',   border: 'border-rose-500/40' }
  if (score >= 45) return { label: 'Medium', bar: 'bg-amber-400',   text: 'text-amber-400',  border: 'border-amber-400/40' }
  return              { label: 'Low',    bar: 'bg-teal-400',    text: 'text-teal-400',   border: 'border-teal-400/40' }
}

function StatusPill({ status }) {
  const s = (status || '').toLowerCase()
  const cls = s.includes('progress') ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
    : s.includes('block') ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
    : s.includes('done') || s.includes('complet') ? 'bg-teal-500/15 text-teal-300 border-teal-500/30'
    : 'bg-slate-700 text-slate-400 border-slate-600'
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {status || 'Unknown'}
    </span>
  )
}

function Tooltip({ children, tip }) {
  const [show, setShow] = useState(false)
  return (
    <span className="relative inline-block"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 rounded-xl border border-slate-600 bg-slate-800 p-3 text-[11px] text-slate-300 shadow-2xl pointer-events-none">
          {tip}
        </span>
      )}
    </span>
  )
}

// ── 1. High-Risk Items Panel ──────────────────────────────────────────────────

function HighRiskItemsPanel({ deps }) {
  const [expanded, setExpanded] = useState(null)
  const items = deps?.high_risk_item_details || []
  if (!items.length) return null

  return (
    <div className="rounded-2xl border border-rose-500/30 bg-slate-900 p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-rose-400 mb-1">High-risk items</p>
          <h3 className="text-lg font-bold text-white">Why these items are flagged</h3>
          <p className="text-xs text-slate-500 mt-0.5">Each item's risk drivers — click to expand</p>
        </div>
        <span className="flex-none rounded-full border border-rose-500/50 bg-rose-500/10 px-3 py-1 text-[11px] font-semibold text-rose-300">
          {items.length} item{items.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-2">
        {items.map((item) => {
          const isOpen = expanded === item.item_id
          const riskPct = Math.min(item.risk_score ?? 0, 100)
          const rl = riskLevel(riskPct)
          return (
            <div key={item.item_id}
              className={`rounded-xl border ${rl.border} bg-slate-950 overflow-hidden`}>
              {/* Row header */}
              <button
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-800/40 transition-colors"
                onClick={() => setExpanded(isOpen ? null : item.item_id)}>
                <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${rl.border} ${rl.text}`}>
                  {item.item_id}
                </span>
                <span className="flex-1 text-sm text-slate-200 font-medium truncate">{item.name}</span>
                <div className="flex items-center gap-3 flex-none">
                  {item.is_on_critical_path && (
                    <span className="text-[10px] font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded-full px-2 py-0.5">
                      Critical path
                    </span>
                  )}
                  {item.is_blocked && (
                    <span className="text-[10px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-full px-2 py-0.5">
                      Blocked
                    </span>
                  )}
                  <StatusPill status={item.status} />
                  <span className={`text-xs font-bold ${rl.text}`}>{riskPct.toFixed(0)}</span>
                  {isOpen ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
                </div>
              </button>

              {/* Expanded detail */}
              {isOpen && (
                <div className="px-4 pb-4 border-t border-slate-800">
                  {/* Stats row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 mb-4">
                    {[
                      { icon: Clock,    label: 'Remaining', value: `${(item.remaining_hours ?? 0).toFixed(0)} h` },
                      { icon: User,     label: 'Owner',     value: item.assigned_resource || '—' },
                      { icon: GitBranch,label: 'Blocks',    value: item.blocking_count > 0 ? `${item.blocking_count} item${item.blocking_count !== 1 ? 's' : ''}` : 'None' },
                      { icon: Zap,      label: 'Float',     value: item.float_hours > 0 ? `${item.float_hours.toFixed(0)} h` : 'Zero' },
                    ].map(({ icon: Icon, label, value }) => (
                      <div key={label} className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-2">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Icon className="h-3 w-3 text-slate-500" />
                          <span className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</span>
                        </div>
                        <p className="text-sm font-semibold text-white">{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Risk drivers */}
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-2">Risk drivers</p>
                  <ul className="space-y-1.5">
                    {(item.risk_drivers || []).map((d, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                        <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-rose-400 flex-none" />
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
    </div>
  )
}

// ── 2. Critical Path ──────────────────────────────────────────────────────────

function CriticalPath({ sessionId }) {
  const [deps, setDeps] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    if (!sessionId) return
    api.dependencies(sessionId)
      .then(d => { setDeps(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [sessionId])

  const chain = deps?.critical_path_details || []
  const highRisk = Array.isArray(deps?.high_risk_items) ? deps.high_risk_items : []
  const duration = deps?.critical_path_duration_days
  const growth = deps?.critical_path_growth_percent
  const itemCount = deps?.critical_path_item_count ?? chain.length
  const selected_item = chain.find(n => n.item_id === selected)

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500 mb-1">Critical path</p>
          <h3 className="text-lg font-bold text-white">The chain that controls delivery</h3>
          <p className="text-xs text-slate-500 mt-0.5">Click any node to see why it's on the path</p>
        </div>
        {highRisk.length > 0 && (
          <span className="flex-none rounded-full border border-rose-500/50 bg-rose-500/10 px-3 py-1 text-[11px] font-semibold text-rose-300">
            {highRisk.length} high-risk item{highRisk.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-slate-400">Loading dependency graph…</p>
      ) : (
        <>
          {/* 3 stat blocks */}
          <div className="mt-6 grid grid-cols-3 gap-6">
            {[
              { value: duration != null ? `${duration.toFixed(1)}d` : '—', sub: 'Path duration' },
              { value: itemCount,                                           sub: 'Items on path' },
              { value: growth != null ? `${growth.toFixed(1)}%` : '—',    sub: 'Growth vs baseline', warn: growth > 10 },
            ].map(({ value, sub, warn }) => (
              <div key={sub}>
                <p className={`text-3xl font-bold ${warn ? 'text-amber-300' : 'text-white'}`}>{value}</p>
                <p className="text-xs text-slate-500 mt-1">{sub}</p>
              </div>
            ))}
          </div>

          {/* Interactive chain */}
          {chain.length > 0 && (
            <div className="mt-6 overflow-x-auto pb-2">
              <div className="inline-flex items-center gap-1 flex-nowrap min-w-full">
                {chain.map((node, i) => {
                  const isHigh = highRisk.includes(node.item_id)
                  const isSelected = selected === node.item_id
                  const isBlocked = node.is_blocked
                  const hasZeroFloat = node.float_hours === 0

                  const nodeCls = isSelected
                    ? 'border-white bg-white text-slate-900 shadow-lg'
                    : isBlocked
                    ? 'border-rose-500 bg-rose-500/15 text-rose-200'
                    : isHigh
                    ? 'border-rose-500/60 bg-rose-500/10 text-rose-200'
                    : 'border-slate-600 bg-slate-800 text-slate-200 hover:border-slate-400'

                  return (
                    <React.Fragment key={node.item_id + i}>
                      <button
                        onClick={() => setSelected(isSelected ? null : node.item_id)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex-none ${nodeCls}`}>
                        <span className="flex items-center gap-1.5">
                          {node.item_id}
                          {isBlocked && <span className="h-1.5 w-1.5 rounded-full bg-rose-400 flex-none" />}
                          {!isBlocked && hasZeroFloat && <span className="h-1.5 w-1.5 rounded-full bg-amber-400 flex-none" />}
                        </span>
                      </button>
                      {i < chain.length - 1 && (
                        <div className="flex items-center gap-0.5 flex-none px-1">
                          <div className="h-px w-3 bg-slate-600" />
                          <div className="w-0 h-0 border-t-4 border-t-transparent border-b-4 border-b-transparent border-l-4 border-l-slate-600" />
                        </div>
                      )}
                    </React.Fragment>
                  )
                })}
              </div>
            </div>
          )}

          {/* Node detail panel */}
          {selected_item && (
            <div className="mt-4 rounded-xl border border-slate-600 bg-slate-950 p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-0.5">{selected_item.item_id}</p>
                  <p className="text-sm font-semibold text-white">{selected_item.name}</p>
                </div>
                <StatusPill status={selected_item.status} />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                {[
                  { label: 'Effort',     value: `${(selected_item.effort_hours || 0).toFixed(0)} h` },
                  { label: 'Remaining',  value: `${(selected_item.remaining_hours || 0).toFixed(0)} h` },
                  { label: 'Float',      value: selected_item.float_hours > 0 ? `${selected_item.float_hours.toFixed(0)} h` : 'Zero — critical' },
                  { label: 'Owner',      value: selected_item.assigned_resource || '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-2">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">{label}</p>
                    <p className="text-xs font-semibold text-white">{value}</p>
                  </div>
                ))}
              </div>

              {/* Why it's on the critical path */}
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-1.5">Why it controls delivery</p>
              <ul className="space-y-1">
                {[
                  selected_item.float_hours === 0 && 'Zero float — any delay here shifts the finish date by the same amount',
                  selected_item.blocking_count > 0 && `Gates ${selected_item.blocking_count} downstream item${selected_item.blocking_count !== 1 ? 's' : ''} — nothing after it can start until it finishes`,
                  selected_item.is_blocked && `Currently blocked (${(selected_item.blocker_ids || []).join(', ') || 'active blocker'}) — resolution needed before work can proceed`,
                  selected_item.depends_on_count > 0 && `Depends on ${selected_item.depends_on_count} upstream item${selected_item.depends_on_count !== 1 ? 's' : ''} completing first`,
                  selected_item.progress_pct < 50 && `${selected_item.progress_pct.toFixed(0)}% complete — more than half the work remains`,
                ].filter(Boolean).map((reason, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                    <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-amber-400 flex-none" />
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Legend */}
          <div className="mt-4 flex flex-wrap gap-4 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-rose-400" /> Blocked</span>
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Zero float</span>
            <span className="flex items-center gap-1.5 text-slate-600">Click any node for detail</span>
          </div>

          {deps?.has_cycles && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-rose-500 bg-rose-950/40 px-4 py-3 text-sm font-semibold text-rose-200">
              <AlertTriangle className="h-4 w-4 flex-none text-rose-400" />
              Circular dependency detected — requires immediate resolution
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── 3. Risk Concentration ─────────────────────────────────────────────────────

function RiskConcentration({ sessionId }) {
  const [risk, setRisk] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    if (!sessionId) return
    api.risk(sessionId)
      .then(r => { setRisk(r?.risk_analysis ?? r?.risk_assessment ?? r); setLoading(false) })
      .catch(() => setLoading(false))
  }, [sessionId])

  const overall = Math.round(risk?.overall_risk_score ?? 0)

  const cats = risk ? [
    {
      key: 'schedule',   label: 'Schedule',
      score: risk.schedule_risk?.score,
      reasons: risk.schedule_risk?.reasons || [],
      drivers: risk.schedule_risk?.drivers || [],
    },
    {
      key: 'dependency', label: 'Dependency',
      score: risk.dependency_risk?.score,
      reasons: risk.dependency_risk?.reasons || [],
      drivers: risk.dependency_risk?.drivers || [],
    },
    {
      key: 'resource',   label: 'Resource',
      score: risk.resource_risk?.score,
      reasons: risk.resource_risk?.reasons || [],
      drivers: risk.resource_risk?.drivers || [],
    },
    {
      key: 'scope',      label: 'Scope',
      score: risk.scope_risk?.score,
      reasons: risk.scope_risk?.reasons || [],
      drivers: risk.scope_risk?.drivers || [],
    },
  ].filter(c => c.score !== undefined) : []

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900 p-6 w-full xl:w-80 flex-none">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500 mb-1">Risk concentration</p>
          <h3 className="text-lg font-bold text-white">Category breakdown</h3>
          <p className="text-xs text-slate-500 mt-0.5">Expand any category for drivers</p>
        </div>
        {!loading && risk && (
          <span className="flex-none text-xl font-extrabold text-white whitespace-nowrap">
            {overall} <span className="text-slate-500 text-sm font-normal">/ 100</span>
          </span>
        )}
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-slate-400">Analysing…</p>
      ) : (
        <div className="mt-5 space-y-2">
          {cats.map(({ key, label, score, reasons, drivers }) => {
            const s = Math.round(score ?? 0)
            const rl = riskLevel(s)
            const isOpen = expanded === key
            const allReasons = [
              ...reasons,
              ...(drivers || []).map(d => d.description || d.title).filter(Boolean)
            ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 5)

            return (
              <div key={key} className={`rounded-xl border ${rl.border} bg-slate-950 overflow-hidden`}>
                <button
                  className="w-full rounded-xl px-3 py-3 hover:bg-slate-800/30 transition-colors"
                  onClick={() => setExpanded(isOpen ? null : key)}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-slate-300 font-medium">{label}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-base font-bold ${rl.text}`}>{s}</span>
                      {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-slate-500" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-500" />}
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-800">
                    <div className={`${rl.bar} h-1.5 rounded-full transition-all`} style={{ width: `${Math.min(s, 100)}%` }} />
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className={`text-[11px] ${rl.text}`}>{rl.label}</span>
                    {allReasons.length > 0 && (
                      <span className="text-[11px] text-slate-500">{allReasons.length} signal{allReasons.length !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                </button>

                {isOpen && allReasons.length > 0 && (
                  <div className="px-3 pb-3 border-t border-slate-800 pt-2.5">
                    <ul className="space-y-1.5">
                      {allReasons.map((r, i) => (
                        <li key={i} className="flex items-start gap-2 text-[11px] text-slate-300">
                          <span className={`mt-1 h-1.5 w-1.5 rounded-full flex-none ${rl.bar}`} />
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {isOpen && allReasons.length === 0 && (
                  <div className="px-3 pb-3 border-t border-slate-800 pt-2.5">
                    <p className="text-[11px] text-slate-500 italic">No specific signals detected for this category.</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── 4. Finish-Date Window ─────────────────────────────────────────────────────

function FinishDateWindow({ sessionId }) {
  const [mc, setMc] = useState(null)
  const [forecast, setForecast] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAssumptions, setShowAssumptions] = useState(false)

  useEffect(() => {
    if (!sessionId) return
    Promise.all([
      api.monteCarlo(sessionId),
      api.forecast(sessionId).catch(() => null),
    ]).then(([m, f]) => {
      setMc(m?.monte_carlo ?? m)
      setForecast(f?.forecast ?? f)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [sessionId])

  const stats = mc?.statistics || {}
  const p10 = stats.percentile_10
  const p95 = stats.percentile_95
  const assumptions = forecast?.forecast_assumptions || null
  const confidence = forecast?.confidence_score != null
    ? forecast.confidence_score
    : forecast?.forecast_result?.confidence_score

  const dotPositions = [50, 80, 95].map(p => {
    const iso = stats[`percentile_${p}`]
    if (!iso || !p10 || !p95) return { p, iso, left: 50 }
    const min = new Date(p10).getTime()
    const max = new Date(p95).getTime()
    const val = new Date(iso).getTime()
    const left = max === min ? 0 : Math.round(((val - min) / (max - min)) * 100)
    return { p, iso, left }
  })

  const pCards = [
    {
      p: 50, label: 'P50 · Most likely', conf: '50% confidence',
      tip: 'Half of all Monte Carlo runs finish on or before this date. Best for internal planning discussions.',
      color: 'text-teal-300',
    },
    {
      p: 80, label: 'P80 · Safe target', conf: '80% confidence',
      tip: '80% of simulation runs complete by this date. Use this as your commitment to management — it leaves meaningful buffer.',
      color: 'text-amber-300',
    },
    {
      p: 95, label: 'P95 · Worst case', conf: '95% confidence',
      tip: 'Only 5% of simulations run past this date. Use this for risk planning and external commitments where overrun is costly.',
      color: 'text-rose-300',
    },
  ]

  // Build assumption rows
  const assumptionRows = assumptions ? [
    { label: 'Velocity method',    value: assumptions.velocity_calculation_method },
    { label: 'Blocker modelling',  value: assumptions.blocker_adjustment_method },
    { label: 'Spillover method',   value: assumptions.spillover_adjustment_method },
    { label: 'Critical path',      value: assumptions.critical_path_handling },
    { label: 'Timeline anchoring', value: assumptions.timeline_anchoring },
    ...(assumptions.capacity_assumptions
      ? Object.entries(assumptions.capacity_assumptions).map(([k, v]) => ({ label: k, value: String(v) }))
      : []),
  ] : []

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900 p-6 flex-1 min-w-0">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500 mb-1">Finish-date window</p>
          <h3 className="text-lg font-bold text-white">Plan against a range</h3>
          {confidence != null && (
            <p className="text-xs text-teal-400 mt-0.5">
              Forecast confidence: {Math.round(confidence * 100)}%
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-none">
          {assumptionRows.length > 0 && (
            <button
              onClick={() => setShowAssumptions(v => !v)}
              className="flex items-center gap-1.5 rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-[11px] font-semibold text-slate-300 hover:border-slate-400 transition-colors">
              <Info className="h-3 w-3" />
              Assumptions
            </button>
          )}
          <span className="rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-[11px] font-semibold text-slate-300">
            P50 to P95
          </span>
        </div>
      </div>

      {/* Assumptions panel */}
      {showAssumptions && assumptionRows.length > 0 && (
        <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-3">How these dates were calculated</p>
          <div className="space-y-2">
            {assumptionRows.map(({ label, value }) => (
              <div key={label} className="flex gap-3 text-[11px]">
                <span className="text-slate-500 flex-none w-36">{label}</span>
                <span className="text-slate-300">{value}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800 space-y-1 text-[11px] text-slate-500">
            <p>⚠ Calendar holidays and leave are not modelled — dates may be optimistic.</p>
            <p>⚠ Parallel execution is not resource-scheduled — assumes serial critical path.</p>
          </div>
        </div>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-slate-400">Running simulations…</p>
      ) : (
        <>
          {/* Range bar */}
          <div className="mt-6 mb-5 relative">
            <div className="h-2 rounded-full bg-gradient-to-r from-teal-500 via-amber-400 to-rose-500" />
            {dotPositions.map(({ p, left }) => (
              <div
                key={p}
                className="absolute -top-1.5 w-5 h-5 rounded-full border-2 border-slate-900 -translate-x-1/2"
                style={{
                  left: `${left}%`,
                  backgroundColor: p === 50 ? '#14b8a6' : p === 80 ? '#f59e0b' : '#f43f5e'
                }}
              />
            ))}
            <div className="flex justify-between mt-3 text-[11px] text-slate-500">
              <span>{fmtShort(p10)}</span>
              <span>{fmtShort(p95)}</span>
            </div>
          </div>

          {/* P cards */}
          <div className="grid grid-cols-3 gap-3 mt-6">
            {pCards.map(({ p, label, conf, tip, color }) => {
              const iso = stats[`percentile_${p}`]
              return (
                <div key={p} className="rounded-xl border border-slate-700 bg-slate-950 p-4 relative group">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-2">{label}</p>
                  <p className={`text-2xl font-bold ${color}`}>{fmtShort(iso)}</p>
                  <p className="text-[11px] text-slate-500 mt-1">{conf}</p>
                  <Tooltip tip={tip}>
                    <Info className="absolute top-3 right-3 h-3.5 w-3.5 text-slate-600 group-hover:text-slate-400 cursor-help transition-colors" />
                  </Tooltip>
                </div>
              )
            })}
          </div>

          {/* On-time probability */}
          {mc?.on_time_probability != null && (
            <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-700 bg-slate-950 px-4 py-3">
              <span className="text-xs text-slate-400">On-time delivery probability</span>
              <span className={`text-sm font-bold ${
                mc.on_time_probability >= 0.6 ? 'text-teal-300'
                : mc.on_time_probability >= 0.4 ? 'text-amber-300'
                : 'text-rose-300'
              }`}>
                {Math.round(mc.on_time_probability * 100)}%
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function ManagementSummary({ session }) {
  const sessionId = session?.project_summary?.session_id || ''
  const [deps, setDeps] = useState(null)

  useEffect(() => {
    if (!sessionId) return
    api.dependencies(sessionId)
      .then(d => setDeps(d))
      .catch(() => {})
  }, [sessionId])

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="px-1">
        <p className="text-[10px] uppercase tracking-[0.3em] text-amber-400 mb-1">Delivery intelligence</p>
        <h2 className="text-3xl font-bold text-white">Dates and dependency math</h2>
        <p className="mt-1 text-sm text-slate-400">
          What delivery window are we planning against, and which chain controls it?
        </p>
      </div>

      {/* Top row — finish-date window + risk concentration */}
      <div className="flex flex-col xl:flex-row gap-4">
        <FinishDateWindow sessionId={sessionId} />
        <RiskConcentration sessionId={sessionId} />
      </div>

      {/* Critical path — full width, interactive */}
      <CriticalPath sessionId={sessionId} />

      {/* High-risk items — explainable, expandable */}
      <HighRiskItemsPanel deps={deps} />

      {/* Scope rule footer */}
      <p className="text-[11px] text-slate-600 px-1">
        <span className="text-amber-500 font-semibold">Scope rule</span>
        {'  '}Keep this tab mathematical. Overview owns status and decisions. Sprint Health owns execution causes and people patterns.
      </p>
    </div>
  )
}
