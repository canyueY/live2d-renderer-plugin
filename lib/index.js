/**
 * dsh-murasame-pet — bind the existing MurasamePet Lite app to DSH.
 *
 * The app stays the real PyQt/Live2D renderer; this host half only starts it,
 * exposes a tiny same-origin control route, and edits config.json which the
 * app already polls for display changes.
 */
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

export const name = 'dsh-murasame-pet'
export const inject = []

const PREFIX = '/dsh-murasame-pet'
const HERE = dirname(fileURLToPath(import.meta.url))

function candidates() {
  const out = []
  if (process.env.MURASAMEPET_HOME) out.push(resolve(process.env.MURASAMEPET_HOME))
  if (process.env.MURASAMEPET_EXE) out.push(dirname(resolve(process.env.MURASAMEPET_EXE)))
  out.push(join(homedir(), '.dsh', 'murasame-pet'))
  out.push(join(process.env.LOCALAPPDATA || '', 'MurasamePetLite'))
  // Development convenience: the plugin lives under <workspace>/_dsh_plugins/.
  out.push(resolve(HERE, '..', '..', '..', 'release', 'MurasamePetLite'))
  return out.filter(Boolean)
}

function resolveAppRoot() {
  for (const root of candidates()) {
    if (existsSync(join(root, 'MurasamePetLite.exe'))) return root
  }
  return null
}

function exePath(root) {
  return root ? join(root, 'MurasamePetLite.exe') : ''
}

function configPath(root) {
  return root ? join(root, 'config.json') : ''
}

async function readConfig(root) {
  try {
    return JSON.parse(await readFile(configPath(root), 'utf8'))
  } catch {
    return {}
  }
}

async function writeConfig(root, cfg) {
  await writeFile(configPath(root), JSON.stringify(cfg, null, 2), 'utf8')
}

async function health() {
  try {
    const res = await fetch('http://127.0.0.1:28577/health', { signal: AbortSignal.timeout(1200) })
    return res.ok
  } catch {
    return false
  }
}

async function state() {
  const root = resolveAppRoot()
  const cfg = root ? await readConfig(root) : {}
  const display = cfg.display && typeof cfg.display === 'object' ? cfg.display : {}
  return {
    ok: Boolean(root),
    appRoot: root,
    exe: exePath(root),
    running: await health(),
    visibility: display.visibility_mode || 'both',
    scale: Number(display.ui_scale || 1),
  }
}

async function startPet() {
  const root = resolveAppRoot()
  if (!root) return { ok: false, text: '未找到 MurasamePetLite.exe；请设置 MURASAMEPET_HOME 或把 release/MurasamePetLite 放到 ~/.dsh/murasame-pet' }
  if (await health()) return { ok: true, text: '桌宠已在运行' }
  const child = spawn(exePath(root), ['--no-setup'], {
    cwd: root,
    env: { ...process.env, MURASAME_CONFIG_PATH: configPath(root), MURASAME_LITE_ROOT: root },
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  })
  child.unref()
  return { ok: true, text: '桌宠已启动' }
}

async function stopPet() {
  if (process.platform === 'win32') {
    await new Promise((resolvePromise) => {
      const p = spawn('taskkill', ['/IM', 'MurasamePetLite.exe', '/F'], { stdio: 'ignore', windowsHide: true })
      p.on('close', resolvePromise)
      p.on('error', resolvePromise)
    })
  }
  return { ok: true, text: '桌宠已停止' }
}

