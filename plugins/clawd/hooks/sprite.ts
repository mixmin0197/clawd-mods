// 小螃蟹的像素画和动画。一张透明 SVG 盖在整条回复上（对话栏整个宽度），螃蟹只在字上活动，
// 字被盖住也没关系。
// 动画全是 CSS，桌面版自己播放，不需要 mod 一帧一帧重绘。
// 回复上沿以外会被裁掉，所以第一行只能当“天花板”，螃蟹从第二行开始站。

import type { ClawdMode } from '../types'

export type Mode = ClawdMode

const COLOR = '#D97757'
const EYE = '#1a1a1a'
const PX = 3 // 一个像素格 = 3px，整只螃蟹 36×24
export const CRAB_W = 12 * PX
export const CRAB_H = 8 * PX

const rect = (x: number, y: number, w: number, h: number, fill = COLOR) =>
  `<rect x="${x * PX}" y="${y * PX}" width="${w * PX}" height="${h * PX}" fill="${fill}"/>`

// 照着图画的 12×8 网格：身体 2–9 列，左右钳子各 2 列（第 2、3 行），四条腿；钳子和眼睛能单独动
const crab = (isClosed: boolean) =>
  [
    `<g class="arm-l">${rect(0, 2, 2, 2)}</g>`,
    `<g class="arm-r">${rect(10, 2, 2, 2)}</g>`,
    rect(2, 0, 8, 6),
    `<g class="legs-a">${rect(2, 6, 1, 2)}${rect(7, 6, 1, 2)}</g>`,
    `<g class="legs-b">${rect(4, 6, 1, 2)}${rect(9, 6, 1, 2)}</g>`,
    isClosed
      ? `${rect(3, 1.5, 1, 0.34, EYE)}${rect(8, 1.5, 1, 0.34, EYE)}`
      : `<g class="eyes"><g class="blink">${rect(3, 1, 1, 1, EYE)}${rect(8, 1, 1, 1, EYE)}</g></g>`,
  ].join('')

const BASE_CSS = `
  g, rect, text, circle, ellipse { transform-box: fill-box; }
  .blink { transform-origin: center; animation: blink 4.2s infinite; }
  @keyframes blink { 0%, 94%, 100% { transform: scaleY(1); } 97% { transform: scaleY(0.15); } }
  .legs-a, .legs-b { animation: step var(--step, 0.32s) steps(1) infinite; }
  .legs-b { animation-delay: calc(var(--step, 0.32s) / 2); }
  @keyframes step { 0% { transform: translateY(0); } 50% { transform: translateY(-${PX}px); } }
  .still .legs-a, .still .legs-b { animation: none; }
  .bob { transform-origin: bottom center; }
`

// ---- 估计的排版：桌面版不告诉 mod 每行在哪，按截图量出来的尺寸推算 ----

export const COL_W = 697 // 对话栏正文宽（CSS px）：按校准截图量的；桌面版给了列数时按列数算
export const PX_PER_COLUMN = 697 / 106 // 截图那次桌面版报告 106 列，正文宽 697px
const LINE = 20.3 // 正文行高
const GAP = 11 // 段落之间多出来的距离
const GLYPH_TOP = 3 // 字顶在行顶往下约 3px（校准截图里正文每一行都对得上）
const CJK = 14
const LATIN = 6.7

// height：这一行估计占多高（画校准框用）
// parts：表格一行里的每一格（各自的起止和文字）；普通行没有
export type Line = { top: number; x0: number; x1: number; text: string; isCode: boolean; height: number; parts?: Array<{ x0: number; x1: number; text: string }> }

// 全角宽度：中日文字和标点、全角符号，以及韩文
const isWide = (char: string) => /[\u2E80-\u9FFF\uFF00-\uFFEF\u3000-\u303F\uAC00-\uD7AF\u1100-\u11FF]/.test(char)
const widthOf = (char: string, isMono: boolean) => (isMono ? 7.8 : isWide(char) ? CJK : LATIN)

