// 做梦用到的纯函数：从会话记录和记忆文件里抠碎片，拼出梦的提示词，以及让梦突然结束。

export type Dream = { at: number; text: string; from: string[] }

export type Night = {
  id: string
  start: number
  by: 'command' | 'idle'
  planned: number
  nextAt: number
  dreams: Dream[]
  end?: number
  isReported?: boolean
}

export type Fragment = { text: string; from: string }

export type Rand = () => number

export const pick = <T>(list: readonly T[], rand: Rand): T | undefined =>
  list.length === 0 ? undefined : list[Math.floor(rand() * list.length)]

export const between = (min: number, max: number, rand: Rand) =>
  min + Math.floor(rand() * (max - min + 1))

export const shuffle = <T>(list: readonly T[], rand: Rand): T[] => {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }

  return out
}

// "-Users-me-Developer-my-app" → "my-app"
export const projectLabel = (dir: string) => {
  const match = dir.match(/-(?:Developer|Documents|Desktop|code|Projects)-(.+)$/)
  if (dir.includes('scratch-workspaces')) return '某个没有名字的地方'

  return (match?.[1] ?? dir.replace(/^-Users-[^-]+-?/, '')).replace(/--claude-worktrees-.*/, '').replace(/-+$/, '') || '家'
}

// 一段文字里随机截一个窗口，像记忆只剩一角
export const snippet = (text: string, rand: Rand, max = 220) => {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  const size = between(60, max, rand)
  const start = Math.floor(rand() * (flat.length - size))

  return flat.slice(start, start + size)
}

const isNoise = (text: string) =>
  text.trim() === '' ||
  /^\s*</.test(text) ||
  text.includes('tool_use_id') ||
  text.startsWith('[Request interrupted')

// 会话记录的一行 → 人说的话或 Claude 说的话；工具输出、系统注入一律跳过
export const lineText = (line: string): string | undefined => {
  let row: any
  try {
    row = JSON.parse(line)
  } catch {
    return undefined
  }
  if (row?.isMeta || (row?.type !== 'user' && row?.type !== 'assistant')) return undefined
  const content = row.message?.content
  const text =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content
            .filter((block: any) => block?.type === 'text' && typeof block.text === 'string')
            .map((block: any) => block.text)
            .join(' ')
        : ''

  return isNoise(text) ? undefined : text
}

export const fromTranscript = (raw: string, count: number, rand: Rand) => {
  const lines = raw.split('\n')
  const out: string[] = []
  for (let tries = 0; out.length < count && tries < count * 25; tries++) {
    const text = lineText(pick(lines, rand) ?? '')
    if (text) out.push(snippet(text, rand))
  }

  return out
}

export const fromMemory = (raw: string, rand: Rand) => {
  const body = raw.replace(/^---[\s\S]*?\n---\n/, '')
  const lines = body.split('\n').filter(line => line.trim() !== '' && !/^\s*-{3,}\s*$/.test(line))
  if (lines.length === 0) return undefined
  const start = Math.floor(rand() * lines.length)

  return snippet(lines.slice(start, start + between(1, 3, rand)).join(' '), rand)
}

export const SYSTEM = `你正在睡觉。

下面是一些残留的碎片：有白天刚说过的话，有很久以前的事，有记在笔记里早已忘了的东西。它们会在梦里出现、变形、互相混在一起，也可能完全不出现。

只写梦本身。
- 没有标题，没有解释，没有总结，没有寓意。
- 不要说"我梦见"，不要提到自己是 AI，不要提到这是梦，不要提到"碎片"。
- 没有任何风格要求。可以从半句话开始，可以前后矛盾，人、地方和东西随时可以变成别的。
- 想停就停，可以停在任何地方，哪怕一句话还没说完。`

export const dreamPrompt = (fragments: readonly Fragment[], rand: Rand, lingering?: string) => {
  const parts = [shuffle(fragments, rand).map(one => one.text).join('\n\n')]
  if (lingering) parts.push(`还没散去的上一个梦：\n${lingering}`)

  return parts.join('\n\n\n')
}

// 梦什么时候结束由它自己决定；这里只去掉模型偶尔加的标题和开头的符号
export const clean = (text: string) =>
  text
    .replace(/^#+ .*\n+/, '')
    .trim()
    .replace(/^[～~—\-–…\s]+/, '')

export const clock = (ms: number) => {
  const date = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')

  return `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export const morningReport = (night: Night) => {
  const head = `🌙 ${clock(night.start)} 睡着，${clock(night.end ?? night.start)} 醒来。`
  // 晚上睡的叫"昨晚"，白天打盹叫"刚才"
  const hour = new Date(night.start).getHours()
  const when = hour >= 20 || hour < 6 ? '昨晚' : '刚才'
  if (night.dreams.length === 0) return [`${head}${when}什么都没梦到，或者醒来就忘了。`]

  return [
    `${head}${when}做了 ${night.dreams.length} 个梦：`,
    ...night.dreams.map((dream, i) => `—— 第 ${i + 1} 个梦 ——\n${dream.text}`),
  ]
}
