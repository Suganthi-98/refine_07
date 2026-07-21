import React, { useState, useEffect, useCallback } from 'react'
import { api } from '../../api/client'

// ─── Constants ────────────────────────────────────────────────────────────────
const RC_META = {
  GENUINE_SKILL_MISMATCH:         { label: 'Genuine Skill Mismatch',        color: 'rose',   icon: '🚫', tip: 'Owner has no domain connection to this skill' },
  RELATED_SKILL_COMPETENCY_GAP:   { label: 'Related Skill — Competency Gap', color: 'orange', icon: '📈', tip: 'Right domain family, but depth not yet sufficient' },
  COMPETENCY_GAP_HIGH:            { label: 'Competency Gap — Critical',      color: 'rose',   icon: '⚠',  tip: 'Skill matched but severely underestimated complexity' },
  COMPETENCY_GAP_MEDIUM:          { label: 'Competency Gap — Moderate',      color: 'amber',  icon: '📊', tip: 'Skill matched but systematically underestimating' },
  DEPENDENCY_BLOCKED:             { label: 'Dependency Blocked',             color: 'sky',    icon: '🔗', tip: 'Upstream dependency was not ready at sprint start' },
  EXTERNAL_BLOCKER:               { label: 'External Blocker',               color: 'rose',   icon: '🚧', tip: 'Third-party or toolchain blocker prevented progress' },
  CAPACITY_SQUEEZE_NOT_STARTED:   { label: 'Capacity Squeeze — Not Started', color: 'amber',  icon: '⏱',  tip: 'Item could not start due to overcommitment' },
  CAPACITY_OVERCOMMIT:            { label: 'Capacity Overcommit',            color: 'amber',  icon: '🔴', tip: 'Sprint was overcommitted for this person' },
  ESTIMATION_DRIFT:               { label: 'Estimation Drift',               color: 'amber',  icon: '📉', tip: 'Systematic underestimation in this task category' },
  MINOR_VARIANCE:                 { label: 'Minor Variance',                 color: 'slate',  icon: '✓',  tip: 'Within acceptable estimation noise' },
}

const HEALTH = {
  NEEDS_IMPROVEMENT: { cls: 'bg-rose-500/15 text-rose-300 border-rose-500/40',   dot: 'bg-rose-400' },
  WATCH:             { cls: 'bg-amber-500/15 text-amber-300 border-amber-500/40',  dot: 'bg-amber-400' },
  MINOR_ISSUES:      { cls: 'bg-sky-500/15 text-sky-300 border-sky-500/40',       dot: 'bg-sky-400' },
  GOOD:              { cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40', dot: 'bg-emerald-400' },
}

const PRIORITY_CLS = {
  CRITICAL: 'bg-rose-500/20 text-rose-200 border border-rose-500/40',
  HIGH:     'bg-orange-500/20 text-orange-200 border border-orange-500/40',
  MEDIUM:   'bg-amber-500/20 text-amber-200 border border-amber-500/40',
  INFO:     'bg-slate-700 text-slate-300 border border-slate-600',
}

const COLOR_CLS = {
  rose:   { bg: 'bg-rose-500/15',   text: 'text-rose-300',   border: 'border-rose-500/30' },
  orange: { bg: 'bg-orange-500/15', text: 'text-orange-300', border: 'border-orange-500/30' },
  amber:  { bg: 'bg-amber-500/15',  text: 'text-amber-300',  border: 'border-amber-500/30' },
  sky:    { bg: 'bg-sky-500/15',    text: 'text-sky-300',    border: 'border-sky-500/30' },
  slate:  { bg: 'bg-slate-700',     text: 'text-slate-300',  border: 'border-slate-600' },
  emerald:{ bg: 'bg-emerald-500/15',text: 'text-emerald-300',border: 'border-emerald-500/30' },
}

function cx(...args) { return args.filter(Boolean).join(' ') }

// ─── Shared components ────────────────────────────────────────────────────────
function Badge({ children, color = 'slate', size = 'sm' }) {
  const c = COLOR_CLS[color] || COLOR_CLS.slate
  const sz = size === 'xs' ? 'text-xs px-2 py-0.5' : 'text-xs px-2.5 py-1 font-semibold'
  return <span className={cx('inline-flex items-center gap-1 rounded-full border', c.bg, c.text, c.border, sz)}>{children}</span>
}

function SkillPill({ required, primary, secondary, exact, affinity }) {
  const color = exact ? 'emerald' : affinity ? 'amber' : 'rose'
  const label = exact ? 'Exact match' : affinity ? 'Related skill' : 'Mismatch'
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-slate-500">Required:</span>
      <span className="text-white font-semibold">{required}</span>
      <span className="text-slate-600">|</span>
      <span className="text-slate-500">Owner primary:</span>
      <span className="text-slate-300">{primary}</span>
      {secondary && <><span className="text-slate-600">·</span><span className="text-slate-400">{secondary}</span></>}
      <Badge color={color} size="xs">{color === 'emerald' ? '✓' : color === 'amber' ? '≈' : '✗'} {label}</Badge>
    </div>
  )
}

