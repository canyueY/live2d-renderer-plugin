/**
 * dsh-murasame-pet — DSH body component.
 *
 * Two layers:
 *  - pet_*  : legacy MurasamePet Lite window (start/stop/visibility/scale)
 *  - body_* : full project body (pet.py) over 127.0.0.1:28566, or the published fallback port
 *
 * The pet chat input is bridged back into a DSH Agent session (`/chat` route):
 * DSH is the brain; Murasame only renders and speaks.
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'

export const name = 'dsh-murasame-pet'
export const inject = ['tools', 'webServer', 'sessionController']

const PREFIX = '/dsh-murasame-pet'
const HERE = dirname(fileURLToPath(import.meta.url))
const BODY_BASE = process.env.MURASAME_BODY_URL || 'http://127.0.0.1:28566'

let ctxWebServerOrigin = ''
let hostCtx = null
let bodyChildPid = 0
let bodySessionId = ''
let bodyChatBusy = false

// ---------------------------------------------------------------------------
// Legacy Lite pet
// ---------------------------------------------------------------------------

function candidates() {
  const out = []
  if (process.env.MURASAMEPET_HOME) out.push(resolve(process.env.MURASAMEPET_HOME))
  if (process.env.MURASAMEPET_EXE) out.push(dirname(resolve(process.env.MURASAMEPET_EXE)))
  out.push(join(homedir(), '.dsh', 'murasame-pet'))
  out.push(join(process.env.LOCALAPPDATA || '', 'MurasamePetLite'))
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

// ---------------------------------------------------------------------------
// Full body
// ---------------------------------------------------------------------------

async function bodyBaseUrl() {
  const root = resolveProjectRoot()
  if (root) {
    try {
      const info = JSON.parse(await readFile(join(root, 'data', 'body_surface.json'), 'utf8'))
      const url = String(info?.url || '').trim()
      if (/^http:\/\/127\.0\.0\.1:\d+$/.test(url)) return url
      const port = Number(info?.port || 0)
      if (Number.isInteger(port) && port > 0) return `http://127.0.0.1:${port}`
    } catch {
      /* fall back to the legacy fixed port */
    }
  }
  return BODY_BASE
}

async function bodyHealth() {
  try {
    const base = await bodyBaseUrl()
    const res = await fetch(`${base}/body/health`, { signal: AbortSignal.timeout(1200) })
    return res.ok
  } catch {
    return false
  }
}

async function bodyJson(path, options = {}) {
  const base = await bodyBaseUrl()
  const res = await fetch(`${base}${path}`, {
    ...options,
    signal: AbortSignal.timeout(options.timeout || 5000),
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  })
  const data = await res.json().catch(() => ({}))
  return { res, data }
}

function resolveProjectRoot() {
  const candidates = [
    process.env.MURASAMEPET_PROJECT,
    process.env.MURASAME_ROOT,
    process.env.MURASAMEPET_HOME,
    process.cwd(),
    resolve(HERE, '..', '..', '..'),
  ].filter(Boolean)
  for (const root of candidates) {
    if (existsSync(join(root, 'pet.py')) && existsSync(join(root, '.venv', 'Scripts', 'pythonw.exe'))) {
      return resolve(root)
    }
  }
  return null
}

async function startFullBody() {
  if (await bodyHealth()) return { ok: true, text: '完整身体已在运行' }
  const root = resolveProjectRoot()
  if (!root) return { ok: false, text: '未找到完整工程（pet.py + .venv）；请设置 MURASAMEPET_PROJECT' }
  const py = join(root, '.venv', 'Scripts', 'pythonw.exe')
  const child = spawn(py, [join(root, 'pet.py')], {
    cwd: root,
    // Do not force MURASAME_BODY_PORT here: pet.py's default-port fallback is
    // disabled when that env var is explicit, and 28566 is commonly occupied
    // by the OpenAI-compatible bridge.
    env: { ...process.env },
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  })
  child.unref()
  bodyChildPid = child.pid || 0
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 300))
    if (await bodyHealth()) return { ok: true, text: `完整身体已启动（pid=${bodyChildPid}）` }
  }
  return { ok: false, text: '完整身体启动超时：查看 log/pet 日志' }
}

