import fs from 'node:fs'
import path from 'node:path'
import { build } from 'esbuild'

const result = await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  outfile: 'dist/index.cjs',
  legalComments: 'none',
  metafile: true
})

// Collect every package that contributed code to the bundle.
const packages = new Set()
for (const input of Object.keys(result.metafile.inputs)) {
  const segments = input.replaceAll('\\', '/').split('/')
  const index = segments.lastIndexOf('node_modules')
  if (index === -1) continue
  const depth = segments[index + 1].startsWith('@') ? 3 : 2
  packages.add(segments.slice(0, index + depth).join('/'))
}

const readPackage = (directory) => {
  const { name, version, license } = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'))
  const files = fs
    .readdirSync(directory)
    .filter((file) => /^(licen[cs]e|copying|notice)(\.|$)/i.test(file))
    .sort()
  const texts = files.map((file) => fs.readFileSync(path.join(directory, file), 'utf8').trim())
  return { id: `${name}@${version}`, license, texts }
}

const entries = [...packages].sort().map(readPackage)

// Some packages declare a license but ship no license file. They point at the
// full text carried by another bundled package with the same declared license.
const notices = entries.map(({ id, license, texts }) => {
  if (texts.length > 0) return [id, ...texts].join('\n\n')
  const source = entries.find((entry) => entry.license === license && entry.texts.length > 0)
  if (!license || !source) {
    throw new Error(`missing license notice for bundled dependency ${id} (${license ?? 'unknown license'})`)
  }
  return `${id}\n\nLicense: ${license}. This package ships no license file; the full ${license} text appears under ${source.id}.`
})

fs.writeFileSync('dist/THIRD_PARTY_NOTICES.txt', notices.join('\n\n---\n\n') + '\n')
console.log(`Wrote dist/THIRD_PARTY_NOTICES.txt for ${notices.length} bundled packages`)