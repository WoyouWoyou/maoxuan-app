/** Cues are measured from the actual pre-rendered narration sections. */
export function activeStorySection(starts: readonly number[], position: number): number {
  let section = 0
  for (let i = 1; i < starts.length; i++) {
    if (position < starts[i]) break
    section = i
  }
  return section
}
export const storyTime = (seconds: number) => {
  const value = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  return `${Math.floor(value / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(value % 60)
    .toString()
    .padStart(2, '0')}`
}