async function stopFullBody() {
  if (bodyChildPid) {
    await new Promise((resolvePromise) => {
      const p = spawn('taskkill', ['/PID', String(bodyChildPid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
      p.on('close', resolvePromise)
      p.on('error', resolvePromise)
    })
    bodyChildPid = 0
    return { ok: true, text: '完整身体已停止（本插件启动的进程）' }
  }
  if (await bodyHealth()) return { ok: false, text: '身体在运行，但不是本插件启动的；请从启动器或任务管理器关闭' }
  return { ok: true, text: '完整身体未运行' }
}

async function bodyStatus() {
  if (!(await bodyHealth())) return { ok: false, text: 'body 控制面离线' }
  try {
    const { res, data } = await bodyJson('/body/status')
    if (!res.ok) return { ok: false, text: `status HTTP ${res.status}` }
    const v = data.video || {}
    const video = v.error ? `video=error(${v.error})` : `video=${v.active ? 'active' : 'idle'}${v.platform ? '/' + v.platform : ''}${v.title ? ' ' + v.title : ''}`
    return { ok: true, text: `name=${data.name} character=${data.character} model=${data.model || '-'} visibility=${data.visibility} scale=${data.ui_scale} tts=${data.tts} ${video}` }
  } catch (err) {
    return { ok: false, text: String(err?.message || err) }
  }
}

async function bodySay(args) {
  const text = String(args.text || '').trim()
  if (!text) return { ok: false, text: 'text 不能为空' }
  if (!(await bodyHealth())) return { ok: false, text: 'body 控制面离线；先 body_start' }
  try {
    const { res, data } = await bodyJson('/body/say', {
      method: 'POST',
      body: JSON.stringify({
        text,
        emotion: String(args.emotion || ''),
        speak: args.speak !== false,
      }),
    })
    if (!res.ok || data.ok === false) return { ok: false, text: data.error || `say HTTP ${res.status}` }
    return { ok: true, text: `已交给身体：${text.slice(0, 60)}${text.length > 60 ? '…' : ''}` }
  } catch (err) {
    return { ok: false, text: String(err?.message || err) }
  }
}

async function bodyEmote(args) {
  const emotion = String(args.emotion || '').trim()
  if (!emotion) return { ok: false, text: 'emotion 不能为空' }
  if (!(await bodyHealth())) return { ok: false, text: 'body 控制面离线' }
  try {
    const { res, data } = await bodyJson('/body/emote', { method: 'POST', body: JSON.stringify({ emotion }) })
    if (!res.ok || data.ok === false) return { ok: false, text: data.error || `emote HTTP ${res.status}` }
    return { ok: true, text: `表情=${emotion}` }
  } catch (err) {
    return { ok: false, text: String(err?.message || err) }
  }
}

async function bodyVideo() {
  if (!(await bodyHealth())) return { ok: false, text: 'body 控制面离线' }
  try {
    const { res, data } = await bodyJson('/body/status')
    if (!res.ok) return { ok: false, text: `status HTTP ${res.status}` }
    const v = data.video || {}
    if (v.error) return { ok: false, text: `video error: ${v.error}` }
    return {
      ok: true,
      text: `enabled=${v.enabled} active=${v.active} platform=${v.platform || '-'} video_id=${v.video_id || '-'} attention=${v.attention || '-'} watch_sec=${v.watch_sec || 0} title=${v.title || '-'}`,
    }
  } catch (err) {
    return { ok: false, text: String(err?.message || err) }
  }
}

async function bodyMusic() {
  if (!(await bodyHealth())) return { ok: false, text: 'body 控制面离线' }
  try {
    const { res, data } = await bodyJson('/body/music')
    if (!res.ok) return { ok: false, text: `music HTTP ${res.status}` }
    if (data.ok === false) return { ok: false, text: data.error || 'music unavailable' }
    const cur = data.current_song || {}
    return {
      ok: true,
      text: `enabled=${data.enabled} backend=${data.backend || '-'} logged_in=${data.logged_in} desktop=${data.desktop_client_found} cdp=${data.desktop_cdp_available} song=${cur.name || cur.title || '-'} artist=${cur.artist || '-'}`,
    }
  } catch (err) {
    return { ok: false, text: String(err?.message || err) }
  }
}

async function bodyWeather(args) {
  const city = String(args.city || '').trim()
  if (!(await bodyHealth())) return { ok: false, text: 'body 控制面离线' }
  try {
    const { res, data } = await bodyJson(`/body/weather?city=${encodeURIComponent(city)}`, { timeout: 25000 })
    if (!res.ok) return { ok: false, text: `weather HTTP ${res.status}` }
    if (data.ok === false) return { ok: false, text: data.error || 'weather unavailable' }
    return { ok: true, text: data.text || `${data.city} 天气已获取` }
  } catch (err) {
    return { ok: false, text: String(err?.message || err) }
  }
}

async function bodyMemory(args) {
  const query = String(args.query || '').trim()
  if (!(await bodyHealth())) return { ok: false, text: 'body 控制面离线' }
  try {
    const limit = Number.isFinite(Number(args.limit)) ? Math.max(1, Math.min(20, Number(args.limit))) : 5
    const { res, data } = await bodyJson(`/body/memory?q=${encodeURIComponent(query)}&limit=${limit}`, { timeout: 25000 })
    if (!res.ok) return { ok: false, text: `memory HTTP ${res.status}` }
    if (data.ok === false) return { ok: false, text: data.error || 'memory unavailable' }
    if (data.mode === 'health') {
      const h = data.health || {}
      return { ok: true, text: `bank=${h.service || 'cognitive-memory'} memories=${h.memories ?? '-'} observations=${h.observations ?? '-'} all_green=${h.all_green}` }
    }
    return { ok: true, text: `status=${data.status} count=${data.count} brief=${(data.brief || '').slice(0, 500)}` }
  } catch (err) {
    return { ok: false, text: String(err?.message || err) }
  }
}

async function bodyScreen() {
  if (!(await bodyHealth())) return { ok: false, text: 'body 控制面离线；先 body_start' }
  try {
    const { res, data } = await bodyJson('/body/screen', { timeout: 15000 })
    if (!res.ok) return { ok: false, text: `screen HTTP ${res.status}` }
    if (data.ok === false) return { ok: false, text: data.error || 'screen unavailable' }
    const meta = [
      `path=${data.path}`,
      `size=${data.width}x${data.height}`,
      `bytes=${data.bytes || 0}`,
      `screen=${data.screen || '-'}`,
      `foreground=${data.foreground || '-'}`,
    ].join(' ')
    return { ok: true, text: `${meta} | 用 read_image 打开 path 即可看到画面（截图只在本地，不会上传）` }
  } catch (err) {
    return { ok: false, text: String(err?.message || err) }
  }
}

// ---------------------------------------------------------------------------
// Pet input -> DSH Agent session
// ---------------------------------------------------------------------------

function bridgeFilePath() {
  const root = resolveProjectRoot() || process.cwd()
  return join(root, 'data', 'dsh_body_bridge.json')
}

async function writeBridgeInfo() {
  try {
    const root = resolveProjectRoot()
    if (!root) return
    const info = {
      chat_url: `${ctxWebServerOrigin || 'http://127.0.0.1:56106'}${PREFIX}/chat`,
      session_id: bodySessionId,
      workspace: await resolvePetWorkspace(root),
      updated_at: Date.now(),
    }
    await writeFile(join(root, 'data', 'dsh_body_bridge.json'), JSON.stringify(info, null, 2), 'utf8')
  } catch {
    /* best effort */
  }
}

async function resolvePetWorkspace(root) {
  const forced = String(process.env.MURASAME_PET_WORKSPACE || '').trim()
  if (forced) return resolve(forced)
  // Prefer the user-created DSH workspace titled "Desktop"; it is a real
  // workspace registration, not a path guessed from the current process.
  const candidates = [
    join(homedir(), '.dsh', 'storages', 'workspace.json'),
    join(root, '.dsh', 'storages', 'workspace.json'),
  ]
  for (const file of candidates) {
    try {
      const data = JSON.parse(await readFile(file, 'utf8'))
      const workspaces = data?.tables?.workspaces || {}
      for (const item of Object.values(workspaces)) {
        const title = String(item?.title || '').trim()
        const path = String(item?.path || '').trim()
        if (!path) continue
        if (title.toLowerCase() === 'desktop' || basename(path).toLowerCase() === 'desktop') {
          return resolve(path)
        }
      }
    } catch {
      /* try the next registry */
    }
  }
  return join(root, 'data', 'dsh_pet_workspace')
}

async function ensureBodySession() {
  if (bodySessionId) return bodySessionId
  const root = resolveProjectRoot()
  if (!root) throw new Error('未找到完整工程根；设置 MURASAMEPET_PROJECT')
  const workspace = await resolvePetWorkspace(root)
  await mkdir(workspace, { recursive: true })
  const sessionFile = join(root, 'data', 'dsh_pet_session.json')
  try {
    const saved = JSON.parse(await readFile(sessionFile, 'utf8'))
    if (
      saved?.sessionId &&
      typeof saved.sessionId === 'string' &&
      resolve(String(saved.workspace || '')) === resolve(workspace)
    ) {
      bodySessionId = saved.sessionId
      await selectPetModel(bodySessionId)
      await writeBridgeInfo()
      return bodySessionId
    }
  } catch {
    /* no matching persisted pet session */
  }
  const created = await hostCtx.sessionController.create({ cwd: workspace })
  bodySessionId = created.sessionId
  await writeFile(sessionFile, JSON.stringify({ sessionId: bodySessionId, workspace }, null, 2), 'utf8')
  await selectPetModel(bodySessionId)
  await writeBridgeInfo()
  return bodySessionId
}

async function selectPetModel(sessionId) {
  // A pet conversation is independent from the current DSH workspace. Prefer
  // the deployment's V4.1-Flash route, but never let model discovery block chat.
  try {
    const llm = typeof hostCtx?.get === 'function' ? hostCtx.get('llm') : null
    if (!llm) return
    const overrideProvider = String(process.env.MURASAME_PET_MODEL_PROVIDER || '').trim()
    const overrideModel = String(process.env.MURASAME_PET_MODEL || '').trim()
    if (overrideProvider && overrideModel) {
      await hostCtx.sessionController.selectModel({
        sessionId,
        provider: overrideProvider,
        model: overrideModel,
      })
      await recordPetModel(overrideProvider, overrideModel)
      return
    }
    const providers = await llm.listProviders()
    for (const provider of providers || []) {
      const providerId = String(provider.id || '')
      if (!providerId) continue
      let models = []
      try {
        models = await llm.listModels(providerId)
      } catch {
        continue
      }
      const hit = (models || []).find((model) =>
        /v4[.\- ]?1.*flash|flash.*v4[.\- ]?1/i.test(`${model.id || ''} ${model.name || ''}`),
      )
      if (hit?.id) {
        await hostCtx.sessionController.selectModel({
          sessionId,
          provider: providerId,
          model: hit.id,
        })
        await recordPetModel(providerId, hit.id)
        return
      }
    }
  } catch {
    /* keep the session's existing default model */
  }
}

async function recordPetModel(provider, model) {
  try {
    const root = resolveProjectRoot()
    if (!root) return
    await writeFile(
      join(root, 'data', 'dsh_pet_model.json'),
      JSON.stringify({ provider, model, updated_at: Date.now() }, null, 2),
      'utf8',
    )
  } catch {
    /* diagnostic only */
  }
}

function assistantTextFromEvents(events, afterSeq) {
  let best = null
  for (const e of events || []) {
    if (Number(e.seq || 0) <= afterSeq) continue
    if (e.type !== 'assistant/message') continue
    const message = e.data?.message || e.data
    const blocks = Array.isArray(message?.content) ? message.content : []
    const text = blocks.filter((b) => b?.type === 'text' && b.text).map((b) => b.text).join('')
    if (text.trim()) best = text.trim()
  }
  return best
}

const TOOL_LABELS = {
  body_memory: '查询长期记忆',
  body_weather: '查天气',
  body_music: '查音乐状态',
  body_video: '看 B 站视频',
  body_screen: '看主人的屏幕',
  memory_search: '检索记忆',
  memory_context: '整理记忆上下文',
  memory_health: '检查记忆库',
  anime_season: '查新番表',
  anime_ratings: '查评分榜',
  anime_search: '搜番剧',
  anime_recommend: '找推荐',
  anime_contrast: '对比国内外榜',
}

function extractThinking(events, afterSeq) {
  const reasoning = []
  const tools = []
  for (const e of events || []) {
    if (Number(e.seq || 0) <= afterSeq) continue
    if (e.type === 'tool/call') {
      const label = TOOL_LABELS[e.data?.name] || e.data?.name || '工具'
      tools.push(`正在${label}…`)
    } else if (e.type === 'tool/result') {
      tools.push('工具返回，继续思考…')
    } else if (e.type === 'assistant/message') {
      const message = e.data?.message || e.data
      const blocks = Array.isArray(message?.content) ? message.content : []
      for (const b of blocks) {
        if (b?.type === 'reasoning' && b.text) reasoning.push(String(b.text).trim())
      }
    }
  }
  const text = [...reasoning, ...tools].filter(Boolean).join('\n').trim()
  return text.slice(-1600)
}

let lastThinking = ''

async function pushThinking(text) {
  const body = String(text || '').trim()
  if (!body || body === lastThinking) return
  lastThinking = body
  try {
    await bodyJson('/body/thinking', { method: 'POST', body: JSON.stringify({ text: body }), timeout: 3000 })
  } catch {
    /* body may be offline; the final reply path will report it */
  }
}

async function dshChat(text) {
  const body = String(text || '').trim()
  if (!body) throw new Error('text required')
  if (bodyChatBusy) throw new Error('上一轮 DSH 还在思考，请稍等')
  bodyChatBusy = true
  lastThinking = ''
  const controller = new AbortController()
  const guard = setTimeout(() => controller.abort(), 120000)
  try {
    const sid = await ensureBodySession()
    const before = await hostCtx.sessionController.inspect(sid)
    const baseSeq = (before.events || []).reduce((m, e) => Math.max(m, Number(e.seq || 0)), 0)
    await pushThinking('DSH 正在理解你的话…')
    const content = [{
      type: 'text',
      text: `[桌宠桥接] 你在为 Master 的桌面宠物生成气泡回复。用自然中文回答，通常一到三句；需要 Master 选择时可以在末尾提供选项。不要调用 body_say / body_start / body_stop。可以调用 memory_*、body_memory、body_weather、anime_* 等工具，也可以按 DSH 的完整权限读写文件后再回答。
如果确实需要 Master 做选择，在回复最后单独追加一行：
[[mne-options]] ["选项一","选项二"] [[/mne-options]]
选项行不要出现在正文其它位置；不需要选择时省略。
\n\nMaster说：${body}`,
    }]
    let stream = null
    try {
      stream = await hostCtx.sessionController.follow({
        address: { kind: 'session', sessionId: sid },
        assistantStream: true,
        maxMessages: 80,
      }, controller.signal)
    } catch {
      stream = null
    }
    await hostCtx.sessionController.prompt({
      sessionId: sid,
      requestId: randomUUID(),
      mode: 'queue',
      content,
      clientTimeZone: 'Asia/Shanghai',
    }, new AbortController().signal)

    if (stream) {
      let reasoning = ''
      let liveText = ''
      let lastPush = 0
      let lastToolLabel = ''
      try {
        for await (const frame of stream) {
          if (frame.type === 'assistant-stream') {
            const f = frame.frame
            if (f?.type === 'chunk') {
              const c = f.chunk
              if (c?.type === 'reasoning-delta' && c.text) {
                reasoning += c.text
                const now = Date.now()
                if (now - lastPush > 120) {
                  await pushThinking(reasoning)
                  lastPush = now
                }
              } else if (c?.type === 'text-delta' && c.text) {
                liveText += c.text
                const now = Date.now()
                if (now - lastPush > 120) {
                  await pushThinking(`${reasoning ? reasoning + '\n' : ''}${liveText}`)
                  lastPush = now
                }
              }
            }
            continue
          }
          if (frame.type !== 'event') continue
          const e = frame.event
          if (Number(e?.seq || 0) <= baseSeq) continue
          if (e.type === 'tool/call') {
            const label = TOOL_LABELS[e.data?.name] || e.data?.name || '工具'
            lastToolLabel = label
            reasoning += `${reasoning ? '\n' : ''}正在${label}…`
            await pushThinking(reasoning)
            lastPush = Date.now()
          } else if (e.type === 'tool/result') {
            reasoning += `${reasoning ? '\n' : ''}${lastToolLabel || '工具'}返回，继续分析…`
            await pushThinking(reasoning)
            lastPush = Date.now()
          } else if (e.type === 'assistant/message') {
            const message = e.data?.message || e.data
            const blocks = Array.isArray(message?.content) ? message.content : []
            const think = blocks.filter((b) => b?.type === 'reasoning' && b.text).map((b) => b.text).join('')
            if (think && !reasoning.includes(think)) reasoning += think
            const reply = blocks.filter((b) => b?.type === 'text' && b.text).map((b) => b.text).join('').trim()
            if (reply) return reply
          }
        }
      } catch (err) {
        if (controller.signal.aborted) throw new Error('DSH 回复超时（120s）')
        /* stream failed: fall through to inspect polling */
      }
    }

    // Fallback: poll committed events (also covers servers without assistantStream).
    let lastPush = 0
    for (let i = 0; i < 460; i++) {
      await new Promise((r) => setTimeout(r, 250))
      const insp = await hostCtx.sessionController.inspect(sid, new AbortController().signal)
      const now = Date.now()
      if (now - lastPush > 400) {
        const thinking = extractThinking(insp.events, baseSeq)
        if (thinking) {
          await pushThinking(thinking)
          lastPush = now
        }
      }
      const reply = assistantTextFromEvents(insp.events, baseSeq)
      if (reply) return reply
    }
    throw new Error('DSH 回复超时（115s）')
  } finally {
    clearTimeout(guard)
    controller.abort()
    bodyChatBusy = false
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

async function readBody(req, limit = 16384) {
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
    async execute(args, _exec) {
      return fn(args || {})
    },
  })
}

export async function apply(ctx) {
  hostCtx = ctx
  ctxWebServerOrigin = ctx.webServer?.getOrigin?.() || ''
  void writeBridgeInfo()

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
        if (pathname === `${PREFIX}/chat` && req.method === 'POST') {
          try {
            const body = JSON.parse(await readBody(req) || '{}')
            const reply = await dshChat(body.text)
            sendJson(res, 200, { ok: true, text: reply, sessionId: bodySessionId })
          } catch (err) {
            sendJson(res, 500, { ok: false, text: String(err?.message || err) })
          }
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

  if (String(process.env.MURASAMEPET_AUTOSTART || '0').toLowerCase() !== '0') {
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
      toolSpec(mod.defineTool, 'body_start', '启动完整 Murasame 工程作为 DSH 的身体（pet.py + body 控制面，默认 28566，端口占用时自动回退）。', {}, startFullBody),
      toolSpec(mod.defineTool, 'body_stop', '停止由本插件启动的完整身体。', {}, stopFullBody),
      toolSpec(mod.defineTool, 'body_status', '查看身体状态：角色、Live2D 模型、显示模式、TTS、当前 B 站视频。', {}, bodyStatus),
      toolSpec(mod.defineTool, 'body_say', '让身体说话：显示气泡、应用表情，可选 TTS。', {
        text: { type: 'string', required: true, description: '要说的话' },
        emotion: { type: 'string', description: '表情标签，如 高兴 / 认真 / 担心；可空' },
        speak: { type: 'boolean', description: '是否同时 TTS，默认 true' },
      }, bodySay),
      toolSpec(mod.defineTool, 'body_emote', '只切换 Live2D 表情，不说话。', {
        emotion: { type: 'string', required: true, description: '表情标签' },
      }, bodyEmote),
      toolSpec(mod.defineTool, 'body_video', '读取身体当前的 B 站视频观察状态。', {}, bodyVideo),
      toolSpec(mod.defineTool, 'body_music', '读取身体侧 Mnemosyne 音乐采集/播放组件状态。', {}, bodyMusic),
      toolSpec(mod.defineTool, 'body_weather', '查询天气（默认常住地/IP；可传 city）。', {
        city: { type: 'string', description: '城市名，可空' },
      }, bodyWeather),
      toolSpec(mod.defineTool, 'body_memory', '只读查询桌宠真实 Mnemosyne Memory Bank。', {
        query: { type: 'string', description: '检索词；留空返回 Bank 健康状态' },
        limit: { type: 'number', description: '1-20，默认 5' },
      }, bodyMemory),
      toolSpec(mod.defineTool, 'body_screen', '看一眼主人此刻的屏幕：本地截一张存成 JPEG（data/screenshots），返回路径，随后用 read_image 查看。不调 VL、不上传。', {}, bodyScreen),
    ]
    ctx.effect(() => {
      const disposers = tools.map((tool) => ctx.tools.register(tool))
      return () => disposers.forEach((d) => d?.())
    }, 'dsh-murasame-pet: tools')
  } catch {
    /* tools service unavailable; panel/routes still work */
  }
}