function OverrunBar({ est, actual }) {
  if (!est || !actual) return null
  const overrunPct = Math.round((actual / est - 1) * 100)
  const barMax = Math.max(actual, est)
  const estW = Math.round((est / barMax) * 100)
  const actW = Math.round((actual / barMax) * 100)
  const color = overrunPct > 50 ? 'bg-rose-500' : overrunPct > 25 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">{est}h estimated</span>
        <span className={cx('font-bold', overrunPct > 50 ? 'text-rose-400' : overrunPct > 25 ? 'text-amber-400' : 'text-emerald-400')}>
          {actual}h actual {overrunPct > 0 ? `(+${overrunPct}%)` : ''}
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-slate-800 overflow-hidden">
        <div className="absolute h-2 rounded-full bg-slate-600 transition-all" style={{ width: `${estW}%` }} />
        <div className={cx('absolute h-2 rounded-full transition-all', color)} style={{ width: `${actW}%` }} />
      </div>
    </div>
  )
}

// ─── Item detail card ─────────────────────────────────────────────────────────
function ItemCard({ item, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  const rc = RC_META[item.root_cause] || RC_META.MINOR_VARIANCE
  const c  = COLOR_CLS[rc.color] || COLOR_CLS.slate
  const sev = item.severity === 'HIGH' || item.severity === 'CRITICAL' ? 'rose'
            : item.severity === 'MEDIUM' ? 'amber' : 'slate'

  return (
    <div className={cx('rounded-2xl border overflow-hidden', open ? 'border-slate-600' : 'border-slate-700')}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-start justify-between gap-3 p-4 text-left hover:bg-slate-800/40 transition"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500">{item.item_id}</span>
            {item.is_spillover && (
              <span className="text-xs text-slate-500">S{item.from_sprint}→S{item.to_sprint}</span>
            )}
            {!item.is_spillover && (
              <span className="text-xs text-slate-500">Sprint {item.sprint_id}</span>
            )}
          </div>
          <p className="text-sm font-semibold text-white mt-0.5 truncate">{item.item_title}</p>
          <p className="text-xs text-slate-400 mt-0.5">{item.owner?.replace(/_/g,' ')}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-none">
          <span className={cx('text-xs font-semibold px-2 py-0.5 rounded-full border', c.bg, c.text, c.border)}>
            {rc.icon} {rc.label}
          </span>
          {item.overrun_pct !== null && item.overrun_pct !== undefined && (
            <span className={cx('text-xs font-bold px-2 py-0.5 rounded-full',
              item.overrun_pct > 50 ? 'text-rose-300 bg-rose-500/15' :
              item.overrun_pct > 25 ? 'text-amber-300 bg-amber-500/15' : 'text-slate-300 bg-slate-700')}>
              {item.overrun_pct > 0 ? `+${item.overrun_pct}%` : `${item.overrun_pct}%`}
            </span>
          )}
          <span className="text-slate-500 text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-slate-800 space-y-4 pt-3">
          {/* Skill match */}
          <SkillPill
            required={item.required_skill} primary={item.owner_primary}
            secondary={item.owner_secondary} exact={item.exact_skill_match}
            affinity={item.affinity_match}
          />

          {/* Effort bar */}
          {item.actual_hrs > 0 && <OverrunBar est={item.estimated_hrs} actual={item.actual_hrs} />}
          {item.actual_hrs === 0 && item.estimated_hrs > 0 && (
            <div className="text-xs text-amber-300 font-semibold">⏱ {item.estimated_hrs}h planned — item was not started this sprint</div>
          )}

          {/* Root cause explanation */}
          <div className="rounded-xl bg-slate-800/60 p-3">
            <div className="text-xs uppercase tracking-[0.12em] text-slate-500 mb-1.5">Root cause analysis</div>
            <p className="text-sm text-slate-300 leading-6">{item.explanation}</p>
          </div>

          {/* Prevention */}
          <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-3">
            <div className="text-xs uppercase tracking-[0.12em] text-emerald-400 mb-1.5">Preventive action</div>
            <p className="text-sm text-emerald-200 leading-6">{item.prevention}</p>
          </div>

          {/* Metric */}
          {item.metric_to_track && (
            <div className="flex items-start gap-2 text-xs text-slate-400">
              <span className="flex-none text-sky-400 font-semibold mt-0.5">📏 Track:</span>
              <span>{item.metric_to_track}</span>
            </div>
          )}
          {item.sprint_action && (
            <div className="flex items-start gap-2 text-xs text-slate-400">
              <span className="flex-none text-amber-400 font-semibold mt-0.5">⚡ Next sprint:</span>
              <span>{item.sprint_action}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Person card ──────────────────────────────────────────────────────────────
function PersonCard({ person, selected, onSelect }) {
  const h = HEALTH[person.health] || HEALTH.GOOD
  return (
    <button
      onClick={() => onSelect(person)}
      className={cx('w-full rounded-2xl border p-4 text-left transition',
        selected ? 'border-amber-500 bg-amber-500/5' : 'border-slate-700 bg-slate-900 hover:bg-slate-800/50')}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-bold text-white truncate">{person.resource_id.replace(/_/g,' ')}</div>
          <div className="text-xs text-slate-500 mt-0.5 truncate">{person.primary_skill}</div>
        </div>
        <span className={cx('flex-none text-xs font-semibold px-2.5 py-1 rounded-full border', h.cls)}>
          {person.health_label}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1">
        {[
          { label: 'Assigned', val: person.total_assigned },
          { label: 'Issues',   val: person.total_issues, color: person.total_issues > 3 ? 'text-rose-400' : person.total_issues > 1 ? 'text-amber-400' : 'text-white' },
          { label: 'Overrun',  val: person.avg_overrun_pct > 0 ? `${person.avg_overrun_pct}%` : '—', color: person.avg_overrun_pct > 40 ? 'text-rose-400' : person.avg_overrun_pct > 20 ? 'text-amber-400' : 'text-white' },
        ].map(({ label, val, color }) => (
          <div key={label} className="rounded-xl bg-slate-800/60 py-1.5 text-center">
            <div className="text-xs text-slate-500">{label}</div>
            <div className={cx('text-sm font-bold', color || 'text-white')}>{val}</div>
          </div>
        ))}
      </div>

      {person.high_severity_count > 0 && (
        <div className="mt-2">
          <Badge color="rose" size="xs">⚠ {person.high_severity_count} high severity</Badge>
        </div>
      )}
    </button>
  )
}

// ─── Person detail ────────────────────────────────────────────────────────────
function PersonDetail({ person, spilloverItems, overbillingItems }) {
  const mySpillover   = spilloverItems.filter(s => s.owner === person.resource_id)
  const myOverbilling = overbillingItems.filter(o => o.owner === person.resource_id)
  const h = HEALTH[person.health] || HEALTH.GOOD

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-3xl border border-slate-700 bg-slate-900 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold text-white">{person.resource_id.replace(/_/g,' ')}</h3>
            <p className="text-sm text-slate-400 mt-0.5">{person.primary_skill}</p>
            {person.secondary_skill && <p className="text-xs text-slate-500 mt-0.5">Also: {person.secondary_skill}</p>}
          </div>
          <span className={cx('text-sm font-bold px-3 py-1.5 rounded-full border', h.cls)}>{person.health_label}</span>
        </div>

        {/* Completion progress bar */}
        {person.total_assigned > 0 && (
          <div className="mt-4 space-y-1.5">
            <div className="flex justify-between text-xs text-slate-500">
              <span>{person.completed_count} of {person.total_assigned} items completed</span>
              <span className="font-semibold text-white">{Math.round(person.completed_count / person.total_assigned * 100)}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-2 rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.round(person.completed_count / person.total_assigned * 100)}%` }}
              />
            </div>
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { l: 'Assigned',   v: person.total_assigned },
            { l: 'Completed',  v: person.completed_count, color: person.completed_count > 0 ? 'text-emerald-400' : 'text-slate-400' },
            { l: 'Avg overrun',v: `${person.avg_overrun_pct}%`, color: person.avg_overrun_pct > 40 ? 'text-rose-400' : person.avg_overrun_pct > 20 ? 'text-amber-400' : 'text-emerald-400' },
            { l: 'Issues',     v: person.total_issues, color: person.total_issues > 3 ? 'text-rose-400' : person.total_issues > 1 ? 'text-amber-400' : 'text-white' },
          ].map(({ l, v, color }) => (
            <div key={l} className="rounded-2xl bg-slate-800/60 border border-slate-700 p-3 text-center">
              <div className="text-xs text-slate-500">{l}</div>
              <div className={cx('mt-1 text-2xl font-extrabold', color || 'text-white')}>{v}</div>
            </div>
          ))}
        </div>

        {/* Root cause breakdown */}
        {Object.keys(person.root_cause_breakdown).length > 0 && (
          <div className="mt-4">
            <div className="text-xs uppercase tracking-[0.12em] text-slate-500 mb-2">Issues breakdown</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(person.root_cause_breakdown).map(([rc, cnt]) => {
                const m = RC_META[rc] || { label: rc, color: 'slate', icon: '•' }
                return <Badge key={rc} color={m.color} size="xs">{m.icon} {m.label} ({cnt})</Badge>
              })}
            </div>
          </div>
        )}
      </div>

      {/* Action plan */}
      {person.action_plan?.length > 0 && (
        <div className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-5">
          <p className="text-xs uppercase tracking-[0.15em] text-amber-400 mb-3">Action Plan for {person.resource_id.replace(/_/g,' ')}</p>
          <div className="space-y-3">
            {person.action_plan.filter(a => a.priority !== 'INFO').map((a, i) => (
              <div key={i} className="flex gap-3">
                <span className={cx('flex-none text-xs font-bold px-2 py-0.5 rounded-full mt-0.5 h-fit', PRIORITY_CLS[a.priority] || PRIORITY_CLS.INFO)}>
                  {a.priority}
                </span>
                <div>
                  <div className="text-xs uppercase tracking-[0.1em] text-slate-500 mb-0.5">{a.type.replace(/_/g,' ')}</div>
                  <p className="text-sm text-slate-200 leading-6">{a.action}</p>
                </div>
              </div>
            ))}
            {person.action_plan.every(a => a.priority === 'INFO') && (
              <p className="text-sm text-emerald-300">{person.action_plan[0]?.action}</p>
            )}
          </div>
        </div>
      )}

      {/* Spillover items */}
      {mySpillover.length > 0 && (
        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-5">
          <p className="text-xs uppercase tracking-[0.15em] text-slate-500 mb-3">Spillover items ({mySpillover.length})</p>
          <div className="space-y-2">
            {mySpillover.map(s => <ItemCard key={s.item_id} item={s} />)}
          </div>
        </div>
      )}

      {/* Overbilling items */}
      {myOverbilling.length > 0 && (
        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-5">
          <p className="text-xs uppercase tracking-[0.15em] text-slate-500 mb-3">Overbilling items ({myOverbilling.length})</p>
          <div className="space-y-2">
            {myOverbilling.map(o => <ItemCard key={o.item_id + o.sprint_id} item={o} />)}
          </div>
        </div>
      )}

      {person.health === 'GOOD' && mySpillover.length === 0 && myOverbilling.length === 0 && (
        <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/5 p-6 text-center">
          <p className="text-lg font-semibold text-emerald-300">✓ No issues detected</p>
          <p className="text-sm text-slate-400 mt-1">No spillover or overbilling events in analysed sprints.</p>
        </div>
      )}
    </div>
  )
}

// ─── Summary bar ──────────────────────────────────────────────────────────────
function SummaryBar({ summary }) {
  const dist = summary.root_cause_distribution || {}
  const total = Object.values(dist).reduce((a, b) => a + b, 0) || 1
  const segments = [
    { key: 'GENUINE_SKILL_MISMATCH',       color: 'bg-rose-600',   label: 'Skill mismatch' },
    { key: 'RELATED_SKILL_COMPETENCY_GAP', color: 'bg-orange-500', label: 'Related skill gap' },
    { key: 'COMPETENCY_GAP_HIGH',          color: 'bg-rose-400',   label: 'Comp. gap (high)' },
    { key: 'COMPETENCY_GAP_MEDIUM',        color: 'bg-amber-400',  label: 'Comp. gap (med)' },
    { key: 'CAPACITY_SQUEEZE_NOT_STARTED', color: 'bg-amber-600',  label: 'Not started' },
    { key: 'CAPACITY_OVERCOMMIT',          color: 'bg-amber-300',  label: 'Overcommit' },
    { key: 'DEPENDENCY_BLOCKED',           color: 'bg-sky-500',    label: 'Dependency' },
    { key: 'EXTERNAL_BLOCKER',             color: 'bg-sky-300',    label: 'Blocker' },
    { key: 'ESTIMATION_DRIFT',             color: 'bg-slate-500',  label: 'Estimation drift' },
    { key: 'MINOR_VARIANCE',               color: 'bg-slate-600',  label: 'Minor variance' },
  ].filter(s => dist[s.key] > 0)

  return (
    <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm uppercase tracking-[0.3em] text-amber-400">Sprint Health</p>
        <h2 className="text-2xl font-bold text-white">
          {summary.sprints_analysed} sprints · {summary.total_wasted_hrs}h wasted effort
        </h2>
        <p className="text-sm text-slate-400">{summary.overall_summary}</p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Spillover items',    val: summary.total_spillover,   color: 'text-amber-400' },
          { label: 'Overbilling items',  val: summary.total_overbilling,  color: 'text-rose-400' },
          { label: 'Hours wasted',       val: `${summary.total_wasted_hrs}h`, color: 'text-rose-400' },
          { label: 'People to act on',   val: summary.people_critical + summary.people_watch,
            color: summary.people_critical > 0 ? 'text-rose-400' : 'text-amber-400' },
        ].map(({ label, val, color }) => (
          <div key={label} className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
            <div className="text-xs uppercase tracking-[0.12em] text-slate-500">{label}</div>
            <div className={cx('mt-1 text-3xl font-extrabold', color)}>{val}</div>
          </div>
        ))}
      </div>

      <div className="mt-5">
        <div className="text-xs uppercase tracking-[0.12em] text-slate-500 mb-2">Root cause distribution</div>
        <div className="flex h-3 rounded-full overflow-hidden gap-px">
          {segments.map(s => (
            <div key={s.key} className={cx(s.color, 'h-3 transition-all')}
              style={{ width: `${Math.round(dist[s.key] / total * 100)}%` }}
              title={`${s.label}: ${dist[s.key]}`} />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-3">
          {segments.map(s => (
            <div key={s.key} className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className={cx('w-2.5 h-2.5 rounded-full flex-none', s.color)} />
              {s.label} ({dist[s.key]})
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Systemic actions panel ───────────────────────────────────────────────────
const PRIORITY_CONFIG = {
  CRITICAL: { dot: 'bg-rose-500',   ring: 'border-rose-500/30',   bg: 'bg-rose-500/5',   label: 'Critical', labelCls: 'text-rose-400',   actionBorder: 'border-rose-500/20',   actionBg: 'bg-rose-500/5'   },
  HIGH:     { dot: 'bg-orange-400', ring: 'border-orange-400/30', bg: 'bg-orange-400/5', label: 'High',     labelCls: 'text-orange-400', actionBorder: 'border-orange-400/20', actionBg: 'bg-orange-400/5' },
  MEDIUM:   { dot: 'bg-amber-400',  ring: 'border-amber-400/20',  bg: 'bg-amber-400/5',  label: 'Medium',   labelCls: 'text-amber-400',  actionBorder: 'border-amber-400/20',  actionBg: 'bg-amber-400/5'  },
  INFO:     { dot: 'bg-sky-400',    ring: 'border-sky-400/20',    bg: 'bg-sky-400/5',    label: 'Info',     labelCls: 'text-sky-400',    actionBorder: 'border-sky-400/20',    actionBg: 'bg-sky-400/5'    },
}

function SystemicCard({ priority, sprint, trigger, finding, action, confidence, evidence }) {
  const [open, setOpen] = useState(false)
  const cfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.INFO

  return (
    <div className={cx('rounded-2xl border overflow-hidden transition-all', cfg.ring, open ? cfg.bg : 'bg-slate-900/60')}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-start gap-4 px-5 py-4 text-left group"
      >
        {/* Priority dot — left accent */}
        <div className="flex-none pt-1">
          <span className={cx('block w-2.5 h-2.5 rounded-full mt-0.5', cfg.dot)} />
        </div>

        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-white leading-snug">{trigger}</p>
            {sprint && (
              <span className="flex-none text-[11px] font-medium text-slate-500 whitespace-nowrap mt-0.5">{sprint}</span>
            )}
          </div>
          {/* Action preview — always visible, never truncated */}
          <p className={cx('mt-1.5 text-xs leading-5', cfg.labelCls)}>
            {action}
          </p>
        </div>

        {/* Chevron */}
        <div className="flex-none pt-1 text-slate-600 group-hover:text-slate-400 transition">
          <svg className={cx('w-4 h-4 transition-transform', open && 'rotate-180')} viewBox="0 0 16 16" fill="none">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </button>

      {/* Expanded body */}
      {open && (
        <div className="px-5 pb-5 pt-1 space-y-4 border-t border-slate-800/60">
          {finding && (
            <p className="text-sm text-slate-400 leading-6">{finding}</p>
          )}
          <div className={cx('rounded-xl border px-4 py-3', cfg.actionBorder, cfg.actionBg)}>
            <p className={cx('text-[11px] uppercase tracking-[0.15em] font-semibold mb-1.5', cfg.labelCls)}>Recommended action</p>
            <p className="text-sm text-slate-200 leading-6">{action}</p>
          </div>
          {evidence?.length > 0 && (
            <div className="space-y-1.5 pl-1">
              {evidence.map((e, j) => (
                <div key={j} className="flex items-start gap-2 text-xs text-slate-500">
                  <span className="flex-none text-slate-700 mt-0.5">›</span>
                  <span>{e}</span>
                </div>
              ))}
            </div>
          )}
          {confidence != null && (
            <div className="flex justify-end">
              <Badge color={confidence > 0.7 ? 'emerald' : 'amber'} size="xs">
                {Math.round(confidence * 100)}% confident
              </Badge>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SystemicPanel({ actions, historical }) {
  if (!actions?.length && !historical?.length) return (
    <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/5 p-10 text-center">
      <p className="text-lg font-semibold text-emerald-300">✓ No systemic issues</p>
      <p className="mt-1 text-sm text-slate-500">All patterns are within acceptable range.</p>
    </div>
  )

  const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, INFO: 3 }
  const sorted = [...(actions || [])].sort((a, b) =>
    (priorityOrder[a.priority] ?? 4) - (priorityOrder[b.priority] ?? 4)
  )

  // Count by priority for the summary strip
  const counts = sorted.reduce((acc, a) => {
    acc[a.priority] = (acc[a.priority] || 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-6">

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {['CRITICAL','HIGH','MEDIUM','INFO'].map(p => {
          const cfg = PRIORITY_CONFIG[p]
          const n = counts[p] || 0
          return (
            <div key={p} className={cx(
              'rounded-2xl border px-4 py-3 flex items-center gap-3',
              n > 0 ? cfg.ring : 'border-slate-800',
              n > 0 ? cfg.bg : 'bg-slate-900/40'
            )}>
              <span className={cx('w-2.5 h-2.5 rounded-full flex-none', n > 0 ? cfg.dot : 'bg-slate-700')} />
              <div>
                <p className={cx('text-xl font-extrabold', n > 0 ? cfg.labelCls : 'text-slate-600')}>{n}</p>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">{cfg.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Action cards */}
      {sorted.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 px-1 pb-1">
            Issues requiring attention
          </p>
          {sorted.map((a, i) => (
            <SystemicCard
              key={i}
              priority={a.priority}
              sprint={a.sprint}
              trigger={a.trigger}
              finding={a.finding}
              action={a.action}
            />
          ))}
        </div>
      )}


    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export function SprintHealth({ session }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)
  const [selected, setSelected] = useState(null)
  const [view, setView] = useState('people')

  const sessionId = session?.project_summary?.session_id || ''

  const load = useCallback(() => {
    if (!sessionId) { setError(new Error('Missing session id')); setLoading(false); return }
    setLoading(true); setError(null)
    api.sprintHealth(sessionId)
      .then(d => {
        setData(d)
        const first = (d.people || []).find(p => p.health === 'NEEDS_IMPROVEMENT')
          || (d.people || []).find(p => p.health === 'WATCH')
          || d.people?.[0]
        setSelected(first || null)
        setLoading(false)
      })
      .catch(err => { setError(err); setLoading(false) })
  }, [sessionId])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <section className="rounded-3xl border border-slate-700 bg-slate-900 p-8 text-center">
      <p className="text-sm uppercase tracking-[0.3em] text-amber-400">Sprint Health</p>
      <p className="mt-3 text-sm text-slate-400">Analysing sprint history…</p>
    </section>
  )
  if (error) return (
    <section className="rounded-3xl border border-rose-600 bg-rose-900/10 p-6">
      <p className="text-rose-400 font-semibold">Sprint Health unavailable</p>
      <p className="mt-1 text-sm text-rose-300">{error.message}</p>
      <button onClick={load} className="mt-3 rounded-2xl border border-rose-500 px-4 py-2 text-sm text-rose-200">Retry</button>
    </section>
  )
  if (!data) return null

  const { summary, people, spillover_items, overbilling_items } = data
  const tabs = [
    { key: 'people',     label: `👤 Team (${people.length})` },
    { key: 'spillover',  label: `→ Spillover (${spillover_items.length})` },
    { key: 'overbilling',label: `⚠ Overbilling (${overbilling_items.length})` },
    { key: 'systemic',   label: `🛡 Systemic Actions (${summary.systemic_actions?.length || 0})` },
  ]

  return (
    <div className="space-y-4">
      <SummaryBar summary={summary} />

      <div className="flex flex-wrap gap-2">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setView(t.key)}
            className={cx('rounded-full px-4 py-2 text-sm font-semibold transition whitespace-nowrap',
              view === t.key ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20' : 'bg-slate-800 text-slate-300 hover:bg-slate-700')}>
            {t.label}
          </button>
        ))}
      </div>

      {view === 'people' && (
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <div className="space-y-2">
            {people.map(p => (
              <PersonCard key={p.resource_id} person={p}
                selected={selected?.resource_id === p.resource_id}
                onSelect={setSelected} />
            ))}
          </div>
          <div>
            {selected
              ? <PersonDetail person={selected} spilloverItems={spillover_items} overbillingItems={overbilling_items} />
              : <div className="rounded-3xl border border-slate-700 bg-slate-900 p-8 text-center text-slate-500">Select a team member to see their profile</div>
            }
          </div>
        </div>
      )}

      {view === 'spillover' && (
        <div className="space-y-3">
          {spillover_items.length === 0
            ? <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/5 p-8 text-center"><p className="text-emerald-400 font-semibold">No spillover detected</p></div>
            : spillover_items.map(s => <ItemCard key={s.item_id} item={s} defaultOpen={false} />)
          }
        </div>
      )}

      {view === 'overbilling' && (
        <div className="space-y-3">
          {overbilling_items.length === 0
            ? <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/5 p-8 text-center"><p className="text-emerald-400 font-semibold">No overbilling detected</p></div>
            : overbilling_items.map(o => <ItemCard key={o.item_id + o.sprint_id} item={o} defaultOpen={false} />)
          }
        </div>
      )}

      {view === 'systemic' && (
        <SystemicPanel
          actions={summary.systemic_actions}
          historical={summary.historical_prevention}
        />
      )}
    </div>
  )
}

export default SprintHealth
