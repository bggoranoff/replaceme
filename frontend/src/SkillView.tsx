import type { ReactNode } from 'react'
import { formatValue, variableInfo, type Evidence, type LearnedSkill, type SectionKey } from './skillData'

function ScoreSparkline({ skill }: { skill: LearnedSkill }) {
  const points = skill.score_history
  if (points.length === 0) return null
  const w = 280
  const h = 72
  const pad = 8
  const x = (i: number) => pad + (points.length === 1 ? 0 : (i * (w - 2 * pad)) / (points.length - 1))
  const y = (score: number) => pad + ((100 - score) * (h - 2 * pad)) / 100
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ')
  const last = points[points.length - 1]

  return (
    <figure className="sk-spark">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={`Score per attempt: ${points.map((p) => p.score).join(', ')}`}>
        <line className="sk-spark-pass" x1={pad} x2={w - pad} y1={y(skill.pass_threshold)} y2={y(skill.pass_threshold)} />
        <path className="sk-spark-line" d={line} />
        {points.map((p, i) => (
          <g key={p.attempt}>
            <circle className={`sk-spark-dot${p === last ? ' last' : ''}`} cx={x(i)} cy={y(p.score)} r={p === last ? 4.5 : 3} />
            <circle className="sk-spark-hit" cx={x(i)} cy={y(p.score)} r={10}>
              <title>{`Attempt ${p.attempt}: ${p.score}${p.passed ? ' (pass)' : ''}`}</title>
            </circle>
          </g>
        ))}
      </svg>
      <figcaption>
        <span>
          Attempt 1 → {last.attempt}: <strong>{points[0].score}</strong> → <strong>{last.score}</strong>
        </span>
        <span>best {skill.best_score}, pass at {skill.pass_threshold}</span>
      </figcaption>
    </figure>
  )
}

function EvidenceChips({ evidence, unit }: { evidence: Evidence[]; unit: string }) {
  if (evidence.length === 0) return null
  const best = Math.max(...evidence.map((e) => e.score))
  return (
    <ul className="sk-evidence" aria-label="Values tried and their scores">
      {evidence.map((e, i) => (
        <li key={`${e.attempt}-${i}`} className={e.score === best ? 'best' : undefined}>
          <span>#{e.attempt}</span> {formatValue(e.value, unit)} → <strong>{e.score}</strong>
        </li>
      ))}
    </ul>
  )
}

function Section({ id, title, updated, children }: { id: SectionKey; title: string; updated: Set<SectionKey>; children: ReactNode }) {
  return (
    <section className={`sk-section${updated.has(id) ? ' sk-flash' : ''}`} data-section={id}>
      <h3>{title}</h3>
      {children}
    </section>
  )
}

export function SkillView({ skill, updated }: { skill: LearnedSkill; updated: Set<SectionKey> }) {
  const info = variableInfo(skill)

  return (
    <article className="sk-doc" aria-labelledby="sk-title">
      <header className="sk-doc-head">
        <span className="sk-badge large">L{skill.level_index}</span>
        <div>
          <h2 id="sk-title">{skill.name}</h2>
          <span className="sk-meta">
            {skill.trained_attempts} attempts, best {skill.best_score}, {skill.passed ? 'passed' : 'not passed yet'}
          </span>
        </div>
      </header>

      <p className={`sk-desc${updated.has('description') ? ' sk-flash' : ''}`}>{skill.description}</p>

      <ScoreSparkline skill={skill} />

      {skill.learned_parameters.length > 0 && (
        <Section id="learned_parameters" title="Learned values" updated={updated}>
          <ul className="sk-params">
            {skill.learned_parameters.map((p) => (
              <li key={p.variable}>
                <div className="sk-param-head">
                  <span className="sk-param-label">{p.label}</span>
                  <strong className="sk-param-value">{formatValue(p.value, p.unit)}</strong>
                </div>
                <p>{p.rationale}</p>
                <EvidenceChips evidence={p.evidence} unit={p.unit} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {skill.control_effects.length > 0 && (
        <Section id="control_effects" title="How each control affects the score" updated={updated}>
          <ul className="sk-effects">
            {skill.control_effects.map((c) => {
              const { label, unit } = info(c.variable)
              return (
                <li key={c.variable}>
                  <strong>{label}</strong>
                  <p>{c.effect}</p>
                  <EvidenceChips evidence={c.evidence} unit={unit} />
                </li>
              )
            })}
          </ul>
        </Section>
      )}

      {skill.steps.length > 0 && (
        <Section id="steps" title="Steps" updated={updated}>
          <ol className="sk-steps">
            {skill.steps.map((step, i) => (
              <li key={i}>
                <span className="sk-step-num">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {skill.caveats.length > 0 && (
        <Section id="caveats" title="Caveats" updated={updated}>
          <ul className="sk-bullets">
            {skill.caveats.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </Section>
      )}

      {skill.problems.length > 0 && (
        <Section id="problems" title="Problems it ran into" updated={updated}>
          <ul className="sk-problems">
            {skill.problems.map((p, i) => (
              <li key={i}>
                <span className="sk-attempt">Attempt {p.attempt}</span>
                <span>{p.problem}</span>
                <span className="sk-fix">Fix: {p.fix}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {skill.user_context.length > 0 && (
        <Section id="user_context" title="Your context" updated={updated}>
          <ul className="sk-bullets">
            {skill.user_context.map((u, i) => (
              <li key={i}>{u.text}</li>
            ))}
          </ul>
        </Section>
      )}

      {skill.sources.length > 0 && (
        <section className="sk-section">
          <h3>Sources</h3>
          <ul className="sk-sources">
            {skill.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.title || s.url}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  )
}
