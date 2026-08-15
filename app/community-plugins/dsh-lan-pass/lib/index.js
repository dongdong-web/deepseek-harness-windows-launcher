/**
 * dsh-lan-pass — 局域网密码门禁（host-only）。
 *
 * - tapIndex 注入：crypto.randomUUID polyfill（HTTP 非安全上下文必需）
 *   + 门卫脚本（非本机访问先向服务端验 Cookie，无效则跳转 /lan-login）
 * - 路由：
 *     GET  /lan-login    移动端登录页
 *     GET  /lan-auth     校验 Cookie 令牌（门卫脚本用）
 *     POST /lan-auth     {password} → 校验通过签发 HttpOnly Cookie
 *
 * 密码来源：环境变量 DSH_LAN_PASSWORD，或 $DSH_HOME/.credentials.yaml
 * 的 DSH_LAN_PASSWORD。未配置时插件自动禁用（不影响本机使用）。
 * 本机（localhost/127.0.0.1）访问永不拦截。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHmac, timingSafeEqual } from 'node:crypto'

export const name = 'dsh-lan-pass'
export const inject = ['webServer']

const TOKEN_MSG = 'dsh-lan-auth/v1'
const DEFAULT_PASSWORD = 'deepseekyyds'
const COOKIE = 'dsh_lan'
const JSON_H = { 'content-type': 'application/json; charset=utf-8' }

function homeCandidates() {
  const list = []
  if (process.env.DSH_HOME) list.push(process.env.DSH_HOME)
  if (process.env.USERPROFILE) list.push(join(process.env.USERPROFILE, '.dsh'))
  if (process.env.HOME) list.push(join(process.env.HOME, '.dsh'))
  return list
}

function readSecret() {
  if (process.env.DSH_LAN_PASSWORD) return process.env.DSH_LAN_PASSWORD
  for (const home of homeCandidates()) {
    try {
      const text = readFileSync(join(home, '.credentials.yaml'), 'utf8')
      const m = text.match(/^DSH_LAN_PASSWORD:\s*(.+)$/m)
      if (m) return m[1].trim()
    } catch { /* try next */ }
  }
  return ''
}

