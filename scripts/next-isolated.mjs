import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { basename, join, relative, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { parse } from 'dotenv'

const [command, ...args] = process.argv.slice(2)
if (!['build', 'dev'].includes(command)) {
  throw new Error('Use the isolated Next runner with the build or dev command.')
}

const projectRoot = process.cwd()
const workspaceParent = mkdtempSync(join(tmpdir(), 'smart-lib-validation-'))
const workspaceRoot = join(workspaceParent, 'workspace')
const excludedDirectories = new Set([
  '.git',
  '.next',
  '.next-validation',
  '.next-validation-build',
  '.next-validation-dev',
  '.tsupgrader',
  'coverage',
  'node_modules',
  'playwright-report',
  'test-results',
])

const fileEnvironment = {}
for (const filename of ['.env', '.env.local']) {
  const envPath = resolve(projectRoot, filename)
  if (!existsSync(envPath)) continue
  Object.assign(fileEnvironment, parse(readFileSync(envPath)))
}

cpSync(projectRoot, workspaceRoot, {
  recursive: true,
  filter(source) {
    const relativePath = relative(projectRoot, source)
    if (!relativePath) return true
    const firstSegment = relativePath.split(sep)[0]
    if (excludedDirectories.has(firstSegment)) return false
    return !basename(source).startsWith('.env')
  },
})
symlinkSync(resolve(projectRoot, 'node_modules'), resolve(workspaceRoot, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')

const nextCli = resolve(projectRoot, 'node_modules/next/dist/bin/next')
const distDir = command === 'build' ? '.next-validation-build' : '.next-validation-dev'
const nodeArgs = command === 'build'
  ? ['--max-old-space-size=4096', nextCli, command, ...args]
  : [nextCli, command, ...args]
const childEnvironment = {
  ...fileEnvironment,
  ...process.env,
  NEXT_DIST_DIR: process.env.NEXT_DIST_DIR || distDir,
}
const child = spawn(process.execPath, nodeArgs, {
  cwd: workspaceRoot,
  env: childEnvironment,
  stdio: 'inherit',
})

let cleaned = false
function cleanWorkspace() {
  if (cleaned) return
  cleaned = true
  rmSync(workspaceParent, { recursive: true, force: true })
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}

child.on('error', (error) => {
  console.error('Unable to start the isolated Next.js process:', error)
  cleanWorkspace()
  process.exitCode = 1
})

child.on('exit', (code, signal) => {
  cleanWorkspace()
  process.exitCode = code ?? (signal ? 1 : 0)
})