// 去掉 markdown 记号；紧挨着中日韩文字的引号会被显示成弯引号，在中文字体里是全角宽度，换成全角引号来算宽度
const inline = (text: string) =>
  text
    .replace(/\*\*|__|`|~~|\[|\]\([^)]*\)/g, '')
    .replace(/(?<=[\u2E80-\u9FFF\uAC00-\uD7AF])["“”'‘’]|["“”'‘’](?=[\u2E80-\u9FFF\uAC00-\uD7AF])/g, '＂')

// 按宽度把一段文字折成几行
const NO_LINE_START = /[，。、；：！？）」』】》〉…—,.;:!?)\]]/

const wrap = (text: string, room: number, scale: number) => {
  const rows: Array<{ text: string; width: number }> = []
  let row = ''
  let width = 0
  for (const char of text) {
    const w = widthOf(char, false) * scale
    if (width + w > room && row !== '') {
      // 中文排版：句号、逗号这类标点不能在行首，把上一行的最后一个字一起带下来
      const carry = NO_LINE_START.test(char) && [...row].length > 1 ? [...row].at(-1)! : ''
      const kept = carry ? row.slice(0, row.length - carry.length) : row
      const carried = carry ? widthOf(carry, false) * scale : 0
      rows.push({ text: kept, width: width - carried })
      row = carry
      width = carried
    }
    row += char
    width += w
  }
  if (row.trim() !== '') rows.push({ text: row, width })

  return rows
}

// 量尺寸时用的截图缩放和实际的截图缩放
const MEASURED = 1.33
const ACTUAL = 1.36

// 各种块之间的距离，都是按 /clawd debug 的校准截图量的
const LIST_END = 18 // 列表结束后（下一块，或者空行隔开的另一个列表）多出来的距离
const HEADING_BEFORE = 19
const HEADING_LINE = 19.6 // 标题一行占的高度（后面接正文时再加 GAP）
const ROW = 34 // 表格一行
const ROW_TEXT = 7.4 // 表格行里字顶相对行顶
const TABLE_END = 23 // 表格结束后到下一块的距离（校准框截图量的：比普通段距多约 12px）
const CODE_LINE = 17.3
const CODE_TOP = 4 // 代码块上面的留白（表格后面的距离单独算了之后，这里只剩代码框自己的内边距）
const CODE_BOTTOM = 10
const QUOTE_INDENT = 22 // 引用块：左边有一条竖线，字往右缩进约 22px

const CELL_PAD = 24 // 表格每一格左右的留白
const TABLE_WIDER = 1.08 // 表格比正文宽一些（几张校准截图拟合的）

const cellsOf = (raw: string) => raw.replace(/^\s*\||\|\s*$/g, '').split('|').map(cell => inline(cell).trim())
const isRow = (raw: string) => /^\s*\|/.test(raw)
const isRule = (raw: string) => /^\s*\|?\s*:?-{2,}/.test(raw)
const textWidth = (text: string) => [...text].reduce((sum, char) => sum + widthOf(char, false), 0)
// 表格列宽（按校准截图拟合的）：每列先按内容宽，但至少 MIN_COLUMN；
// 放得下就把多出来的按比例分给各列；放不下就从比最小宽度宽的那些列里按超出的部分比例缩。
// 返回每张表每一行（按原文行号）对应的列宽
const MIN_COLUMN = 92
const tableColumns = (raws: readonly string[], room: number) => {
  const out = new Map<number, number[]>()
  for (let i = 0; i < raws.length; i++) {
    if (!isRow(raws[i]!) || (i > 0 && isRow(raws[i - 1]!))) continue
    const indexes: number[] = []
    for (let j = i; j < raws.length && isRow(raws[j]!); j++) if (!isRule(raws[j]!)) indexes.push(j)
    const rows = indexes.map(j => cellsOf(raws[j]!))
    const n = Math.max(1, ...rows.map(row => row.length))
    const wants = Array.from({ length: n }, (_, c) => Math.max(MIN_COLUMN, Math.max(0, ...rows.map(row => textWidth(row[c] ?? ''))) + CELL_PAD))
    const sum = (list: number[]) => list.reduce((a, b) => a + b, 0)
    let widths: number[]
    if (sum(wants) <= room) {
      widths = wants.map(w => w + ((room - sum(wants)) * w) / sum(wants))
    } else {
      const over = wants.map(w => w - MIN_COLUMN)
      const cut = Math.min(sum(over), sum(wants) - room)
      widths = wants.map((w, c) => w - (cut * over[c]!) / (sum(over) || 1))
    }
    for (const j of indexes) out.set(j, widths)
  }
  return out
}

export const layout = (markdown: string, col = COL_W) => {
  // 下面的尺寸是按量的时候的比例算的，宽度也换算过去
  const room = col / (MEASURED / ACTUAL)
  const lines: Line[] = []
  let y = 0
  let last: 'none' | 'p' | 'h' | 'li' | 'row' | 'code' = 'none'
  let isBlank = false
  let isCode = false
  // 新的一块开始前加上和上一块之间的距离
  const before = (kind: typeof last) => {
    if (last === 'none') {
      last = kind
      isBlank = false
      return
    }
    const isSameRun = kind === last && !isBlank && (kind === 'li' || kind === 'row' || kind === 'p')
    if (!isSameRun) {
      if (last === 'li') y += LIST_END
      else if (last === 'row') y += Math.max(TABLE_END, kind === 'h' ? HEADING_BEFORE : 0) // 表格框下面还有留白
      else if (kind === 'h') y += HEADING_BEFORE
      else y += GAP
    }
    last = kind
    isBlank = false
  }

  const raws = markdown.split('\n')
  const tables = tableColumns(raws, room * TABLE_WIDER)
  for (const [index, raw] of raws.entries()) {
    if (/^\s*```/.test(raw)) {
      if (!isCode) {
        before('code')
        y += CODE_TOP
      } else {
        y += CODE_BOTTOM
        last = 'code'
      }
      isCode = !isCode
      continue
    }
    if (isCode) {
      const text = raw.replace(/\t/g, '  ')
      lines.push({ top: y, x0: 12, x1: Math.min(room, 12 + [...text].length * 7.8), text, isCode: true, height: CODE_LINE })
      y += CODE_LINE
      continue
    }
    if (raw.trim() === '') {
      isBlank = true
      continue
    }
    const heading = raw.match(/^(#{1,6})\s+(.*)$/)
    const item = raw.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/)
    if (/^\s*\|/.test(raw)) {
      if (/^\s*\|?\s*:?-{2,}/.test(raw)) continue
      before('row')
      // 每一格按它那一列的宽度折行（列宽像浏览器那样按内容分）；一行有多高看最高的那一格
      const cells = cellsOf(raw)
      const widths = tables.get(index) ?? cells.map(() => (room * TABLE_WIDER) / Math.max(1, cells.length))
      const wrapped = cells.map((cell, c) => wrap(cell, (widths[c] ?? room) - CELL_PAD, 1))
      const tall = Math.max(1, ...wrapped.map(rows => rows.length))
      // 格子里折出来的每一行字都算一行；每一行里各格的字是这一行的几段
      const lefts = widths.map((_, c) => widths.slice(0, c).reduce((a, b) => a + b, 0) + CELL_PAD / 2)
      for (let k = 0; k < tall; k++) {
        const parts = wrapped.flatMap((rows, c) => (rows[k] ? [{ x0: lefts[c]!, x1: lefts[c]! + rows[k]!.width, text: rows[k]!.text }] : []))
        if (parts.length === 0) continue
        lines.push({
          top: y + ROW_TEXT + k * LINE,
          x0: parts[0]!.x0,
          x1: parts.at(-1)!.x1,
          text: parts.map(part => part.text).join(' '),
          isCode: false,
          height: LINE,
          parts,
        })
      }
      y += ROW - LINE + tall * LINE
      continue
    }
    if (heading) {
      before('h')
      for (const row of wrap(inline(heading[2]!), room, 1.15)) {
        lines.push({ top: y, x0: 0, x1: row.width, text: row.text, isCode: false, height: HEADING_LINE + 4 })
        y += HEADING_LINE
      }
      continue
    }
    if (item) {
      before('li')
      const indent = 32 + Math.floor(item[1]!.length / 2) * 36 // 截图量的：一级列表 32px，每嵌套一层再缩进约 36px
      for (const row of wrap(inline(item[3]!), room - indent, 1)) {
        lines.push({ top: y, x0: indent, x1: indent + row.width, text: row.text, isCode: false, height: LINE })
        y += LINE
      }
      y += 3.7
      continue
    }
    before('p')
    const quote = raw.match(/^\s*>\s?(.*)$/)
    const indent = quote ? QUOTE_INDENT : 0
    for (const row of wrap(inline(quote ? quote[1]! : raw), room - indent, 1)) {
      lines.push({ top: y, x0: indent, x1: indent + row.width, text: row.text, isCode: false, height: LINE })
      y += LINE
    }
  }

  // 上面的尺寸都是按截图量的，量的时候把截图当成实际尺寸的 1.33 倍，其实是 1.36 倍
  // （窗口 1470pt 宽、截图 2000px），所以统一缩小回来，不然越往下偏得越多
  const k = MEASURED / ACTUAL

  return {
    lines: lines.map(one => ({
      ...one,
      top: one.top * k,
      x0: one.x0 * k,
      x1: one.x1 * k,
      height: one.height * k,
      parts: one.parts?.map(part => ({ ...part, x0: part.x0 * k, x1: part.x1 * k })),
    })),
    height: Math.max(LINE, y) * k,
  }
}

