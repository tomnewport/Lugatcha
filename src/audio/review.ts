/**
 * Candidate audio review (owner tool). Loads the candidates manifest written by
 * scripts/generate_audio.py --candidates, and builds the end-of-session export:
 * a downloadable reviews.json plus a prefilled GitHub issue an agent acts on.
 */
import type { Verdict } from '@/db/types'

const base = import.meta.env.BASE_URL
const REPO = 'tomnewport/Lugatcha'
// GitHub truncates issue bodies passed via URL around 8 KB; stay under it.
const MAX_ISSUE_BODY = 7500

export interface CandidateVariant {
  id: string
  file: string
}

export interface CandidateEntry {
  text: string
  variants: CandidateVariant[]
}

/** key -> { text, variants } */
export type CandidatesManifest = Record<string, CandidateEntry>

export interface ReviewRecord {
  key: string
  text: string
  verdicts: Record<string, Verdict>
}

export function getCandidatesManifest(): Promise<CandidatesManifest | null> {
  return fetch(`${base}audio/candidates/manifest.json`)
    .then((res) => (res.ok ? (res.json() as Promise<CandidatesManifest>) : null))
    .catch(() => null)
}

export function candidateUrl(file: string): string {
  return `${base}audio/candidates/${file}`
}

/** Words that were rated but where no candidate was marked good. */
export function problemWords(records: ReviewRecord[]): ReviewRecord[] {
  return records.filter(
    (r) => Object.keys(r.verdicts).length > 0 && !Object.values(r.verdicts).includes('good'),
  )
}

export function buildReviewsJson(records: ReviewRecord[], pretty = true): string {
  return JSON.stringify(
    { generatedAt: new Date().toISOString(), repo: REPO, reviews: records },
    null,
    pretty ? 2 : undefined,
  )
}

function summary(records: ReviewRecord[]): string {
  const verdicts = records.flatMap((r) => Object.values(r.verdicts))
  const good = verdicts.filter((v) => v === 'good').length
  const bad = verdicts.filter((v) => v === 'bad').length
  const problems = problemWords(records)
  const lines = [
    '## Audio candidate review',
    '',
    `- Words reviewed: **${records.length}**`,
    `- Candidates rated good / bad: **${good}** / **${bad}**`,
    `- Words with no good candidate: **${problems.length}**`,
    '',
    '### For the agent',
    'For each word, promote a `good` candidate `public/audio/candidates/<key>-<profile>.mp3` ' +
      'to the canonical `public/audio/<key>.mp3`, drop the rejected variants, and regenerate ' +
      'the words with no good candidate. Then delete `public/audio/candidates/`.',
    '',
  ]
  if (problems.length) {
    lines.push('<details><summary>Words with no good candidate</summary>', '')
    for (const p of problems) lines.push(`- \`${p.key}\` — ${p.text}`)
    lines.push('')
  }
  return lines.join('\n')
}

/**
 * Prefilled GitHub "new issue" URL. Embeds the full reviews JSON when it fits
 * under the URL budget, otherwise just the actionable subset with a note to
 * attach the downloaded reviews.json.
 */
export function buildIssueUrl(records: ReviewRecord[]): string {
  const head = summary(records)
  const fenced = (json: string) =>
    `\n<details><summary>reviews.json</summary>\n\n\`\`\`json\n${json}\n\`\`\`\n</details>\n`

  // Compact JSON (not pretty-printed) so the full dump fits the URL for a
  // typical batch; only fall back to the actionable subset when it still won't.
  let body = head + fenced(buildReviewsJson(records, false))
  if (encodeURIComponent(body).length > MAX_ISSUE_BODY) {
    const subset = buildReviewsJson(problemWords(records), false)
    body =
      head +
      '\n> Full dump too large for the URL — drag the downloaded `reviews.json` into this issue.\n' +
      '\n**Words needing action (no good candidate):**' +
      fenced(subset)
  }
  if (encodeURIComponent(body).length > MAX_ISSUE_BODY) {
    body = head + '\n> Drag the downloaded `reviews.json` into this issue for the full data.\n'
  }

  const title = `Audio review — ${new Date().toISOString().slice(0, 10)}`
  return (
    `https://github.com/${REPO}/issues/new` +
    `?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`
  )
}
