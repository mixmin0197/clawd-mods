// clawd 的状态：由事件钩子写，画回复的钩子读；写入时只重画读它的回复
export type ClawdMode = 'roam' | 'run' | 'dig' | 'trip' | 'doze' | 'sleep' | 'leave'

// 螃蟹在哪条回复上（回复文字去掉标点后的前 24 个字），以及最近几条可去的回复
// since：这段表演开始的时间；startX/startY：从哪里接着走；enter/exit：在回复之间上下移动的方向
export type ClawdSpot = {
  target: string
  seed: number
  recent: string[]
  since: number
  startX?: number
  startY?: number
  enter?: 'above' | 'below'
  exit?: 'down' | 'up'
}

declare module 'claude-code' {
  interface PluginState {
    clawd: { spot: ClawdSpot; mode: ClawdMode; isHidden: boolean; isDebug: boolean; width: number }
  }
}