async function setDisplay(patch) {
  const root = resolveAppRoot()
  if (!root) return { ok: false, text: '未找到桌宠目录' }
  const cfg = await readConfig(root)
  const display = cfg.display && typeof cfg.display === 'object' ? cfg.display : {}
  if (patch.visibility && ['both', 'text', 'character', 'none'].includes(patch.visibility)) {
    display.visibility_mode = patch.visibility
  }
  if (patch.scale != null) {
    const n = Number(patch.scale)
    if (Number.isFinite(n)) display.ui_scale = Math.max(0.7, Math.min(1.6, n))
  }
  cfg.display = display
  await writeConfig(root, cfg)
  return { ok: true, text: `显示已更新：${display.visibility_mode || 'both'} / ${display.ui_scale || 1}` }
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

async function readBody(req, limit = 8192) {
  let body = ''
  for await (const chunk of req) {
    body += chunk.toString('utf8')
    if (body.length > limit) throw new Error('body too large')
  }
  return body
}

function toolSpec(defineTool, toolName, description, properties, fn) {
  return defineTool({
    name: toolName,
    description,
    parameters: properties,
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          text: { type: 'string', required: true },
        },
      },
      render(_args, value) {
        return [{ type: 'text', text: value?.ok ? `OK ${value.text || ''}` : `FAIL ${value?.text || ''}` }]
      },
    },
    async execute(args) {
      return fn(args || {})
    },
  })
}

export async function apply(ctx) {
  // Same-origin control route used by the client panel and by tools.
  ctx.effect(() => {
    if (!ctx.webServer) return
    return ctx.webServer.register({
      kind: 'prefix',
      path: PREFIX,
      handler: async (req, res) => {
        const pathname = (req.url || '').split('?')[0]
        if (pathname === `${PREFIX}/state` && req.method === 'GET') {
          sendJson(res, 200, await state())
          return
        }
        if (pathname === `${PREFIX}/control` && req.method === 'POST') {
          try {
            const body = JSON.parse(await readBody(req) || '{}')
            let out
            if (body.action === 'start') out = await startPet()
            else if (body.action === 'stop') out = await stopPet()
            else out = await setDisplay(body)
            sendJson(res, out.ok ? 200 : 400, { ...out, state: await state() })
          } catch (err) {
            sendJson(res, 400, { ok: false, text: String(err?.message || err) })
          }
          return
        }
        sendJson(res, 404, { ok: false, text: 'not found' })
      },
    })
  }, 'dsh-murasame-pet: control route')

  // Start on DSH boot when explicitly enabled; default off so installing the
  // plugin does not unexpectedly open a desktop window.
  if (String(process.env.MURASAMEPET_AUTOSTART || '1').toLowerCase() !== '0') {
    setTimeout(() => { void startPet() }, 1200).unref?.()
  }

  try {
    const mod = await import('@deepseek-ai/dsh-tools')
    if (typeof mod.defineTool !== 'function' || !ctx.tools) return
    const tools = [
      toolSpec(mod.defineTool, 'pet_start', '启动 MurasamePet Lite 桌宠。', {}, startPet),
      toolSpec(mod.defineTool, 'pet_stop', '停止 MurasamePet Lite 桌宠。', {}, stopPet),
      toolSpec(mod.defineTool, 'pet_status', '查看桌宠运行状态和当前显示模式。', {}, async () => {
        const s = await state()
        return { ok: true, text: `running=${s.running} visibility=${s.visibility} scale=${s.scale} app=${s.appRoot || 'missing'}` }
      }),
      toolSpec(mod.defineTool, 'pet_set_visibility', '切换桌宠显示模式。', {
        mode: { type: 'string', required: true, enum: ['both', 'text', 'character', 'none'], description: 'both=人物+文字；text=仅文字；character=仅人物；none=全部隐藏' },
      }, (args) => setDisplay({ visibility: args.mode })),
      toolSpec(mod.defineTool, 'pet_set_scale', '设置文字框/气泡相对人物的 UI 比例。', {
        scale: { type: 'number', required: true, description: '0.7 - 1.6，默认 1.0' },
      }, (args) => setDisplay({ scale: args.scale })),
    ]
    ctx.effect(() => {
      const disposers = tools.map((tool) => ctx.tools.register(tool))
      return () => disposers.forEach((d) => d?.())
    }, 'dsh-murasame-pet: tools')
  } catch {
    /* tools service unavailable; client panel still works */
  }
}
