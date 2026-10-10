export type Skill = {
  id: string
  level: number
  clears: number
  title: string
  description: string
  goal: string
  steps: string[]
  checks: string[]
  actions: string[]
}

// Demo skill pack for the Snake stand-in game. Real packs come from the actor's training runs.
export const DEMO_SKILLS: Skill[] = [
  {
    id: 'first-bite',
    level: 1,
    clears: 14,
    title: 'Heads straight for food',
    description: 'Closes the larger gap to the food first, then turns onto its row or column, without ever reversing into its own body.',
    goal: 'Score 1 point',
    steps: [
      'Read where the food is relative to the head.',
      'Move along the axis with the larger gap first.',
      'Turn onto the food’s row or column once aligned.',
      'Never reverse straight into your own body.',
    ],
    checks: ['Score reaches 1', 'No wall or self collision'],
    actions: ['up', 'down', 'left', 'right'],
  },
  {
    id: 'wall-awareness',
    level: 2,
    clears: 22,
    title: 'Keeps a margin from the walls',
    description: 'Turns a cell early near edges and slides along walls to reach food there, instead of driving into them.',
    goal: 'Score 5 points',
    steps: [
      'Check the cell ahead before every tick.',
      'Turn early when one cell from a wall.',
      'Turn towards the side with more open space.',
      'Approach food near an edge along the wall, not into it.',
    ],
    checks: ['Score reaches 5', 'Zero wall collisions'],
    actions: ['up', 'down', 'left', 'right'],
  },
  {
    id: 'no-traps',
    level: 3,
    clears: 31,
    title: 'Avoids boxing itself in',
    description: 'Counts the open space a move leaves before taking it, and follows its tail when no move is clearly safe.',
    goal: 'Reach length 12',
    steps: [
      'Before turning, count the open cells reachable from the new head.',
      'Reject moves that leave fewer open cells than the snake’s length.',
      'Prefer moves that keep the tail reachable.',
      'When unsure, follow the tail until space opens up.',
    ],
    checks: ['Length reaches 12', 'No self collision'],
    actions: ['up', 'down', 'left', 'right'],
  },
  {
    id: 'short-routes',
    level: 4,
    clears: 18,
    title: 'Takes the shortest safe route',
    description: 'Plans the shortest path to food around its body, but only takes it if an escape route remains after eating.',
    goal: 'Score 10 points in under 60 seconds',
    steps: [
      'Plan the shortest path from head to food around the body.',
      'Check the path still leaves an escape route after eating.',
      'If it does not, take the next shortest path that does.',
      'Re-plan whenever the food moves.',
    ],
    checks: ['Score 10 within 60 seconds', 'No collision'],
    actions: ['up', 'down', 'left', 'right'],
  },
  {
    id: 'long-snake',
    level: 5,
    clears: 9,
    title: 'Sweeps the board when long',
    description: 'Once the body fills most of the board, switches to a fixed zig-zag sweep and trades speed for never getting trapped.',
    goal: 'Score 25 points',
    steps: [
      'Switch to a fixed zig-zag sweep of the board.',
      'Only shortcut the sweep when the body is far behind.',
      'Keep the tail inside the sweep order.',
      'Accept slower food pickup in exchange for never getting trapped.',
    ],
    checks: ['Score reaches 25', 'No collision'],
    actions: ['up', 'down', 'left', 'right'],
  },
]

export function toMarkdown(skill: Skill, job: string): string {
  return `---
name: ${skill.id}
description: ${skill.description}
---

# ${skill.title}

Learned by clearing level ${skill.level} of the ${job} practice game (Snake demo stand-in) ${skill.clears} times. Level goal: ${skill.goal}.

## Learned procedure

${skill.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

## Success checks

${skill.checks.map((c) => `- ${c}`).join('\n')}

## Game actions

${skill.actions.join(', ')}

## Transfer

Demo skill, not produced by a real training run. Map each game action to a real tool and validate on new scenarios before use.
`
}
