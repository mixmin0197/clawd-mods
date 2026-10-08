import type { EngineInterface, Register } from 'claude-code'

import type { ClawdMode, ClawdSpot } from '../types'
import { PX_PER_COLUMN, durationOf, positionAt, scene, type SceneArgs } from './sprite'

type $ = EngineInterface

const SECOND = 1000
const MINUTE = 60 * SECOND
const TRIP_MS = 2400
const DOZE_MS = 10 * MINUTE // 你多久不说话它就打盹
const WANDER_MS = [3, 5] as const // 每隔几秒看一眼：这一段爬完了就接着规划下一段
const LEAVE_MS = 900

// 画回复的钩子读这些；只有事件钩子写
const spot = { plugin: 'clawd', key: 'spot' } as const
const mood = { plugin: 'clawd', key: 'mode' } as const
const hidden = { plugin: 'clawd', key: 'isHidden' } as const
const debugging = { plugin: 'clawd', key: 'isDebug' } as const
const widthRef = { plugin: 'clawd', key: 'width' } as const
const dreaming = { plugin: 'dream', key: 'isAsleep' } as const

// 事件钩子自己的计数，热重载清零也无妨
let tools = 0
let isWorking = false
let tripUntil = 0
let lastActive = 0
const key = (text: string) => text.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 24)

const replies = async ($: $) => {
  const history = await $.session.messages()
  if ('deny' in history) return []

  return history.filter(one => one.role === 'assistant' && key(one.text) !== '').map(one => ({ key: key(one.text), text: one.text }))
}

// 同一段文字、同一个状态，画面和推算用同一套参数
const sceneArgs = (text: string, mode: ClawdMode, where: ClawdSpot, col?: number): SceneArgs => ({
  mode,
  col,
  text,
  seed: where.seed,
  startX: where.startX,
  startY: where.startY,
  enter: where.enter,
  exit: where.exit,
})

const moodNow = async ($: $): Promise<ClawdMode> => {
  const now = await $.clock.now()
  const { value: isDreaming = false } = await $.state.get(dreaming)
  if (isDreaming) return 'sleep'
  if (now < tripUntil) return 'trip'
  if (tools > 0) return 'dig'
  if (isWorking) return 'run'
  if (lastActive > 0 && now - lastActive > DOZE_MS) return 'doze'

  return 'roam'
}

// 这段路线走完了没有：没走完就不重新规划，让它一口气爬下去
const isDone = (was: ClawdSpot, mode: ClawdMode, text: string, now: number, col?: number) =>
  (now - was.since) / SECOND >= durationOf(sceneArgs(text, mode, was, col))

// 落脚的回复：始终是最新那条。
// 每次换画面都从螃蟹此刻的位置接着走，换回复时上下移动，不会凭空消失再出现
const move = async ($: $, isWandering: boolean) => {
  const now = await $.clock.now()
  const mode = await moodNow($)
  const all = await replies($)
  const keys = all.map(one => one.key)
  const { value: was } = await $.state.get(spot)
  const { value: wasMode = 'roam' } = await $.state.get(mood)
  // 用 /clawd width 设过宽度就按它推算，和画出来的一致
  const { value: fixed = 0 } = await $.state.get(widthRef)
  const col = fixed > 0 ? fixed : undefined
  // 只待在最新那条回复上；来了新回复才搬过去
  const target = keys.at(-1)
  const room = keys.slice(-1)
  if (target === undefined) return
  const textOf = (k: string) => all.find(one => one.key === k)?.text ?? ''
  // 螃蟹此刻在哪（按上一个画面的时间表推算）
  const at = was ? positionAt(sceneArgs(textOf(was.target), wasMode, was, col), (now - was.since) / SECOND) : undefined
  const seed = isWandering || !was ? Math.floor(Math.random() * 1000) : was.seed
  const isRoomChanged = room.join('|') !== (was?.recent ?? []).join('|')

  if (was && target !== was.target && keys.includes(was.target)) {
    const isDown = keys.indexOf(target) > keys.indexOf(was.target)
    await $.state.set(spot, { ...was, recent: room, since: now, startX: at?.x, startY: at?.y, enter: undefined, exit: isDown ? 'down' : 'up' })
    await $.state.set(mood, 'leave')
    await $.clock.sleep(LEAVE_MS)
    await $.state.set(spot, { target, seed, recent: room, since: now + LEAVE_MS, startX: at?.x, enter: isDown ? 'above' : 'below' })
    await $.state.set(mood, mode)
  } else if (!was || target !== was.target || mode !== wasMode || isRoomChanged || (isWandering && isDone(was, wasMode, textOf(was.target), now, col))) {
    const next: ClawdSpot = { target, seed, recent: room, since: now, startX: at?.x, startY: at?.y, enter: was ? undefined : 'above' }
    await $.state.set(spot, next)
    if (mode !== wasMode) await $.state.set(mood, mode)
  }
}