// ---- 落脚点：在第二行起的每一行上，按词挑几个点 ----

// edge：这一行字从哪里开始，螃蟹贴边爬时走这里，不会走到左边的空白里
export type Stop = { x: number; y: number; word: string; isCode: boolean; line: number; edge: number }

const MAX_LINES = 400 // 校准之后整条回复都对得上，基本不设限
const CHUNK = 12 // 一段动画最多往下爬这么多行（太长会超过桌面版对一张图的大小限制），爬完下一段接着爬
const PER_LINE = 3

// 螃蟹站在这一行字顶上时它的上沿
const standOn = (line: Line) => line.top + GLYPH_TOP - CRAB_H

const wordsOf = (line: Line): Array<{ x: number; word: string }> => {
  if (line.parts) return line.parts.flatMap(part => wordsOf({ ...line, x0: part.x0, x1: part.x1, text: part.text, parts: undefined }))
  const words: Array<{ x: number; word: string }> = []
  let x = line.x0
  let start = x
  let word = ''
  let run = 0
  const close = (end: number) => {
    if (word.trim() !== '') words.push({ x: (start + end) / 2, word })
    word = ''
    run = 0
  }
  for (const char of line.text) {
    const w = widthOf(char, line.isCode)
    if (/[\s，。、；：！？,.;:!?（）()]/.test(char)) {
      close(x)
      start = x + w
    } else {
      word += char
      if (isWide(char) && ++run >= 3) {
        close(x + w)
        start = x + w
      }
    }
    x += w
  }
  close(x)

  return words
}

