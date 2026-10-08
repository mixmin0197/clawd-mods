// dream 对外公开的状态：别的 mod（比如小螃蟹）可以读，看 Claude 是不是在睡觉做梦
export type DreamSleep = boolean

declare module 'claude-code' {
  interface PluginState {
    dream: { isAsleep: DreamSleep }
  }
}
