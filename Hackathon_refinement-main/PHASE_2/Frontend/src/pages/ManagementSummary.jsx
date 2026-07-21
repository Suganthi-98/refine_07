import React, { useState, useEffect } from 'react'
import { AlertTriangle, GitBranch, BarChart2, ShieldAlert } from 'lucide-react'
import { api } from '../api/client'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtShort(iso) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }
  catch { return iso }
}

function riskLevel(score) {
  if (score >= 70) return { label: 'High',   bar: 'bg-rose-500',    text: 'text-rose-400' }
  if (score >= 45) return { label: 'Medium', bar: 'bg-amber-400',   text: 'text-amber-400' }
  return              { label: 'Low',    bar: 'bg-teal-400',    text: 'text-teal-400' }
}

// ── Finish-date window ────────────────────────────────────────────────────────

function FinishDateWindow({ sessionId }) {
  const [mc, setMc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshedAgo, setRefreshedAgo] = useState(null)

  useEffect(() => {
    if (!sessionId) return
    const t0 = Date.now()
    api.monteCarlo(sessionId)
      .then(m => {
        setMc(m?.monte_carlo ?? m)
        setRefreshedAgo(Math.round((Date.now() - t0) / 1000))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [sessionId])

  const stats = mc?.statistics || {}
  const p10 = stats.percentile_10
  const p95 = stats.percentile_95

  // Position dots on the range bar
  const dotPositions = [50, 80, 95].map(p => {
    const iso = stats[`percentile_${p}`]
    if (!iso || !p10 || !p95) return { p, iso, left: 0 }
    const min = new Date(p10).getTime()
    const max = new Date(p95).getTime()
    const val = new Date(iso).getTime()
    const left = max === min ? 0 : Math.round(((val - min) / (max - min)) * 100)
    return { p, iso, left }
  })

  const pCards = [
    { p: 50, label: 'P50 · Most likely',  conf: '50% confidence' },
    { p: 80, label: 'P80 · Safe target',  conf: '80% confidence' },
    { p: 95, label: 'P95 · Worst case',   conf: '95% confidence' },
  ]

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900 p-6 flex-1 min-w-0">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500 mb-1">Finish-date window</p>
          <h3 className="text-lg font-bold text-white">Plan against a range</h3>
          <p className="text-xs text-teal-400 mt-0.5">
            
          </p>
        </div>
        <span className="flex-none rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-[11px] font-semibold text-slate-300">
          P50 to P95
        </span>
      </div>

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

          {/* P50 / P80 / P95 cards */}
          <div className="grid grid-cols-3 gap-3 mt-6">
            {pCards.map(({ p, label, conf }) => {
              const iso = stats[`percentile_${p}`]
              return (
                <div key={p} className="rounded-xl border border-slate-700 bg-slate-950 p-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-2">{label}</p>
                  <p className="text-2xl font-bold text-white">{fmtShort(iso)}</p>
                  <p className="text-[11px] text-slate-500 mt-1">{conf}</p>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ── Risk concentration ────────────────────────────────────────────────────────

function RiskConcentration({ sessionId }) {
  const [risk, setRisk] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!sessionId) return
    api.risk(sessionId)
      .then(r => { setRisk(r?.risk_analysis ?? r?.risk_assessment ?? r); setLoading(false) })
      .catch(() => setLoading(false))
  }, [sessionId])

  const overall = Math.round(risk?.overall_risk_score ?? 0)

  const cats = risk ? [
    { label: 'Schedule',   score: risk.schedule_risk?.score,   signals: risk.schedule_risk?.reasons?.length },
    { label: 'Dependency', score: risk.dependency_risk?.score, signals: risk.dependency_risk?.reasons?.length },
    { label: 'Resource',   score: risk.resource_risk?.score,   signals: risk.resource_risk?.reasons?.length },
    { label: 'Scope',      score: risk.scope_risk?.score,      signals: risk.scope_risk?.reasons?.length },
  ].filter(c => c.score !== undefined) : []

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900 p-6 w-full xl:w-80 flex-none">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500 mb-1">Risk concentration</p>
          <h3 className="text-lg font-bold text-white">Category scores only</h3>
          <p className="text-xs text-slate-500 mt-0.5">No driver stories or actions repeated from Overview</p>
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
        <div className="mt-5 grid grid-cols-2 gap-3">
          {cats.map(({ label, score, signals }) => {
            const s = Math.round(score ?? 0)
            const rl = riskLevel(s)
            return (
              <div key={label} className="rounded-xl border border-slate-700 bg-slate-950 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-300">{label}</span>
                  <span className="text-lg font-bold text-white">{s}</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-800 mb-2">
                  <div className={`${rl.bar} h-1.5 rounded-full`} style={{ width: `${Math.min(s, 100)}%` }} />
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-[11px] ${rl.text}`}>{rl.label}</span>
                  {signals != null && (
                    <span className="text-[11px] text-slate-500">{signals} signal{signals !== 1 ? 's' : ''}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Critical path ─────────────────────────────────────────────────────────────

function CriticalPath({ sessionId }) {
  const [deps, setDeps] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!sessionId) return
    api.dependencies(sessionId)
      .then(d => { setDeps(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [sessionId])

  const chain = Array.isArray(deps?.critical_path) ? deps.critical_path : []
  const highRisk = Array.isArray(deps?.high_risk_items) ? deps.high_risk_items : []
  const duration = deps?.critical_path_duration_days
  const growth = deps?.critical_path_growth_percent
  const itemCount = deps?.critical_path_item_count ?? chain.length

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500 mb-1">Critical path</p>
          <h3 className="text-lg font-bold text-white">The chain that controls delivery</h3>
          <p className="text-xs text-slate-500 mt-0.5">Dependency order, path length, and change versus baseline</p>
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
              { value: growth != null ? `${growth.toFixed(1)}%` : '—',    sub: 'Growth versus baseline', warn: growth > 10 },
            ].map(({ value, sub, warn }) => (
              <div key={sub}>
                <p className={`text-3xl font-bold ${warn ? 'text-amber-300' : 'text-white'}`}>{value}</p>
                <p className="text-xs text-slate-500 mt-1">{sub}</p>
              </div>
            ))}
          </div>

          {/* Chain */}
          {chain.length > 0 && (
            <div className="mt-6 overflow-x-auto pb-1">
              <div className="inline-flex items-center gap-2 flex-nowrap">
                {chain.map((id, i) => {
                  const isHigh = highRisk.includes(id)
                  return (
                    <React.Fragment key={id + i}>
                      <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                        isHigh
                          ? 'border-rose-500/60 bg-rose-500/10 text-rose-200'
                          : 'border-slate-600 bg-slate-800 text-slate-200'
                      }`}>
                        {id}
                      </span>
                      {i < chain.length - 1 && (
                        <span className="text-slate-600 text-sm select-none">——</span>
                      )}
                    </React.Fragment>
                  )
                })}
              </div>
            </div>
          )}

          {/* High-risk callout */}
          {highRisk.length > 0 && (
            <div className="mt-4 rounded-xl border border-rose-500/30 bg-slate-950 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.2em] text-rose-400 mb-2">High-risk items on path</p>
              <div className="flex flex-wrap gap-2">
                {highRisk.map((id, i) => (
                  <span key={i} className="rounded-full border border-rose-500/40 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-200">{id}</span>
                ))}
              </div>
            </div>
          )}

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

// ── Main ─────────────────────────────────────────────────────────────────────

export function ManagementSummary({ session }) {
  const sessionId = session?.project_summary?.session_id || ''

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="px-1">
        <p className="text-[10px] uppercase tracking-[0.3em] text-amber-400 mb-1">Delivery intelligence</p>
        <h2 className="text-3xl font-bold text-white">Dates and dependency math</h2>
        <p className="mt-1 text-sm text-slate-400">
          This tab answers one question: what delivery window are we planning against, and which chain controls it?
        </p>
      </div>

      {/* Top row — finish-date window + risk concentration */}
      <div className="flex flex-col xl:flex-row gap-4">
        <FinishDateWindow sessionId={sessionId} />
        <RiskConcentration sessionId={sessionId} />
      </div>

      {/* Full-width critical path */}
      <CriticalPath sessionId={sessionId} />

      {/* Scope rule footer */}
      <p className="text-[11px] text-slate-600 px-1">
        <span className="text-amber-500 font-semibold">Scope rule</span>
        {'  '}Keep this tab mathematical. Overview owns status and decisions. Sprint Health owns execution causes and people patterns.
      </p>
    </div>
  )
}
