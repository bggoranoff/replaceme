import { DEMO_SKILLS, type Skill } from './skillData'

export function Skills({ onBack, onOpen }: { onBack: () => void; onOpen: (skill: Skill) => void }) {
  return (
    <section className="skills">
      <div className="game-top">
        <button type="button" className="back" onClick={onBack}>
          ← Back to game
        </button>
      </div>

      <div className="skills-head">
        <h2>Skills learned</h2>
      </div>

      <ul className="skill-list">
        {DEMO_SKILLS.map((skill) => (
          <li key={skill.id}>
            <button type="button" className="skill-card" onClick={() => onOpen(skill)}>
              <span className="level-badge">L{skill.level}</span>
              <span className="skill-card-body">
                <span className="skill-file">{skill.id}/SKILL.md</span>
                <strong>{skill.title}</strong>
                <span className="skill-goal">{skill.goal}</span>
              </span>
              <span className="chevron" aria-hidden>
                →
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
