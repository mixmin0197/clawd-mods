import { expect, mock, test } from 'claude-code/testing'

import { clean, fromTranscript, lineText, morningReport, projectLabel } from '../hooks/lib'

const HOME = '/home/me'
const PROJECTS = `${HOME}/.claude/projects`
const NOW = Date.UTC(2026, 9, 7, 15, 0)
const MINUTE = 60_000

const transcript = [
  JSON.stringify({ type: 'user', message: { role: 'user', content: '风机的叶片今天又出现了裂纹' } }),
  JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: '扑克里的底池赔率可以这样算' }] } }),
  JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'x', content: 'ls' }] } }),
  JSON.stringify({ type: 'user', isMeta: true, message: { content: '<system-reminder>hidden</system-reminder>' } }),
].join('\n')

test('碎片只取人和 Claude 说的话', () => {
  expect(lineText(transcript.split('\n')[2] ?? '')).toBe(undefined)
  expect(lineText(transcript.split('\n')[3] ?? '')).toBe(undefined)
  const fragments = fromTranscript(transcript, 5, Math.random)
  expect(fragments.length).toBe(5)
  for (const one of fragments) expect(['风机的叶片今天又出现了裂纹', '扑克里的底池赔率可以这样算']).toContain(one)
})

test('项目名和醒来时的话', () => {
  expect(projectLabel('-Users-me-Developer-my-app')).toBe('my-app')
  expect(projectLabel('-Users-me-Documents-Notes-Vault---')).toBe('Notes-Vault')
  expect(clean('# 标题\n梦')).toBe('梦')
  expect(clean('～的时候，楼梯')).toBe('的时候，楼梯')
  const night = { id: '1', start: NOW, end: NOW + 1, by: 'command' as const, planned: 2, nextAt: 0, dreams: [] }
  expect(morningReport(night)[0]).toContain('什么都没梦到')
})

test('/goodnight 之后做梦，梦只进日记，不进对话', async ($, on) => {
  const saved: Record<string, unknown> = {}
  on('store.get', ($, e) => ({ value: saved[e.key] }))
  on('store.set', ($, e) => {
    saved[e.key] = JSON.parse(JSON.stringify(e.value))

    return { value: undefined }
  })
  const clock = mock.clock(on, { now: NOW })
  mock.env(on, { HOME })
  const prompts: string[] = []
  const logs: string[] = []

  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.log', ($, e) => {
    logs.push(e.text)

    return { value: undefined }
  })
  on('fs.list', ($, e) => {
    if (e.path === PROJECTS) return { value: [{ name: '-Users-me-Developer-garden-app', kind: 'dir', size: 0, mtimeMs: 0, isLink: false }] }
    if (e.path.endsWith('/memory')) return { value: [{ name: 'blade.md', kind: 'file', size: 40, mtimeMs: NOW, isLink: false }] }

    return { value: [{ name: 'a.jsonl', kind: 'file', size: transcript.length, mtimeMs: NOW, isLink: false }] }
  })
  on('fs.read', ($, e) => ({ value: e.path.endsWith('.md') ? '---\nname: x\n---\n叶片根部的螺栓要定期检查' : transcript }))
  on('model.complete', ($, e) => {
    prompts.push(e.prompt)

    return {
      value: {
        isAnswered: true,
        text: '螺栓变成了筹码，风一吹就滚进了海里',
        usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      },
    }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'goodnight', args: '1' })
  expect(prompts.length).toBe(0)

  await clock.advance(2 * MINUTE)
  expect(prompts.length).toBe(1)
  expect(prompts[0]).toMatch(/叶片|底池|螺栓/)

  const night = saved.night as { dreams: { text: string; from: string[] }[]; end?: number }
  expect(night.dreams.length).toBe(1)
  expect(night.dreams[0]?.from).toContain('garden-app')
  expect(night.end).toBe(undefined)
  expect(logs.length).toBe(0)
})