export const stopsOf = (markdown: string, col = COL_W) => {
  const { lines, height } = layout(markdown, col)
  // 站上去整只螃蟹都要在回复框里（上沿以外会被裁掉），所以开头几行可能站不了；
  // 一行都站不了时，就踩着最后一行的底
  const fits = lines.filter(one => standOn(one) >= -2).slice(0, MAX_LINES)
  const floors = fits.length > 0 ? fits : lines.slice(-1).map(one => ({ ...one, top: one.top + LINE }))
  const stops: Stop[] = []
  floors.forEach((line, i) => {
    const words = wordsOf(line)
    const step = Math.max(1, Math.ceil(words.length / PER_LINE))
    const picked = words.filter((_, k) => k % step === 0)
    if (picked.length === 0) picked.push({ x: line.x0 + 20, word: '' })
    const ordered = i % 2 === 0 ? picked : [...picked].reverse() // 蛇形：一行往右，下一行往左
    const edge = Math.round(line.x0 + (line.isCode ? 0 : 2))
    const right = Math.max(edge, Math.min(col - CRAB_W, line.x1 - CRAB_W))
    for (const one of ordered) {
      stops.push({
        x: Math.round(Math.max(edge, Math.min(right, one.x - CRAB_W / 2))),
        edge,
        y: Math.round(standOn(line)),
        word: one.word,
        isCode: line.isCode,
        line: i,
      })
    }
  })
  if (stops.length === 0) stops.push({ x: 0, y: Math.round(LINE + GLYPH_TOP - CRAB_H), word: '', isCode: false, line: 0, edge: 0 })

  return { stops, height, lines: floors }
}

// ---- 小动作和对内容的反应 ----

type Action = 'none' | 'look' | 'wave' | 'sit' | 'stomp' | 'scared' | 'happy' | 'typing'

const SECONDS: Record<Action, number> = { none: 0.3, look: 1.6, wave: 1.4, sit: 2.2, stomp: 1, scared: 1.4, happy: 1.3, typing: 2 }

export const reaction = (word: string, isCode: boolean): Action | undefined => {
  if (/错误|报错|失败|异常|bug|error|fail|crash|崩溃|不行|没有/i.test(word)) return 'scared'
  if (/✓|✔|通过|成功|好了|完成|搞定|done|pass|ok/i.test(word)) return 'happy'
  if (isCode) return 'typing'

  return undefined
}

// 可复现的随机数，同一个 seed 画出同一段表演
const random = (seed: number) => {
  let t = seed >>> 0

  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)

    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

type Track = Array<[number, string]>

const keyframes = (name: string, track: Track) => {
  const sorted = [...track].sort((a, b) => a[0] - b[0])

  return `@keyframes ${name} { ${sorted.map(([pct, value]) => `${Math.min(100, Math.max(0, pct)).toFixed(3)}% { transform: ${value}; }`).join(' ')} }`
}

// ---- 一段表演 ----

export type SceneArgs = {
  mode: Mode
  // 对话栏正文宽（CSS px），不给就用 COL_W
  col?: number
  // 校准：在每一行估算的“字顶”画一条细红线，标上行号
  isDebug?: boolean
  text: string
  seed: number
  // 从哪里接着走（上一个画面里螃蟹此刻的位置）
  startX?: number
  startY?: number
  // 从别的回复过来：从上面掉进来，或者从下面跳上来
  enter?: 'above' | 'below'
  // 离开这条回复：从边缘跳下去，或者沿左边缘爬出上沿
  exit?: 'down' | 'up'
}

type Point = { x: number; y: number }
// turn：爬的时候身子怎么转（脚冲着字的那一边）
type Beat = { from: Point; to: Point; move: number; kind: 'hop' | 'drop' | 'climb' | 'walk'; action: Action; stay: number; turn?: string }

export const sceneSize = (text: string, col = COL_W) => ({ width: Math.ceil(col), height: Math.ceil(layout(text, col).height + CRAB_H * 2) })

// 路线：只在字上。在一行上从一个词跳到下一个词，行尾跳到下一行的字上，
// 最后一行之后沿着各行字的开头爬回第一行。画面虽然盖着整个对话栏宽度，螃蟹不在空白里停留
type Floor = { y: number; x0: number; x1: number; words: Array<{ x: number; word: string }>; isCode: boolean; isGround: boolean }

const floorsOf = (markdown: string, col = COL_W) => {
  const { stops, height, lines } = stopsOf(markdown, col)
  const right = col - CRAB_W
  const floors: Floor[] = lines.map((line, i) => {
    const x0 = Math.round(Math.max(0, line.x0 + (line.isCode ? 0 : 2)))
    const x1 = Math.round(Math.max(x0, Math.min(right, line.x1 - CRAB_W)))

    return {
      y: Math.round(standOn(line)),
      x0,
      x1,
      words: stops.filter(one => one.line === i).map(one => ({ x: one.x, word: one.word })).sort((a, b) => a.x - b.x),
      isCode: line.isCode,
      isGround: false,
    }
  })
  // 回复底部当地面：整个对话栏宽度都能走
  const groundY = Math.round(Math.max(height, (floors.at(-1)?.y ?? 0) + CRAB_H + LINE) - CRAB_H)
  floors.push({ y: groundY, x0: 0, x1: right, words: [], isCode: false, isGround: true })

  return { floors, height }
}