const MOBILE_CSS = `<style data-plugin="dsh-lan-pass-mobile">/* 移动端适配 CSS：整合自 dsh-web-mobile-fix（MIT, AcidGr/dsh-web-mobile-fix）*//* ── mobile UI fixes (≤700px) ── */
@media (max-width: 700px) {
  /* 1. Settings panel: stacked full-screen layout */
  [role="dialog"][aria-modal="true"][aria-labelledby] {
    flex-direction: column !important;
    width: 100vw !important;
    max-width: 100vw !important;
    height: 100vh !important;
    height: 100dvh !important;
    max-height: 100vh !important;
    max-height: 100dvh !important;
    border-radius: 0 !important;
  }
  [role="dialog"][aria-modal="true"][aria-labelledby] > nav {
    flex: none !important;
    flex-direction: column !important;
    width: 100% !important;
    box-sizing: border-box !important;
    padding: 12px 12px 6px !important;
    gap: 8px !important;
  }
  [role="dialog"][aria-modal="true"][aria-labelledby] > nav > div:last-child {
    flex-direction: row !important;
    flex-wrap: nowrap !important;
    gap: 6px !important;
  }
  [role="dialog"][aria-modal="true"][aria-labelledby] > nav button {
    flex: 1 1 0 !important;
    min-width: 0 !important;
    height: 36px !important;
    padding: 6px 10px !important;
    gap: 6px !important;
    justify-content: center !important;
  }
  [role="dialog"][aria-modal="true"][aria-labelledby] > nav button[aria-current="true"] {
    background: var(--dsw-specific-sidebar-nav-item-active, #e8ebf1) !important;
  }
  [role="dialog"][aria-modal="true"][aria-labelledby] > nav + div {
    flex: 1 1 0 !important;
    min-height: 0 !important;
  }
  [role="dialog"][aria-modal="true"][aria-labelledby] > nav + div > div:first-child {
    padding: 12px 12px 6px !important;
  }
  [role="dialog"][aria-modal="true"][aria-labelledby] > nav + div > div:last-child {
    padding: 0 16px 16px !important;
  }
  /* 2. Session log header button: compact icon-only circle */
  [data-slot="conversation.session.header.utilities"] button {
    width: 32px !important;
    min-width: 32px !important;
    height: 32px !important;
    padding: 0 !important;
    border-radius: 50% !important;
    justify-content: center !important;
  }
  [data-slot="conversation.session.header.utilities"] button span {
    position: absolute !important;
    width: 1px !important;
    height: 1px !important;
    margin: -1px !important;
    padding: 0 !important;
    border: 0 !important;
    overflow: hidden !important;
    clip: rect(0 0 0 0) !important;
    white-space: nowrap !important;
  }
  /* 3. Composer model select: hide the model name / effort text, keep the
        chevron; the click still opens the model + effort picker */
  [data-slot="conversation.input.model"] > div > button {
    padding: 0 6px !important;
    gap: 0 !important;
  }
  [data-slot="conversation.input.model"] > div > button > span {
    display: none !important;
  }
  /* 4. Anchored dropdowns → centered popups */
  [data-slot="conversation.composer.bar"] [role="menu"],
  [data-slot="conversation.composer.bar"] [role="dialog"],
  [data-slot="conversation.session.header.actions"] ul[aria-label] {
    position: fixed !important;
    left: 50% !important;
    top: 50% !important;
    right: auto !important;
    bottom: auto !important;
    transform: translate(-50%, -50%) !important;
    min-width: 0 !important;
    max-width: calc(100vw - 32px) !important;
    max-height: min(480px, calc(100dvh - 96px)) !important;
    z-index: 1200 !important;
  }
  /* 5. Hide the session title breadcrumbs in the top bar */
  [data-slot="conversation.session.header"] nav {
    display: none !important;
  }
  /* 6. Directory picker footer: pin Cancel/Open to one stable bottom row */
  [role="dialog"]:has(> div:last-child > button[aria-pressed]) > div:last-child {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto auto !important;
    gap: 8px !important;
    align-items: center !important;
  }
  [role="dialog"]:has(> div:last-child > button[aria-pressed]) > div:last-child > :nth-child(1) {
    grid-area: 1 / 1 !important;
    justify-self: start !important;
  }
  [role="dialog"]:has(> div:last-child > button[aria-pressed]) > div:last-child > :nth-child(2) {
    grid-area: 1 / 2 !important;
    justify-self: start !important;
  }
  [role="dialog"]:has(> div:last-child > button[aria-pressed]) > div:last-child > :nth-child(3) {
    grid-area: 2 / 1 !important;
  }
  [role="dialog"]:has(> div:last-child > button[aria-pressed]) > div:last-child > :nth-child(4) {
    grid-area: 2 / 2 !important;
    justify-self: end !important;
  }
  [role="dialog"]:has(> div:last-child > button[aria-pressed]) > div:last-child > :nth-child(5) {
    grid-area: 2 / 3 !important;
    justify-self: end !important;
  }
  /* 7. Sidebar open on mobile → full-screen overlay (drawer) */
  [data-details-collapsed]:not([data-sidebar-collapsed]) > div:first-child {
    position: absolute !important;
    top: 0 !important;
    bottom: 0 !important;
    left: 0 !important;
    width: 100vw !important;
    z-index: 30 !important;
    box-shadow: 0 0 24px rgb(0 0 0 / 18%) !important;
  }
  [data-details-collapsed]:not([data-sidebar-collapsed]) [data-slot="sidebar"],
  [data-details-collapsed]:not([data-sidebar-collapsed]) [data-slot="sidebar"] > * {
    width: 100% !important;
  }
}</style>`
const POLYFILL = '<script>(function(){if(!window.crypto||!window.crypto.randomUUID){var gv=window.crypto&&window.crypto.getRandomValues;if(gv){var h=function(n){return(n<16?"0":"")+n.toString(16)};window.crypto.randomUUID=function(){var b=new Uint8Array(16);gv.call(window.crypto,b);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;return h(b[0])+h(b[1])+h(b[2])+h(b[3])+"-"+h(b[4])+h(b[5])+"-"+h(b[6])+h(b[7])+"-"+h(b[8])+h(b[9])+"-"+h(b[10])+h(b[11])+h(b[12])+h(b[13])+h(b[14])+h(b[15])}}}})();</script>'

const GATE = '<script>(function(){var n=location.hostname;if(n==="localhost"||n==="127.0.0.1"||n==="::1")return;fetch("/lan-auth",{headers:{Accept:"application/json"}}).then(function(r){if(r.status!==200)location.replace("/lan-login")}).catch(function(){})})();</script>'

