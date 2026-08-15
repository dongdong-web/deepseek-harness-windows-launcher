# dsh-file-explorer 改进记录:文件变更自动感知(未解决难题)

> 本文档记录社区插件 `dsh-file-explorer` 集成过程中的一个**未解决难题**及其**替代方案**。
> 用途:留档备查,避免后续重新踩坑;如需推进,可对照"探索方向"继续。

## 背景

`dsh-file-explorer` 是随 DeepSeek Harness 便携启动器分发的社区文件资源管理器插件(右侧文件树 + 语法高亮预览 + 面板内编辑)。它通过 host 半部(`/plugins/file-explorer/write`)把用户编辑的内容写回工作区磁盘。

用户诉求:在网页内编辑文件(例如填写密钥/配置)后,**正在进行的 AI 会话能够自动感知文件已变更**,无需人工提示 Agent"文件更新了"。

## 为什么难(现状分析)

1. **保存通道不透明**:插件保存文件走的是自己的 HTTP 路由 `POST /plugins/file-explorer/write` → host 端 `ctx.fs.writeText()`。这条路径绕过了 DSH 的会话/工具调用体系,DSH 的 Agent 并不知道这次写入。

2. **没有现成的"文件变更 → 会话通知"API**:
   - 查过 `@deepseek-ai/dsh-client-*` 与 host 侧服务,未发现公开的"工作区文件变更事件 → 注入当前会话"通道。
   - DSH 会话内感知文件的机制是 Agent 通过工具调用(`readFile` / `listDir` 等)主动读取,而不是订阅式监听。
   - 会话/工具调用的事件总线(`ctx.events` 等)没有公开的"外部文件写入"事件源。

3. **注入会话有副作用风险**:即使强行往会话上下文注入提示,也存在:
   - 打断 Agent 当前推理轨迹(可能被当成用户消息,导致答非所问);
   - 多会话并发时不知道应该通知哪个会话;
   - 触发率问题(自动保存的每次写入都注入,会造成刷屏/干扰)。

## 探索方向(如果未来要真做)

- 查 DSH host 侧 `ctx.fs` 是否有写监听回调、或 workspace/session 服务是否暴露 `onFileChange` 类事件。
- 查 `dsh plugin` 官方示例/文档里有没有"外部工具写文件后通知 Agent"的官方做法(可能存在于 `dsh-tool-*` 或 sandbox 相关插件中)。
- 可参考 `dsh-workbench`(Dpf555)如何处理编辑后与会话的同步——它用了 `__DSH_CONV_BRIDGE__` 私有桥接,说明官方确实没公开通道,需要 hack。

## 采用的替代方案(已实现)

1. **自动保存 + 可见反馈**:编辑停止 1 秒后自动写盘,并在界面显示"已自动保存 ✓"状态提示——用户知道文件已落盘,可以在对话中自行告知 Agent。

2. **降低"人工告知"的成本**:文件树编辑面板与对话同屏,用户看到"已保存"后,在输入框补一句"我更新了 xxx 文件"即可,成本可接受。

3. **(可选,未实现)** 保存时在页面内 toast/横幅提示"文件已更新,如需 AI 读取请提及文件名"。

## 结论

"编辑文件后 AI 自动感知"在当前 DSH 公开 API 下**没有干净的实现路径**,采用"自动保存 + 界面反馈 + 用户一句话告知"作为替代。若 DSH 未来开放文件变更事件或工具订阅能力,再回来实现真正的自动感知。

---

# 附录:文件资源管理器的写入权限放开(安全权衡记录)

> 用户在使用文件资源管理器编辑工作区外文件(例如当前开发项目 `D:\Developing\Design\deepseekharness一键安装`)时,遇到 `file access denied under workspace-write mode`。
> 原因:插件走 DSH 的 `ctx.fs`(dsh-fs-sandbox)服务,默认沙箱只允许写工作区;而 Agent 工具走另一条通道(会话级授权),因此出现"AI 能写、插件不能写"的双通道现象。这不是双标,是两条不同的权限通道。

## 已做的改动

在 `app/community-plugins/dsh-file-explorer/lib/index.js` 的 `/plugins/file-explorer/write` 路由中,把写入调用改为显式传沙箱策略:

```js
await fs.writeText(target, content, undefined, undefined, { mode: 'danger-full-access' })
```

依据:`dsh-fs-sandbox` 的 `checkedTarget()` 在 `mode === 'danger-full-access'` 时直接放行(见 `@deepseek-ai/dsh-fs-sandbox/lib/index.js` 第 157-170 行);`writeText` 第 5 参数 `sandboxPolicy` 缺省时用 `ctx.sandboxPolicy.resolve()`(会话当前模式,默认 workspace-write)。

## 安全权衡(必须理解)

| 角度 | 说明 |
|---|---|
| 用户手动操作 | 合理:网页内手动点"保存",写哪都是用户自己的选择 |
| 潜在风险 | 插件从此**无条件全盘可写**,不经过任何审批通道——如果被恶意网页内容诱导"打开文件 → 点保存",没有工作区围栏兜底 |
| 与 Agent 对比 | Agent 全盘写需经会话授权机制;插件放开后是**无审批的全盘可写**,仅靠用户眼睛把关 |

## 遗留问题 / 更好的方案(未实现)

1. **可配置开关**:给 file-explorer 加配置项(如 `allowFullAccess: boolean`),默认 false 保持工作区边界,由 launcher 的 patch 显式开启。这样"自己用全盘写,分发时保持安全"。
2. **跟随会话权限**:让插件读取当前会话的 sandbox 模式,用户会话是 danger-full-access 时插件同权限,普通会话保持 workspace-write——更精细,但实现复杂(HTTP 路由需要感知会话上下文)。
3. **确认 `ctx.fs` 即 SandboxedFileSystem**:已在 `dsh-base/cordis.patch.yml` 确认 profile 的 `fs` = `@deepseek-ai/dsh-fs-sandbox`。

> ⚠️ 该改动若随 launcher 分发,会削弱他人机器上的安全边界(插件作者的原意是工作区围栏)。**建议**在正式发布前实现"可配置开关",默认关闭。