const plan = (args: SceneArgs) => {
  const col = args.col ?? COL_W
  const { floors, height } = floorsOf(args.text, col)
  const rand = random(args.seed)
  const isRun = args.mode === 'run'
  // 主要是往下爬，小动作少一点
  const idle: Action[] = ['none', 'none', 'none', 'none', 'none', 'none', 'look', 'wave', 'stomp']
  const right = col - CRAB_W
  const has = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v)
  const top = floors[0]!
  const begin: Point =
    args.enter === 'above' ? { x: has(args.startX) ? args.startX : top.x0, y: -CRAB_H - 8 }
    : args.enter === 'below' ? { x: has(args.startX) ? args.startX : right, y: height + CRAB_H }
    : has(args.startX) && has(args.startY) ? { x: args.startX, y: args.startY }
    : { x: top.words[0]?.x ?? top.x0, y: top.y }
  const beats: Beat[] = []
  let at = begin
  const go = (to: Point, kind: Beat['kind'], word = '', isCode = false, isQuiet = false, turn?: string) => {
    const distance = Math.hypot(to.x - at.x, to.y - at.y)
    if (distance < 1 && beats.length > 0) return
    const move = kind === 'climb' ? distance / 70 : kind === 'walk' ? distance / (isRun ? 160 : 55) : Math.min(1.1, 0.3 + distance / (isRun ? 900 : 500))
    const action: Action = isQuiet || isRun ? 'none' : (reaction(word, isCode) ?? idle[Math.floor(rand() * idle.length)]!)
    beats.push({ from: at, to, move, kind, action, stay: isRun ? 0.08 : SECONDS[action], turn })
    at = to
  }
  // x 处往下掉：落到下面第一个接得住的平台上（字或者地面）
  const below = (x: number, y: number) =>
    floors.find(f => f.y > y + 2 && x >= f.x0 - CRAB_W / 2 && x <= f.x1 + CRAB_W / 2) ?? floors.at(-1)!
  const clampTo = (f: Floor, x: number) => Math.max(f.x0, Math.min(f.x1, x))

  // 先落到一个平台上：起点在空中就往下掉；从下面上来就跳到最低的那行字上
  let here: Floor
  if (args.enter === 'below') {
    here = floors.length > 1 ? floors.at(-2)! : floors.at(-1)!
    go({ x: clampTo(here, begin.x), y: here.y }, 'drop', '', false, true)
  } else {
    const standing = floors.find(f => Math.abs(f.y - begin.y) < 3 && begin.x >= f.x0 - 4 && begin.x <= f.x1 + 4)
    here = standing ?? below(begin.x, begin.y - 1 - (args.enter === 'above' ? 0 : 0))
    if (!standing) go({ x: clampTo(here, begin.x), y: here.y }, 'drop', '', false, true)
  }
  // 只在字上：一行一行蛇形往下，行尾直接跳到下一行的字上；到最后一行就沿字的左边缘爬回第一行
  const texts = floors.filter(f => !f.isGround)
  if (here.isGround) here = texts.at(-1) ?? here
  // 蛇形的方向跟着行号：第一行往右，第二行往左……重新规划时也接得上
  let dir = Math.max(0, texts.indexOf(here)) % 2 === 0 ? 1 : -1
  for (let visits = 0; visits < CHUNK + 1 && beats.length < 120; visits++) {
    const ahead = here.words.filter(w => (dir > 0 ? w.x > at.x + 8 : w.x < at.x - 8))
    const route = dir > 0 ? ahead : [...ahead].reverse()
    route.forEach((w, k) => go({ x: w.x, y: here.y }, 'hop', w.word + (route[k + 1]?.word ?? ''), here.isCode))
    const index = texts.indexOf(here)
    const next = texts[index + 1]
    if (next && visits === CHUNK) break // 这一段爬够了，停在这里，下一段从这里接着往下
    if (next) {
      // 在这一行上走到下一行的尽头正上方（下一行比这行长，就是这行的行尾），
      // 侧过身翻过边缘往下爬到下一行（脚冲着字）；全程都踩着字，不在空白里走
      const end = dir > 0 ? here.x1 : here.x0
      const down = Math.max(here.x0, Math.min(here.x1, clampTo(next, end)))
      go({ x: down, y: here.y }, 'hop', '', false, true)
      go({ x: down, y: next.y }, 'climb', '', false, true, dir > 0 ? 'rotate(90deg)' : 'rotate(-90deg)')
      here = next
      dir = -dir
      continue
    }
    // 最后一行：从这些行里最靠右的那个“字的开头”竖着爬回第一行（段落从 0 开始、列表缩进 31，
    // 取最靠右的才能保证一路经过的每一行脚下都有字），到顶再走回第一行的开头
    const climbX = Math.min(here.x1, Math.max(...texts.slice(0, index + 1).map(f => f.x0)))
    go({ x: climbX, y: here.y }, 'hop', '', false, true)
    go({ x: climbX, y: texts[0]!.y }, 'climb', '', false, true, 'rotate(-90deg)')
    if (texts[0]!.x0 !== climbX) go({ x: texts[0]!.x0, y: texts[0]!.y }, 'walk', '', false, true)
    here = texts[0]!
    dir = 1
  }
  const total = beats.reduce((sum, one) => sum + one.move + one.stay, 0)

  return { beats, total, height }
}

