import type { EngineInterface, Register } from 'claude-code'

import {
  between,
  dreamPrompt,
  fromMemory,
  fromTranscript,
  clean,
  clock,
  morningReport,
  pick,
  projectLabel,
  shuffle,
  snippet,
  SYSTEM,
  type Fragment,
  type Night,
} from './lib'

type $ = EngineInterface

const asleep = { plugin: 'dream', key: 'isAsleep' } as const

const MODEL = 'sonnet'
const MAX_TOKENS = 16_000 // 只是兜底，不用来截断梦
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const IDLE_MS = 2 * HOUR // 空闲这么久就算睡着
const IDLE_CHECK_MS = 5 * MINUTE
const FIRST_DREAM_MS = 20 * MINUTE // /goodnight 之后多久开始第一个梦
const NIGHT_GAP_MS = 12 * HOUR // 一晚只睡一次
const READ_LIMIT = 3_800_000 // $.fs.read 上限是 4 MiB
const JOURNAL_KEEP = 30
const PANE = 'dream-journal'
const WAKING = ['composer', 'bridge', 'sdk', 'unclassified']

const rand = Math.random

type FileRef = { path: string; from: string; mtimeMs: number; size: number }

const getNight = async ($: $) => ((await $.store.get('night')) as Night | undefined) ?? undefined
const isAsleep = (night: Night | undefined) => night !== undefined && night.end === undefined

const saveNight = async ($: $, night: Night) => {
  await $.store.set('night', night)
  await $.state.set(asleep, isAsleep(night))
  const journal = ((await $.store.get('journal')) as Night[] | undefined) ?? []
  const rest = journal.filter(one => one.id !== night.id)
  await $.store.set('journal', [...rest, night].slice(-JOURNAL_KEEP))
  $.ui.invalidate('ui.render')
}

// ---- 素材：所有项目的会话记录和记忆文件，只读 ----

const listFiles = async ($: $) => {
  const home = await $.env.get('HOME')
  const root = `${home}/.claude/projects`
  const transcripts: FileRef[] = []
  const memories: FileRef[] = []
  const dirs = (await $.fs.list(root).catch(() => [])).filter(one => one.kind === 'dir')
  for (const dir of dirs) {
    const from = projectLabel(dir.name)
    const base = `${root}/${dir.name}`
    for (const file of await $.fs.list(base).catch(() => [])) {
      if (file.kind === 'file' && file.name.endsWith('.jsonl')) {
        transcripts.push({ path: `${base}/${file.name}`, from, mtimeMs: file.mtimeMs, size: file.size })
      }
    }
    for (const file of await $.fs.list(`${base}/memory`).catch(() => [])) {
      if (file.kind === 'file' && file.name.endsWith('.md')) {
        memories.push({ path: `${base}/memory/${file.name}`, from, mtimeMs: file.mtimeMs, size: file.size })
      }
    }
  }

  return { transcripts, memories }
}

const readSome = async ($: $, file: FileRef) => {
  if (file.size < READ_LIMIT) return String(await $.fs.read(file.path).catch(() => ''))
  const tail = await $.process.run(['tail', '-c', '2000000', file.path]).catch(() => undefined)

  return tail?.stdout ?? ''
}

const gather = async ($: $, since: number) => {
  const { transcripts, memories } = await listFiles($)
  const today = transcripts.filter(one => one.mtimeMs >= since)
  const past = transcripts.filter(one => one.mtimeMs < since)
  const fragments: Fragment[] = []

  const fromFiles = async (files: FileRef[], fileCount: number, perFile: () => number) => {
    for (const file of shuffle(files, rand).slice(0, fileCount)) {
      const raw = await readSome($, file)
      for (const text of fromTranscript(raw, perFile(), rand)) fragments.push({ text, from: file.from })
    }
  }

  // 白天的残留最多，旧事少一些，笔记偶尔冒出来
  await fromFiles(today.length > 0 ? today : past, between(2, 3, rand), () => between(2, 4, rand))
  await fromFiles(past, between(1, 3, rand), () => between(1, 2, rand))
  for (const file of shuffle(memories, rand).slice(0, between(1, 3, rand))) {
    const text = fromMemory(String(await $.fs.read(file.path).catch(() => '')), rand)
    if (text) fragments.push({ text, from: file.from })
  }
  // 以前的梦有时会再回来
  const journal = ((await $.store.get('journal')) as Night[] | undefined) ?? []
  const oldDream = pick(journal.flatMap(night => night.dreams), rand)
  if (oldDream && rand() < 0.3) fragments.push({ text: snippet(oldDream.text, rand), from: '旧梦' })

  return fragments
}

// ---- 做梦 ----

// 模块自己的变量：热重载时清零，所以夜晚的状态都放在 $.store 里
let timer: { cancel: () => void } | undefined
let isDreaming = false

const schedule = async ($: $) => {
  timer?.cancel()
  timer = undefined
  const night = await getNight($)
  if (!night || !isAsleep(night) || night.dreams.length >= night.planned) return
  const wait = Math.max(1000, night.nextAt - (await $.clock.now()))
  timer = $.clock.after(wait, () => void dream($, 'cycle'))
}

