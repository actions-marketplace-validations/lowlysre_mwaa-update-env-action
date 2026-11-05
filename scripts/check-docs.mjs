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
const errors = []
const read = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

// GitHub's heading anchor: lowercase, punctuation dropped, spaces to hyphens, -1/-2 for repeats.
function anchors(markdown) {
  const seen = new Map()
  return headings(markdown).map(({ text }) => {
    const base = text
      .toLowerCase()
      .replace(/`/g, '')
      .replace(/[^\p{L}\p{N} _-]/gu, '')
      .replace(/ /g, '-')
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    return count === 0 ? base : `${base}-${count}`
  })
}

function withoutCode(markdown) {
  return markdown.replace(/^```[\s\S]*?^```/gm, '')
}

function headings(markdown) {
  return [...withoutCode(markdown).matchAll(/^(#{1,6}) (.+)$/gm)].map((m) => ({
    level: m[1].length,
    text: m[2].trim()
  }))
}

for (const file of files) {
  const markdown = read(file)
  const ownAnchors = anchors(markdown)

  for (const [, target] of withoutCode(markdown).matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^(https?:|mailto:)/.test(target)) continue
    const [path, anchor] = target.split('#')
    const resolved = path ? normalize(join(dirname(file), path)) : file
    if (!existsSync(resolved)) {
      errors.push(`${file}: link to missing file ${target}`)
      continue
    }
    if (anchor && resolved.endsWith('.md')) {
      const targetAnchors = resolved === file ? ownAnchors : anchors(read(resolved))
      if (!targetAnchors.includes(anchor)) errors.push(`${file}: link to missing anchor ${target}`)
    }
  }

  if (!file.startsWith('docs')) continue
  const toc = markdown.match(/^On this page:\n\n((?:\s*- \[.+\]\(#.+\)\n)+)/m)
  if (!toc) {
    errors.push(`${file}: missing an "On this page:" list`)
    continue
  }
  const listed = [...toc[1].matchAll(/\(#([^)]+)\)/g)].map((m) => m[1])
  const sections = anchors(markdown).filter((_, i) => [2, 3].includes(headings(markdown)[i].level))
  if (listed.join(',') !== sections.join(',')) {
    errors.push(`${file}: "On this page:" lists [${listed.join(', ')}] but the headings are [${sections.join(', ')}]`)
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(`::error::${error}`)
  process.exit(1)
}
console.log(`Checked links and tables of contents in ${files.length} files.`)