function loginPage() {
  return '<!doctype html><html lang="zh"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>DSH 局域网访问</title><style>' +
    'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;' +
    'background:linear-gradient(160deg,#0b1a3a,#123a7a);font-family:"Microsoft YaHei",sans-serif;}' +
    '.card{width:86%;max-width:340px;background:rgba(18,28,52,.92);border:1px solid rgba(140,190,245,.35);' +
    'border-radius:16px;padding:28px 24px;box-shadow:0 16px 48px rgba(10,20,40,.5);color:#eaf1fc;}' +
    'h1{margin:0 0 6px;font-size:20px;}p{margin:0 0 18px;color:#9fb6dd;font-size:13px;}' +
    'input{width:100%;box-sizing:border-box;padding:12px 14px;border-radius:10px;border:1px solid rgba(140,190,245,.4);' +
    'background:rgba(255,255,255,.08);color:#fff;font-size:15px;outline:none;}' +
    'button{width:100%;margin-top:14px;padding:12px 0;border:none;border-radius:10px;background:#3b82f6;' +
    'color:#fff;font-size:15px;font-weight:600;cursor:pointer;}' +
    '#err{display:none;margin-top:10px;color:#ff9db0;font-size:13px;}' +
    '</style></head><body><div class="card"><h1>DeepSeek Harness</h1>' +
    '<p>输入访问密钥，连接本机的 DSH 服务</p>' +
    '<input type="password" id="pw" placeholder="访问密钥" autocomplete="current-password">' +
    '<button id="go">连接</button><div id="err">密钥错误，请重试</div></div>' +
    '<script>var go=function(){var v=document.getElementById("pw").value;' +
    'fetch("/lan-auth",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({password:v})})' +
    '.then(function(r){if(r.ok){location.href="/"}else{document.getElementById("err").style.display="block"}})' +
    '.catch(function(){document.getElementById("err").style.display="block"})};' +
    'document.getElementById("go").onclick=go;' +
    'document.getElementById("pw").addEventListener("keydown",function(e){if(e.key==="Enter")go()})' +
    '<\/script></body></html>'
}

export function apply(ctx) {
  const secret = readSecret()
  ctx.inject(['webServer'], (hostCtx) => {
    const { webServer } = hostCtx
    if (secret === DEFAULT_PASSWORD) {
      if (typeof console !== 'undefined') console.warn('[dsh-lan-pass] 正在使用默认密钥 "' + DEFAULT_PASSWORD + '"，人人皆知，请尽快配置 DSH_LAN_PASSWORD 修改')
    }
    const token = createHmac('sha256', secret).update(TOKEN_MSG).digest('hex')
    const cookieOf = (req) => {
      const h = req.headers && req.headers.cookie
      if (!h) return ''
      const m = h.match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)'))
      return m ? m[1] : ''
    }
    const isValid = (req) => {
      const got = cookieOf(req)
      return got.length === token.length && timingSafeEqual(Buffer.from(got), Buffer.from(token))
    }
    const readBody = async (req) => {
      const chunks = []
      for await (const c of req) chunks.push(c)
      return Buffer.concat(chunks).toString('utf8')
    }

    hostCtx.effect(() => webServer.register({
      kind: 'exact',
      path: '/lan-auth',
      handler: async (req, res) => {
        if (req.method === 'GET') {
          if (isValid(req)) { res.writeHead(200, JSON_H); res.end(JSON.stringify({ ok: true })); return }
          res.writeHead(401, JSON_H); res.end(JSON.stringify({ ok: false })); return
        }
        if (req.method === 'POST') {
          let password = ''
          try { password = (JSON.parse(await readBody(req)).password) || '' } catch { /* 坏请求 */ }
          const okP = password.length === secret.length && timingSafeEqual(Buffer.from(password), Buffer.from(secret))
          if (okP) {
            res.writeHead(200, {
              ...JSON_H,
              'set-cookie': COOKIE + '=' + token + '; HttpOnly; SameSite=Lax; Path=/',
            })
            res.end(JSON.stringify({ ok: true }))
          } else {
            res.writeHead(401, JSON_H); res.end(JSON.stringify({ ok: false }))
          }
          return
        }
        res.writeHead(405, JSON_H); res.end()
      },
    }), 'dsh-lan-pass: auth route')

    hostCtx.effect(() => webServer.register({
      kind: 'exact',
      path: '/lan-login',
      handler: (_req, res) => {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(loginPage())
      },
    }), 'dsh-lan-pass: login route')

    hostCtx.effect(() => webServer.tapIndex((html) =>
      html.replace(/<head([^>]*)>/i, '<head$1>' + MOBILE_CSS + POLYFILL + GATE),
    ), 'dsh-lan-pass: index gate')
  })
}
