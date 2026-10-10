const files = import.meta.glob<string>('./scenes/*.svg', { eager: true, query: '?url', import: 'default' })

const ORDER = ['florist', 'barista', 'farmer', 'cashier', 'bookshop', 'waiter']
const SCENES = ORDER.map((name) => files[`./scenes/${name}.svg`]).filter(Boolean)

// Wall of church-fresco style episodes where the bot does the job for you.
export function Frescoes() {
  return (
    <div className="frescoes" aria-hidden>
      {SCENES.map((src, i) => (
        <img key={src} src={src} alt="" className={`fresco fresco-${i + 1}`} />
      ))}
    </div>
  )
}