const scheduleWander = ($: $) => {
  const [min, max] = WANDER_MS
  $.clock.after((min + Math.random() * (max - min)) * SECOND, () => {
    void move($, true)
      .catch(() => undefined)
      .finally(() => scheduleWander($))
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    lastActive = await $.clock.now()
    await $.command.register({ name: 'clawd', description: '让小螃蟹出来或者躲起来；/clawd debug 校准框和尺子；/clawd width 630 设置对话栏宽度', argumentHint: '[debug | width 像素]' })
    await move($, false)
    scheduleWander($)

    return started
  })

  on('command.run', { command: 'clawd' }, async ($, e) => {
    // /clawd width 630：告诉它对话栏正文实际多宽（看校准尺子上文字右边缘对着的数字）；/clawd width 不带数字就恢复自动
    const width = e.args.trim().match(/^width(?:\s+(\d+))?$/)
    if (width) {
      const px = width[1] ? Number(width[1]) : 0
      await $.state.set(widthRef, px)
      $.ui.toast(px > 0 ? `对话栏宽度设为 ${px}px` : '对话栏宽度恢复自动')

      return {}
    }
    // /clawd debug：在每一行估算的字顶画红线，截图校准用
    if (e.args.trim() === 'debug') {
      const { value: isDebug = false } = await $.state.get(debugging)
      await $.state.set(debugging, !isDebug)
      $.ui.toast(isDebug ? '校准线关了' : '校准线开了：红线是估算的字顶')

      return {}
    }
    const { value: isHidden = false } = await $.state.get(hidden)
    await $.state.set(hidden, !isHidden)
    $.ui.toast(isHidden ? '小螃蟹出来了' : '小螃蟹躲起来了')

    return {}
  })

  on('prompt.submit', async ($, e, next) => {
    lastActive = await $.clock.now()
    isWorking = true
    await move($, false)

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    tools += 1
    await move($, false)
    try {
      const ran = await next(e)
      if (ran.isError) {
        tripUntil = (await $.clock.now()) + TRIP_MS
        $.clock.after(TRIP_MS, () => void move($, false))
      }

      return ran
    } finally {
      tools -= 1
      await move($, false)
    }
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    lastActive = await $.clock.now()
    isWorking = false
    await move($, false)

    return done
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const drawn = await next(e)
    if (e.surface !== 'desktop') return drawn
    const { value: isHidden = false } = await $.state.get(hidden)
    const { value: where } = await $.state.get(spot)
    const mine = key(e.props.text)
    const isHere = !isHidden && where !== undefined && mine !== '' && where.target.startsWith(mine.slice(0, 12)) && mine.startsWith(where.target.slice(0, 12))
    if (!isHere || !where) return drawn
    const { value: mode = 'roam' } = await $.state.get(mood)
    const { value: isDebug = false } = await $.state.get(debugging)
    // 桌面版报告的列数换算成正文宽：窗口变宽变窄时折行跟着变
    const { value: fixed = 0 } = await $.state.get(widthRef)
    const col = fixed > 0 ? fixed : e.viewport?.columns ? e.viewport.columns * PX_PER_COLUMN : undefined
    const source = scene({ ...sceneArgs(e.props.text, mode, where, col), isDebug })
    const { Box, Svg } = $.ui.resolve(e)

    // 盖在整条回复上，不占位置；字被盖住也没关系
    return (
      <Box key="clawd-host">
        {drawn}
        <Box position="absolute" top={0} left={0}>
          {/* 不给宽高：给了的话桌面版会按消息宽度把整张图放大（约 3.6%），越往下偏得越多 */}
          <Svg source={source} alt="小螃蟹" />
        </Box>
      </Box>
    )
  })
}
