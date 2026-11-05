// Checks README.md and docs/*.md: every relative link and #anchor resolves, and each docs
// page's "On this page:" list matches its ## and ### headings in order.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'

const files = [
  'README.md',
  ...readdirSync('docs')
    .filter((f) => f.endsWith('.md'))
    .map((f) => join('docs', f))
]
const read = (path) =>
  readFileSync(path, 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/^```[\s\S]*?^```/gm, '')

// Headings with GitHub's anchors: lowercase, punctuation dropped, spaces to hyphens, -1/-2 for repeats.
function headings(markdown) {
  const seen = new Map()
  return [...markdown.matchAll(/^(#{1,6}) (.+)$/gm)].map(([, hashes, text]) => {
    const base = text
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N} _-]/gu, '')
      .replace(/ /g, '-')
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    return { level: hashes.length, anchor: count === 0 ? base : `${base}-${count}` }
  })
}

const anchorsOf = (path) => headings(read(path)).map((h) => h.anchor)
const errors = []

for (const file of files) {
  const markdown = read(file)

  for (const [, target] of markdown.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^(https?:|mailto:)/.test(target)) continue
    const [path, anchor] = target.split('#')
    const resolved = path ? normalize(join(dirname(file), path)) : file
    if (!existsSync(resolved)) errors.push(`${file}: link to missing file ${target}`)
    else if (anchor && resolved.endsWith('.md') && !anchorsOf(resolved).includes(anchor)) {
      errors.push(`${file}: link to missing anchor ${target}`)
    }
  }

  if (!file.startsWith('docs')) continue
  const toc = markdown.match(/^On this page:\n\n((?:\s*- \[.+\]\(#.+\)\n)+)/m)
  if (!toc) {
    errors.push(`${file}: missing an "On this page:" list`)
    continue
  }
  const listed = [...toc[1].matchAll(/\(#([^)]+)\)/g)].map((m) => m[1]).join(', ')
  const sections = headings(markdown)
    .filter((h) => h.level === 2 || h.level === 3)
    .map((h) => h.anchor)
    .join(', ')
  if (listed !== sections) errors.push(`${file}: "On this page:" lists [${listed}] but the headings are [${sections}]`)
}

for (const error of errors) console.error(`::error::${error}`)
if (errors.length > 0) process.exit(1)
console.log(`Checked links and tables of contents in ${files.length} files.`)
