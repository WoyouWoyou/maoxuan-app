export type LabelSession = { id: string; title: string }

export function validSessionLabel(value: string): boolean {
  return Array.from(value).length >= 1 && Array.from(value).length <= 2 && /^[\p{L}\p{N}]+$/u.test(value)
}

// Prefer meaningful title characters over common question words.
export function sessionLabels(sessions: LabelSession[], custom: Record<string, string>): Record<string, string> {
  const labels: Record<string, string> = {}
  const used = new Set<string>()
  const ordered = [...sessions].sort((a, b) => a.id.localeCompare(b.id))
  for (const session of ordered) {
    const label = custom[session.id]
    if (label && validSessionLabel(label) && !used.has(label.toLocaleLowerCase())) {
      labels[session.id] = label
      used.add(label.toLocaleLowerCase())
    }
  }
  const common = new Set(Array.from('我你他她它的了是在有和与要想如何什么为什么怎么办不'))
  for (const session of ordered) {
    if (labels[session.id]) continue
    const chars = [...new Set(Array.from(session.title).filter(validSessionLabel))]
    const titleChars = Array.from(session.title)
    const pairs = titleChars.slice(0, -1).flatMap((char, index) => {
      const pair = char + titleChars[index + 1]
      return validSessionLabel(pair) ? [pair] : []
    })
    const candidates = [
      ...pairs.filter((pair) => Array.from(pair).every((char) => !common.has(char))),
      ...pairs,
      ...chars.filter((c) => !common.has(c)),
      ...chars.filter((c) => common.has(c))
    ]
    let label = candidates.find((c) => !used.has(c.toLocaleLowerCase()))
    // Identical or empty titles can exhaust their characters; keep a unique one-character fallback.
    if (!label) {
      for (const c of '123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
        if (!used.has(c.toLocaleLowerCase())) { label = c; break }
      }
    }
    if (!label) {
      let code = 0x4e00
      while (used.has(String.fromCodePoint(code))) code++
      label = String.fromCodePoint(code)
    }
    labels[session.id] = label
    used.add(label.toLocaleLowerCase())
  }
  return labels
}