const crabAt = (p: Point, inner: string, cls = '') =>
  `<g class="mover" style="transform: translate(${p.x}px, ${p.y}px)"><g class="bob ${cls}">${inner}</g></g>`

const svg = (width: number, height: number, css: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style>${BASE_CSS}${css}</style>${body}</svg>`

const perform = (args: SceneArgs) => {
  const { beats, total } = plan(args)
  const isRun = args.mode === 'run'
  const pct = (seconds: number) => (seconds / total) * 100
  const mover: Track = []
  const bob: Track = [[0, 'none'], [100, 'none']]
  const eyes: Track = [[0, 'none'], [100, 'none']]
  const armL: Track = [[0, 'none'], [100, 'none']]
  const armR: Track = [[0, 'none'], [100, 'none']]
  let t = 0
  for (const beat of beats) {
    const start = pct(t)
    const land = pct(t + beat.move)
    const end = pct(t + beat.move + beat.stay)
    const { from, to } = beat
    mover.push([start, `translate(${from.x}px, ${from.y}px)`])
    if (beat.kind === 'hop') mover.push([(start + land) / 2, `translate(${(from.x + to.x) / 2}px, ${Math.min(from.y, to.y) - 12}px)`])
    if (beat.kind === 'drop') {
      // 往下：先跳一下再落；往上：先蹲一下再蹦
      const isDown = to.y >= from.y
      mover.push([start + (land - start) * 0.3, `translate(${from.x + (to.x - from.x) * 0.3}px, ${isDown ? from.y - 10 : to.y - 12}px)`])
    }
    // 贴墙爬：身子转过来，脚冲着墙
    const turn = beat.turn ?? (from.x > (args.col ?? COL_W) / 2 ? 'rotate(90deg)' : 'rotate(-90deg)')
    if (beat.kind === 'climb') bob.push([start, 'none'], [start + 0.01, turn], [land - 0.01, turn], [land, 'none'])
    mover.push([land, `translate(${to.x}px, ${to.y}px)`])
    mover.push([end, `translate(${to.x}px, ${to.y}px)`])
    if (beat.kind === 'hop' || beat.kind === 'drop') bob.push([land, 'none'], [land + (end - land) * 0.15, 'scaleY(0.86)'], [land + (end - land) * 0.4, 'none'])
    const span = end - land
    const at_ = (f: number) => land + span * f
    const { action } = beat
    if (action === 'look') eyes.push([at_(0.1), 'none'], [at_(0.3), 'translateX(-3px)'], [at_(0.6), 'translateX(3px)'], [at_(0.9), 'none'])
    if (action === 'wave') {
      for (const f of [0.15, 0.45, 0.75]) armL.push([at_(f), 'translateY(-5px)'], [at_(f + 0.15), 'none'])
      for (const f of [0.3, 0.6]) armR.push([at_(f), 'translateY(-5px)'], [at_(f + 0.15), 'none'])
    }
    if (action === 'sit') bob.push([at_(0.45), 'none'], [at_(0.5), 'scaleY(0.8)'], [at_(0.9), 'scaleY(0.8)'], [at_(0.97), 'none'])
    if (action === 'stomp') for (const f of [0.45, 0.7]) bob.push([at_(f), 'none'], [at_(f + 0.1), 'translateY(-5px)'], [at_(f + 0.2), 'scaleY(0.85)'], [at_(f + 0.25), 'none'])
    if (action === 'scared') {
      bob.push([at_(0.42), 'none'], [at_(0.5), 'translateY(-14px)'], [at_(0.6), 'none'])
      for (const f of [0.65, 0.73, 0.81]) bob.push([at_(f), 'translateX(-2px)'], [at_(f + 0.04), 'translateX(2px)'])
      bob.push([at_(0.9), 'none'])
      eyes.push([at_(0.4), 'none'], [at_(0.45), 'scale(1.4)'], [at_(0.9), 'scale(1.4)'], [at_(0.97), 'none'])
      armL.push([at_(0.4), 'none'], [at_(0.48), 'translateY(-6px)'], [at_(0.88), 'translateY(-6px)'], [at_(0.95), 'none'])
      armR.push([at_(0.4), 'none'], [at_(0.48), 'translateY(-6px)'], [at_(0.88), 'translateY(-6px)'], [at_(0.95), 'none'])
    }
    if (action === 'happy') {
      bob.push([at_(0.42), 'none'], [at_(0.58), 'translateY(-10px) scaleX(-1)'], [at_(0.74), 'scaleX(1)'], [at_(0.88), 'translateY(-6px) scaleX(-1)'], [at_(0.97), 'none'])
      armL.push([at_(0.42), 'none'], [at_(0.5), 'translateY(-5px)'], [at_(0.92), 'translateY(-5px)'], [at_(0.98), 'none'])
      armR.push([at_(0.42), 'none'], [at_(0.5), 'translateY(-5px)'], [at_(0.92), 'translateY(-5px)'], [at_(0.98), 'none'])
    }
    if (action === 'typing') {
      bob.push([at_(0.42), 'none'], [at_(0.48), 'scaleY(0.9)'], [at_(0.92), 'scaleY(0.9)'], [at_(0.97), 'none'])
      for (let f = 0.48; f < 0.88; f += 0.08) {
        armL.push([at_(f), 'translateY(2px)'], [at_(f + 0.04), 'none'])
        armR.push([at_(f + 0.04), 'translateY(2px)'], [at_(f + 0.08), 'none'])
      }
    }
    t += beat.move + beat.stay
  }
  // 第一圈带着“进场”，之后从头循环会瞬移，所以整段只播一遍；下一次重画会接着走
  const d = `${total.toFixed(2)}s`
  const css = `
    .mover { animation: ride ${d} linear forwards; --step: ${isRun ? '0.14s' : '0.32s'}; }
    .bob { animation: bob ${d} linear forwards; }
    .eyes { animation: eyes ${d} linear forwards; }
    .arm-l { animation: arm-l ${d} linear forwards; }
    .arm-r { animation: arm-r ${d} linear forwards; }
    ${keyframes('ride', mover)} ${keyframes('bob', bob)} ${keyframes('eyes', eyes)} ${keyframes('arm-l', armL)} ${keyframes('arm-r', armR)}`

  return { css, start: beats[0]?.from ?? { x: 0, y: 0 }, total }
}

// 这段表演要多久（播完就该换一段新的接着走）
export const durationOf = (args: SceneArgs) => (args.mode === 'roam' || args.mode === 'run' ? plan(args).total : Infinity)

// 表演开始 seconds 秒后螃蟹在哪
export const positionAt = (args: SceneArgs, seconds: number): Point => {
  if (args.mode !== 'roam' && args.mode !== 'run') return restAt(args)
  const { beats } = plan(args)
  let t = Math.max(0, seconds)
  for (const beat of beats) {
    if (t < beat.move) {
      const f = t / beat.move

      return { x: beat.from.x + (beat.to.x - beat.from.x) * f, y: beat.from.y + (beat.to.y - beat.from.y) * f }
    }
    t -= beat.move
    if (t < beat.stay) return beat.to
    t -= beat.stay
  }

  return beats.at(-1)?.to ?? restAt(args)
}

// 静止的心情待在哪：接着原来的位置；没有就挑一个落脚点
const restAt = (args: SceneArgs): Point => {
  if (args.startX !== undefined && args.startY !== undefined && args.enter === undefined) return { x: args.startX, y: args.startY }
  const { stops } = stopsOf(args.text, args.col)
  const one = stops[args.seed % stops.length]!

  return { x: args.startX ?? one.x, y: one.y }
}

// 校准：每一行估计的位置画一个框（从字的开头到结尾、从行顶到行底），框上沿就是螃蟹落脚的高度
const guides = (text: string, col: number) =>
  layout(text, col)
    .lines.map((line, i) => {
      const y = Math.round(line.top + GLYPH_TOP)
      const kind = line.parts ? 'tb' : line.isCode ? 'code' : line.x0 > 0 ? 'li' : 'p'
      const h = Math.max(6, Math.round(line.height - GLYPH_TOP - 2))
      const boxes = (line.parts ?? [line]).map(part =>
        `<rect x="${part.x0}" y="${y}" width="${Math.max(20, part.x1 - part.x0)}" height="${h}" fill="#e5484d" fill-opacity="0.06" stroke="#e5484d" stroke-opacity="0.8" stroke-width="1"/>`)
      return `${boxes.join('')}<text x="${Math.min(col - 40, line.x1 + 4)}" y="${y + 9}" font-size="9" fill="#e5484d" font-family="monospace">${i}${kind}</text>`
    })
    .join('')

// 校准时的尺子：每 50px 一个刻度，标着数字，画到当前设定的正文宽为止。
// 文字超出尺子末端，说明设窄了；尺子比最长的文字长很多，说明设宽了
const ruler = (width: number) =>
  Array.from({ length: Math.floor(width / 10) + 1 }, (_, i) => {
    const x = i * 10
    const isMajor = x % 50 === 0
    return `<rect x="${x}" y="0" width="1" height="${isMajor ? 10 : 4}" fill="#2563eb" opacity="0.8"/>${isMajor && x > 0 ? `<text x="${x + 2}" y="18" font-size="9" fill="#2563eb" font-family="monospace">${x}</text>` : ''}`
  }).join('')

export const scene = (args: SceneArgs) => {
  const col = args.col ?? COL_W
  const { width, height } = sceneSize(args.text, col)
  // 图不能比消息框宽：宽了桌面版会把整张图等比缩小（尺子和框都会跟着变形），所以尺子也只画到正文宽
  const draw = (css: string, body: string) => svg(width, height, css, (args.isDebug ? ruler(width) + guides(args.text, col) : '') + body)
  const { mode } = args

  if (mode === 'roam' || mode === 'run') {
    const { css, start } = perform(args)

    return draw(css, crabAt(start, crab(false)))
  }

  const here = restAt(args)

  if (mode === 'leave') {
    const { lines } = stopsOf(args.text, col)
    const isDown = args.exit !== 'up'
    // 往下：走到这一行的边缘，跳下去，一直掉出这条回复；往上：走到左边缘，贴着边爬出上沿
    const line = lines.find(one => Math.abs(standOn(one) - here.y) < 6)
    const edge = isDown ? Math.min(col - CRAB_W, Math.max(here.x, (line?.x1 ?? here.x + 60) - CRAB_W)) : Math.round(line?.x0 ?? here.x)
    const css = isDown
      ? `.mover { animation: leave 0.9s ease-in forwards; }
         @keyframes leave { 0% { transform: translate(${here.x}px, ${here.y}px); } 45% { transform: translate(${edge}px, ${here.y}px); } 60% { transform: translate(${edge + 14}px, ${here.y - 10}px); } 100% { transform: translate(${edge + 24}px, ${height}px); } }`
      : `.mover { animation: leave 0.9s linear forwards; }
         .bob { animation: turn 0.9s steps(1) forwards; }
         @keyframes turn { 0% { transform: none; } 40% { transform: rotate(-90deg); } }
         @keyframes leave { 0% { transform: translate(${here.x}px, ${here.y}px); } 40% { transform: translate(${edge}px, ${here.y}px); } 100% { transform: translate(${edge}px, ${-CRAB_H * 2}px); } }`

    return draw(css, crabAt(here, crab(false)))
  }

  if (mode === 'dig') {
    const css = `
      .bob { animation: dig 0.36s ease-in-out infinite; }
      @keyframes dig { 50% { transform: translateY(3px) scaleY(0.9); } }
      .arm-l, .arm-r { animation: scoop 0.36s ease-in-out infinite; }
      .arm-r { animation-delay: 0.18s; }
      @keyframes scoop { 50% { transform: translateY(3px); } }
      .dirt { animation: dirt 0.72s ease-out infinite; opacity: 0; }
      .d2 { animation-delay: 0.24s; } .d3 { animation-delay: 0.48s; }
      @keyframes dirt { 0% { opacity: 1; transform: translate(0, 0); } 100% { opacity: 0; transform: translate(var(--dx), -16px); } }`
    const dirt = ([['d1', -12, 2], ['d2', 12, 7], ['d3', -5, 10]] as const)
      .map(([cls, dx, px]) => `<rect class="dirt ${cls}" style="--dx:${dx}px" x="${here.x + px * PX}" y="${here.y + CRAB_H - 4}" width="3" height="3" fill="#8a6a50"/>`)
      .join('')

    return draw(css, crabAt(here, crab(false)) + dirt)
  }

  if (mode === 'trip') {
    const css = `
      .bob { animation: trip 2.2s ease-in-out forwards; }
      @keyframes trip { 0% { transform: rotate(0); } 18% { transform: translateY(2px) rotate(-100deg); } 70% { transform: translateY(2px) rotate(-100deg); } 85% { transform: translateY(-8px) rotate(0); } 100% { transform: rotate(0); } }`

    return draw(css, crabAt(here, crab(false), 'still'))
  }

  const isDream = mode === 'sleep'
  const side = Math.max(0, Math.min(here.x, width - CRAB_W - 60))
  const css = `
    .bob { animation: breathe ${isDream ? 4.4 : 3.6}s ease-in-out infinite; }
    @keyframes breathe { 0%, 100% { transform: scaleY(0.85); } 50% { transform: scaleY(0.78); } }
    .z { font: bold 10px sans-serif; fill: #999; animation: z 3.6s linear infinite; opacity: 0; }
    .z2 { animation-delay: 1.8s; }
    @keyframes z { 0% { opacity: 0; transform: translate(0, 0); } 20% { opacity: 1; } 100% { opacity: 0; transform: translate(10px, -16px); } }
    .bubble { animation: float 4.4s ease-in-out infinite; transform-origin: bottom left; }
    @keyframes float { 50% { transform: translateY(-2px) scale(1.06); } }
    .dot { animation: dot 1.8s infinite; opacity: 0.2; } .dot2 { animation-delay: 0.3s; } .dot3 { animation-delay: 0.6s; }
    @keyframes dot { 30% { opacity: 1; } }`
  const top = here.y + 4
  const extra = isDream
    ? `<g class="bubble">
        <circle cx="${side + CRAB_W + 2}" cy="${top}" r="2" fill="#bbb"/>
        <circle cx="${side + CRAB_W + 8}" cy="${top - 7}" r="3" fill="#bbb"/>
        <ellipse cx="${side + CRAB_W + 32}" cy="${top - 14}" rx="20" ry="8" fill="#e6e6e6" stroke="#bbb"/>
        ${[0, 1, 2].map(i => `<circle class="dot dot${i + 1}" cx="${side + CRAB_W + 24 + i * 8}" cy="${top - 14}" r="2" fill="#777"/>`).join('')}
      </g>`
    : `<text class="z" x="${side + CRAB_W}" y="${top}">z</text><text class="z z2" x="${side + CRAB_W}" y="${top}">z</text>`

  return draw(css, crabAt({ x: side, y: here.y }, crab(true), 'still') + extra)
}
