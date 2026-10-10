import { useEffect, useState } from 'react'
import { HalEye } from './HalEye'

interface LoadingScreenProps {
  job: string
  onCancel?: () => void
}

const STEPS = [
  { label: 'Researcher Agent analyzing competencies & safety standards', duration: 1800 },
  { label: 'Synthesizing progressive game scenarios & clear objectives', duration: 2200 },
  { label: 'Builder Agent constructing interactive stations & Entire checkpoint', duration: 2000 },
  { label: 'Finalizing playable environment & controls…', duration: 1000 },
]

export function LoadingScreen({ job }: LoadingScreenProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [progress, setProgress] = useState(15)

  useEffect(() => {
    const stepInterval = setInterval(() => {
      setCurrentStep((prev) => (prev < STEPS.length - 1 ? prev + 1 : prev))
    }, 2200)

    const progressInterval = setInterval(() => {
      setProgress((prev) => (prev < 92 ? prev + Math.floor(Math.random() * 8) + 3 : prev))
    }, 350)

    return () => {
      clearInterval(stepInterval)
      clearInterval(progressInterval)
    }
  }, [])

  return (
    <section className="loading-card">
      <div className="loading-hal">
        <HalEye reach={18} />
      </div>

      <div className="loading-header">
        <span className="loading-tag">Synthesizing Simulation</span>
        <h2>Designing Environment for <em>{job}</em></h2>
        <p className="loading-sub">
          The Researcher Agent is consulting domain standards, and the Builder Agent is creating the Entire branch and playable world.
        </p>
      </div>

      <div className="loading-progress-wrap">
        <div className="loading-progress-bar" style={{ width: `${Math.min(100, progress)}%` }} />
      </div>

      <div className="loading-steps">
        {STEPS.map((step, idx) => {
          const isDone = idx < currentStep
          const isCurrent = idx === currentStep
          return (
            <div
              key={step.label}
              className={`loading-step ${isDone ? 'done' : isCurrent ? 'current' : 'pending'}`}
            >
              <div className="step-bullet">
                {isDone ? '✓' : isCurrent ? '▶' : '○'}
              </div>
              <div className="step-text">
                <strong>Phase {idx + 1}:</strong> {step.label}
              </div>
            </div>
          )
        })}
      </div>

      <div className="loading-telemetry">
        <span className="pulsing-dot" />
        <span>Entire Git Checkpoint: <code>env/{job.toLowerCase().replace(/[^a-z0-9]+/g, '-')}</code></span>
      </div>
    </section>
  )
}