const dream = async ($: $, why: 'cycle' | 'residual') => {
  if (isDreaming) return
  isDreaming = true
  try {
    const now = await $.clock.now()
    const night = await getNight($)
    if (!night) return
    if (why === 'cycle') {
      // 另一个开着的会话已经接手了这一轮
      if (!isAsleep(night) || night.nextAt > now + 5000) return
      await $.store.set('night', { ...night, nextAt: now + 15 * MINUTE })
    }
    const since = night.start - 24 * HOUR
    const fragments = await gather($, since)
    if (fragments.length === 0) return
    const last = night.dreams.at(-1)
    const lingering = last && rand() < 0.5 ? snippet(last.text, rand, 300) : undefined
    const reply = await $.model.complete({
      model: MODEL,
      system: SYSTEM,
      prompt: dreamPrompt(fragments, rand, lingering),
      maxTokens: MAX_TOKENS,
      timeoutMs: 3 * MINUTE,
    })
    if (!reply.isAnswered) {
      $.ui.log(`dream: 这一轮没睡踏实（${reply.reason}）`, { to: 'debug' })
      return
    }
    const fresh = (await getNight($)) ?? night
    const text = clean(reply.text)
    await saveNight($, {
      ...fresh,
      nextAt: now + between(70, 110, rand) * MINUTE,
      dreams: [...fresh.dreams, { at: now, text, from: [...new Set(fragments.map(one => one.from))] }],
    })
  } finally {
    isDreaming = false
    if (why === 'cycle') await schedule($)
  }
}

const fallAsleep = async ($: $, by: Night['by'], firstIn: number) => {
  const now = await $.clock.now()
  await saveNight($, {
    id: String(now),
    start: now,
    by,
    planned: between(2, 5, rand),
    nextAt: now + firstIn,
    dreams: [],
  })
  await schedule($)
}

// 醒来时说出昨晚的梦。只写进界面，不进模型的上下文，白天的 Claude 不知道自己做过梦。
const report = async ($: $) => {
  const night = await getNight($)
  if (!night || isAsleep(night) || night.isReported) return
  await saveNight($, { ...night, isReported: true })
  for (const line of morningReport(night)) $.ui.log(line)
}

const wake = async ($: $) => {
  const night = await getNight($)
  if (!night || !isAsleep(night)) return
  timer?.cancel()
  timer = undefined
  await saveNight($, { ...night, end: await $.clock.now() })
  if (night.dreams.length > 0) return report($)
  // 整夜电脑没开着、一个梦都没来得及做：醒来前那一刻的残梦
  void dream($, 'residual').then(() => report($))
}

const touch = async ($: $) => $.store.set('lastActive', await $.clock.now())

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'goodnight',
      description: '晚安：Claude 睡着，过一会儿开始做梦（可选参数：几分钟后入梦）',
      argumentHint: '[分钟]',
    })
    await $.command.register({ name: 'dreams', description: '打开梦境日记' })
    if ((await $.store.get('lastActive')) === undefined) await touch($)
    await $.state.set(asleep, isAsleep(await getNight($)))
    await schedule($)
    await report($)

    $.clock.every(IDLE_CHECK_MS, () => {
      void (async () => {
        const night = await getNight($)
        if (isAsleep(night)) return
        const now = await $.clock.now()
        const lastActive = Number((await $.store.get('lastActive')) ?? now)
        const isIdle = now - lastActive >= IDLE_MS
        const hasSlept = night !== undefined && now - night.start < NIGHT_GAP_MS
        if (isIdle && !hasSlept) await fallAsleep($, 'idle', between(5, 20, rand) * MINUTE)
      })()
    })

    return started
  })

  on('prompt.submit', async ($, e, next) => {
    if (WAKING.includes(e.origin.kind)) {
      await touch($)
      await wake($)
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await touch($)

    return next(e)
  })

  // 命令都不返回文字：返回的文字模型会读到，而梦不该进入白天
  on('command.run', { command: 'goodnight' }, async ($, e) => {
    if (isAsleep(await getNight($))) {
      $.ui.toast('已经睡着了 💤')
      return {}
    }
    const minutes = Number.parseFloat(e.args)
    const firstIn = Number.isFinite(minutes) && minutes >= 0 ? minutes * MINUTE : FIRST_DREAM_MS
    await fallAsleep($, 'command', firstIn)
    $.ui.toast(`晚安 🌙 ${Math.round(firstIn / MINUTE)} 分钟后入梦。发任何消息就会醒来。`, { timeoutMs: 8000 })

    return {}
  })

  on('command.run', { command: 'dreams' }, async $ => {
    await $.ui.open({ id: PANE, title: '梦境日记' })

    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const journal = ((await $.store.get('journal')) as Night[] | undefined) ?? []
    const nights = [...journal].reverse()

    return (
      <Box flexDirection="column">
        {nights.length === 0 && <Text dimColor>还没做过梦。输入 /goodnight 睡觉。</Text>}
        {nights.map(night => (
          <Box flexDirection="column" marginBottom={1}>
            <Text bold>
              {clock(night.start)}
              {isAsleep(night) ? ' · 正在睡' : ` → ${clock(night.end ?? night.start)}`}
              {` · ${night.dreams.length} 个梦`}
            </Text>
            {night.dreams.map((one, i) => (
              <Box flexDirection="column" marginTop={1}>
                <Text dimColor>
                  {`第 ${i + 1} 个梦 · ${clock(one.at)} · ${one.from.join('、')}`}
                </Text>
                <Text wrap="wrap">{one.text}</Text>
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    )
  })
}
