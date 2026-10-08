# clawd-mods

两个 Claude Code mod：

- **dream**：你睡着时，Claude 做梦。
- **clawd**：一只像素小螃蟹，在 Claude 最新的回复上一行一行往下爬。

## dream：Claude 做梦

- **入睡**：输入 `/goodnight`（`/goodnight 0` 立刻入梦），或者你空闲 2 小时后自动睡着。
- **做梦**：每晚 2～5 个梦，间隔 70～110 分钟。每个梦从这台电脑上**所有项目**的对话记录和记忆笔记里随机抽碎片，
  有时混进以前的梦，再让模型自由联想。梦没有风格，可以莫名开始，也可以突然结束。
- **醒来**：你发第一条消息时，Claude 把昨晚的梦讲给你听。`/dreams` 打开梦境日记。
- **不影响白天**：做梦用的是不带工具、不带对话历史的单独调用；梦只存在 mod 自己的存储里，
  讲梦是界面上的提示行，模型读不到。mod 不写任何文件，也不替你发消息。

要知道的：

- 它会**读取** `~/.claude/projects` 下所有会话记录和记忆文件，抽出的片段会作为提示发给模型（用你自己的 Claude 账号）。
- 夜里做梦需要 Claude Code 开着、电脑不休眠；没开着的话，醒来时会补做一个"残梦"。
- 每个梦是一次模型调用（默认 `sonnet`），会消耗 token。

## clawd：小螃蟹

- 只在桌面版（desktop）显示，待在**最新的一条回复**上：在一行字上逐词跳，到行尾侧身爬到下一行，蛇形往下，
  爬到最后一行再竖着爬回顶部。
- 跟着 Claude 的状态变：思考时快跑，调用工具时挖土，出错时摔一跤，你 10 分钟不说话时打盹，**dream 在做梦时睡觉**。
- 对脚下的字有反应：遇到"错误""失败"吓一跳，遇到"通过""完成"开心转身，在代码块上敲键盘。
- 来了新回复，它从这条回复掉下去，再落到新回复上。

命令：

| 命令 | 作用 |
|---|---|
| `/clawd` | 让螃蟹躲起来 / 出来 |
| `/clawd debug` | 显示校准框和尺子：每一行估算的位置一个框 |
| `/clawd width 700` | 告诉它对话栏正文的实际宽度（看尺子）；`/clawd width` 恢复自动 |

mod 拿不到界面上每个字的真实位置，螃蟹的落脚点是**按排版估算**的：字宽、行高、段距、列表缩进、
表格列宽、代码块和引用块的留白，都按桌面版的截图校准过，支持中英日韩混排。
窗口宽度变化后如果框对不上，用 `/clawd debug` 看尺子，再用 `/clawd width` 校正。

## 安装

需要支持函数 hook mod 的 Claude Code（2.1.288 或更新）。clawd 依赖 dream，两个一起装：

```
/plugin marketplace add mixmin0197/clawd-mods
/plugin install dream@clawd-mods
/plugin install clawd@clawd-mods
```

或者从克隆的仓库直接运行：

```bash
git clone https://github.com/mixmin0197/clawd-mods
claude --plugin-dir ./clawd-mods/plugins/dream --plugin-dir ./clawd-mods/plugins/clawd
```

## 开发

```bash
claude plugin validate plugins/clawd
claude plugin test plugins/clawd
```

## License

MIT
