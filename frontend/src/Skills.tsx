import { DEMO_SKILLS, type Skill } from './skillData'

interface SkillsProps {
  skills?: Skill[]
  job?: string
  onBack: () => void
  onOpen: (skill: Skill) => void
}

export function Skills({ skills, job, onBack, onOpen }: SkillsProps) {
  const displaySkills = skills && skills.length > 0 ? skills : DEMO_SKILLS

  return (
    <section className="skills">
      <div className="game-top">
        <button type="button" className="back" onClick={onBack}>
          ← Back to game
        </button>
      </div>

      <div className="skills-head">
        <h2>Skills learned {job ? `for ${job}` : ''}</h2>
        <span className="skill-count-badge">{displaySkills.length} mastered</span>
      </div>

      <ul className="skill-list">
        {displaySkills.map((skill) => (
          <li key={skill.id}>
            <button type="button" className="skill-card" onClick={() => onOpen(skill)}>
              <span className="level-badge">L{skill.level}</span>
              <span className="skill-card-body">
                <span className="skill-file">{skill.id}/SKILL.md</span>
                <strong>{skill.title}</strong>
                <span className="skill-goal">
                  {skill.clears ? `Learned from ${skill.clears} clears of level ${skill.level}` : `Learned from level ${skill.level}`}
                </span>
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
