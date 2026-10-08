import { expect, test } from 'claude-code/testing'

import { CRAB_H, COL_W, durationOf, layout, positionAt, reaction, scene, stopsOf } from '../hooks/sprite'

const REPLY = [
  '第一行是天花板，螃蟹从第二行开始站。',
  '',
  '这一段很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长，会折成两行。',
  '',
  '## 标题',
  '- 列表第一项 postpone',
  '- 列表第二项：测试通过',
].join('\n')

test('估计的排版：段落折行、标题和列表各占自己的行', () => {
  const { lines, height } = layout(REPLY)
  expect(lines.length).toBe(6)
  for (let i = 1; i < lines.length; i++) expect(lines[i]!.top > lines[i - 1]!.top).toBe(true)
  expect(Math.round(lines.at(-1)!.x0)).toBe(31) // 一级列表缩进 32px（量的）× 1.33/1.36
  expect(height > lines.at(-1)!.top).toBe(true)
})

test('落脚点从第二行开始，蛇形往下，不出界', () => {
  const { stops } = stopsOf(REPLY)
  expect(stops[0]!.line).toBe(0)
  expect(Math.min(...stops.map(one => one.y)) >= -2).toBe(true) // 整只螃蟹都在回复框里
  for (const one of stops) expect(one.x >= 0 && one.x <= COL_W).toBe(true)
  const first = stops.filter(one => one.line === 0).map(one => one.x)
  const second = stops.filter(one => one.line === 1).map(one => one.x)
  expect(first[0]! <= first.at(-1)!).toBe(true)
  expect(second[0]! >= second.at(-1)!).toBe(true)
})

test('每种心情都画得出来，推算的位置连续', () => {
  for (const mode of ['roam', 'run', 'dig', 'trip', 'doze', 'sleep', 'leave'] as const) {
    const source = scene({ mode, text: REPLY, seed: 3, startX: 50, startY: 10, exit: 'up' })
    expect(source.startsWith('<svg')).toBe(true)
    expect(source.length < 131072).toBe(true)
  }
  const args = { mode: 'roam' as const, text: REPLY, seed: 5, startX: 123, startY: 7 }
  expect(positionAt(args, 0)).toEqual({ x: 123, y: 7 })
  const a = positionAt(args, 4)
  const b = positionAt(args, 4.05)
  expect(Math.hypot(a.x - b.x, a.y - b.y) < 40).toBe(true)
  expect(positionAt({ ...args, mode: 'doze' }, 99)).toEqual({ x: 123, y: 7 })
})

test('看到错误会吓一跳，看到通过会开心，代码里会敲键盘', () => {
  expect(reaction('报错了', false)).toBe('scared')
  expect(reaction('测试通过', false)).toBe('happy')
  expect(reaction('const', true)).toBe('typing')
  expect(reaction('螃蟹', false)).toBe(undefined)
})

test('只在字上：停下来的地方都在某一行字的范围里', () => {
  const text = ['第一行', '短行', '这是一行很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长的字', '- 列表项', '最后一段'].join('\n')
  const { lines } = stopsOf(text)
  for (let seed = 1; seed < 6; seed++) {
    for (let t = 0; t < 90; t += 0.2) {
      const p = positionAt({ mode: 'roam', text, seed }, t)
      expect(p.x >= 0 && p.x <= COL_W - 36).toBe(true)
    }
  }
  // 在某一行的高度上时，几乎总是踩着字（只有从长行爬到短行、退回去之前那一瞬间在字外面）
  const args = { mode: 'roam' as const, text, seed: 3 }
  let onLine = 0
  let onText = 0
  for (let t = 0; t < 90; t += 0.1) {
    const p = positionAt(args, t)
    const line = lines.find(one => Math.abs(one.top + 3 - 24 - p.y) < 1)
    if (!line) continue
    onLine += 1
    if (p.x + 18 >= line.x0 - 20 && p.x <= line.x1 + 20) onText += 1
  }
  expect(onText / onLine > 0.9).toBe(true)
})

test('一行一行往下爬：行与行之间是爬下去的，不是跳', () => {
  const text = Array.from({ length: 8 }, (_, i) => `第 ${i + 1} 行字，后面还有一些字让它有一点长度`).join('\n\n')
  const source = scene({ mode: 'roam', text, seed: 4 })
  expect(source).toContain('rotate(90deg)')
  expect(source).toContain('rotate(-90deg)')
  expect(source.length < 131072).toBe(true)
  // 往下走的过程中 y 只增不减，直到爬回顶部那一段
  let deepest = -Infinity
  for (let t = 0; t < 120; t += 0.25) deepest = Math.max(deepest, positionAt({ mode: 'roam', text, seed: 4 }, t).y)
  expect(deepest > 100).toBe(true)
})

test('很长的回复也能一段一段爬到底，每段动画都不超过桌面版的大小限制', () => {
  const text = Array.from({ length: 60 }, (_, i) => `第 ${i + 1} 段，写一点字让它有长度，也有一些 English words 混在里面。`).join('\n\n')
  const { stops } = stopsOf(text)
  const bottom = Math.max(...stops.map(one => one.y))
  // 像 mod 那样：一段爬完，从它停下的位置开始下一段
  let at: { x: number; y: number } | undefined
  let deepest = -Infinity
  for (let chunk = 0; chunk < 12 && deepest < bottom - 1; chunk++) {
    const args = { mode: 'roam' as const, text, seed: 9 + chunk, startX: at?.x, startY: at?.y }
    expect(scene(args).length < 131072).toBe(true)
    const length = durationOf(args)
    for (let t = 0; t <= length; t += 0.5) deepest = Math.max(deepest, positionAt(args, t).y)
    const end = positionAt(args, length)
    // 每一段都比上一段更往下；到了最后一行的那一段会爬回顶部，不算
    if (deepest < bottom - 1) expect(at === undefined || end.y > at.y).toBe(true)
    at = end
  }
  expect(deepest >= bottom - 1).toBe(true) // 到过最后一行
})
