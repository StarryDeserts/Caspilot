下面是 **`caspilot-developers.html`** 这一个页面里、"refine next" 指定的三处组件打磨。每处标明改的是哪个组件 / 哪些 class，给可直接替换的片段。

---

## 打磨 ①｜`caspilot-developers.html` › `#flow` › `.flow` + `.fstep`

**问题：**
- 四步卡用 grid，但箭头 `.farrow` 用 `right:-12px` 绝对定位压在 gap 上——窄屏切两列/单列时箭头方向就乱了（横排箭头指向下一行不成立）。
- 步骤间是"请求→失败(402)→补救→成功"的因果链，但四张等宽卡读起来像并列功能，看不出 **402 是一次"被要求付费"的折返**。
- 没有体现"同一个 endpoint 调了两次"（第 1 次拿 402，第 4 次带 receipt 重试）这个 x402 的核心。

**打磨点：**
- 箭头改为**连接线 + 节点**模型：用一条贯穿的 hairline 轨道，每步一个节点，402 节点用 payment 色、成功节点用 executed 色，让"折返付费再重试"在视觉上成立。
- 在 step 02 与 step 04 之间标注一条回环提示 "retry same call"，点明是同一 endpoint 的二次调用。
- 响应式：横排轨道在窄屏转为竖排轨道（节点在左、文案在右），箭头语义始终正确。

**替换 `.flow` 相关 CSS：**

```css
.flow{position:relative;margin-top:16px}
.flow-track{position:absolute;left:0;right:0;top:19px;height:2px;background:var(--hairline);z-index:0}
.flow-steps{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;position:relative;z-index:1}
.fstep{background:transparent;border:none;padding:0}
.fnode{width:38px;height:38px;border-radius:50%;background:var(--canvas);border:2px solid var(--hairline);display:grid;place-items:center;font-family:var(--mono);font-size:12px;color:var(--text-muted);margin-bottom:14px}
.fstep.pay .fnode{border-color:var(--payment);color:var(--payment)}
.fstep.proof .fnode{border-color:var(--validated);color:var(--validated)}
.fstep.ok .fnode{border-color:var(--executed);color:var(--executed)}
.fcard{background:var(--surface);border:1px solid var(--hairline);border-radius:12px;padding:16px}
.fstep .ftitle{font-family:var(--mono);font-size:13px;color:var(--text);margin-bottom:8px}
.fstep .fdesc{font-size:12px;color:var(--text-muted);line-height:1.5}
.sbadge{display:inline-flex;align-items:center;gap:5px;font-family:var(--mono);font-size:10px;font-weight:500;letter-spacing:.04em;padding:3px 8px;border-radius:999px;border:1px solid;margin-bottom:10px}
.sbadge .sd{width:5px;height:5px;border-radius:50%}
.sbadge.req{color:var(--text-muted);border-color:var(--hairline);background:var(--surface-2)}.sbadge.req .sd{background:var(--text-muted)}
.sbadge.pay{color:var(--payment);border-color:rgba(217,119,6,.35);background:rgba(217,119,6,.08)}.sbadge.pay .sd{background:var(--payment)}
.sbadge.proof{color:var(--validated);border-color:rgba(59,130,246,.35);background:rgba(59,130,246,.08)}.sbadge.proof .sd{background:var(--validated)}
.sbadge.ok{color:var(--executed);border-color:rgba(22,163,74,.35);background:rgba(22,163,74,.08)}.sbadge.ok .sd{background:var(--executed)}
/* retry loop annotation */
.retry-hint{display:flex;align-items:center;gap:8px;font-family:var(--mono);font-size:11px;color:var(--text-muted);margin-top:16px;padding:9px 12px;background:var(--surface-2);border:1px solid var(--hairline);border-left:2px solid var(--accent-dim);border-radius:7px}
.retry-hint svg{width:14px;height:14px;stroke:var(--text-muted);fill:none;flex-shrink:0}
.retry-hint b{color:var(--text);font-weight:500}
@media(max-width:720px){
  .flow-track{left:18px;right:auto;top:0;bottom:0;width:2px;height:auto}
  .flow-steps{grid-template-columns:1fr;gap:18px}
  .fstep{display:grid;grid-template-columns:38px 1fr;gap:14px;align-items:start}
  .fnode{margin-bottom:0}
}
```

**替换整个 `.flow` 的 HTML：**

```html
      <div class="flow">
        <div class="flow-track"></div>
        <div class="flow-steps">
          <div class="fstep">
            <div class="fnode">01</div>
            <div class="fcard">
              <span class="sbadge req"><span class="sd"></span>REQUEST</span>
              <div class="ftitle">Call the endpoint</div>
              <div class="fdesc">Send the intent request with no payment yet.</div>
            </div>
          </div>
          <div class="fstep pay">
            <div class="fnode">02</div>
            <div class="fcard">
              <span class="sbadge pay"><span class="sd"></span>402 QUOTE</span>
              <div class="ftitle">402 Payment Required</div>
              <div class="fdesc">Server returns a quote: amount, CEP-18 token, receiver.</div>
            </div>
          </div>
          <div class="fstep proof">
            <div class="fnode">03</div>
            <div class="fcard">
              <span class="sbadge proof"><span class="sd"></span>PAY · RECEIPT</span>
              <div class="ftitle">Pay + EIP-712 receipt</div>
              <div class="fdesc">CEP-18 transfer on casper-test; signed EIP-712 receipt as proof.</div>
            </div>
          </div>
          <div class="fstep ok">
            <div class="fnode">04</div>
            <div class="fcard">
              <span class="sbadge ok"><span class="sd"></span>200 OK</span>
              <div class="ftitle">Retry with proof</div>
              <div class="fdesc">Re-send the same call with the receipt; it succeeds and the intent advances.</div>
            </div>
          </div>
        </div>
        <div class="retry-hint">
          <svg viewBox="0 0 24 24" stroke-width="1.8"><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/></svg>
          Steps <b>01</b> and <b>04</b> are the <b>same endpoint</b> — the first call returns 402, the retry carries the receipt.
        </div>
      </div>
```

> 现在 402 是轨道上一个 payment 色节点、200 是 executed 色节点，连接线让"折返付费再重试"成立；retry-hint 点明 01/04 是同一 endpoint 的二次调用——x402 的核心一眼可见。窄屏轨道转竖排，箭头语义不再错位。状态色仍只在节点描边 + step badge 内。

---

## 打磨 ②｜`caspilot-developers.html` › `.ep` › 两窗格 endpoint code block

**问题：**
- code block 里 `int_3hdp2en…`、`00aa…` 是省略号占位，judges 想真正复制粘贴跑通时拿到的是残缺值——docs 应给**可用的完整示例值**（或至少完整长度的占位 hex），省略只用于正文行内引用。
- 请求块顶部 `POST /intents` 用 `.jp` 混在 pre 里，和 JSON 同体，不像"请求行"。
- 多个 code block 垂直堆叠时缺少"这是同一 endpoint 的 request/response 配对"的视觉绑定。
- copy 复制的是 `innerText`，会把 `POST /intents` 请求行和 JSON 一起复制，且 `&lt;` 实体在某些浏览器 `innerText` 下正常、但 reason 里的 `<` 复制出来体验不一。

**打磨点：**
- 给完整长度的示例值（hash 用 64-hex 完整串、id 用完整 `int_…`），正文行内仍可用 `…` 简写。
- 请求块用独立的 `.req-line`（method+path）置于 pre 之外，pre 只放 body/response，copy 只复制 pre 的纯 JSON。
- request/response 配对用一个 `.ep-pair` 容器 + 左侧细 amber-dim 连接条绑定。
- copy 改为复制 `pre` 的 `textContent` 并对实体正确解码。

**替换/追加 code block CSS：**

```css
.ep-pair{position:relative;padding-left:14px}
.ep-pair::before{content:"";position:absolute;left:0;top:8px;bottom:8px;width:2px;background:var(--accent-dim);border-radius:2px;opacity:.5}
.req-line{display:flex;align-items:center;gap:8px;font-family:var(--mono);font-size:12px;padding:9px 12px;background:var(--surface);border:1px solid var(--hairline);border-bottom:none;border-radius:10px 10px 0 0}
.req-line .verb{margin:0}
.req-line .rl-path{color:var(--text);word-break:break-all}
.req-line + .code{border-radius:0 0 10px 10px;border-top:1px dashed var(--hairline)}
.code pre{margin:0;padding:14px 16px;overflow-x:auto;font-family:var(--mono);font-size:12px;line-height:1.7;color:var(--text);white-space:pre}
```

**替换 Create intent 的 `.ep-right`（示范完整值 + 请求行外置 + 配对绑定；其余 endpoint 同构改造）：**

```html
        <div class="ep-right ep-pair">
          <div class="req-line">
            <span class="verb post">POST</span>
            <span class="rl-path">/intents</span>
          </div>
          <div class="code">
            <div class="code-head">
              <span class="ch-label">Request body</span>
              <div class="ch-right"><span class="ch-tag">casper-test</span><button class="copy" onclick="copyCode(this)"><svg viewBox="0 0 24 24" stroke-width="1.8"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>copy</button></div>
            </div>
            <pre>{
  <span class="jk">"agent"</span>: <span class="js">"00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"</span>,
  <span class="jk">"receiver"</span>: <span class="js">"00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"</span>,
  <span class="jk">"token"</span>: <span class="js">"cspr-test-cep18"</span>,
  <span class="jk">"contract"</span>: <span class="js">"00cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"</span>,
  <span class="jk">"network"</span>: <span class="js">"casper:casper-test"</span>,
  <span class="jk">"amount"</span>: <span class="js">"500"</span>
}</pre>
          </div>
          <div class="code">
            <div class="code-head">
              <span class="ch-label"><span class="status s2">201 Created</span></span>
              <div class="ch-right"><button class="copy" onclick="copyCode(this)"><svg viewBox="0 0 24 24" stroke-width="1.8"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>copy</button></div>
            </div>
            <pre>{
  <span class="jk">"id"</span>: <span class="js">"int_3hdp2enbaqglke1jv7e1avk3d9"</span>,
  <span class="jk">"state"</span>: <span class="js">"DRAFT"</span>
}</pre>
          </div>
        </div>
```

**替换 copy 脚本（复制 pre 的纯文本、正确解码实体）：**

```js
function copyCode(btn){
  const pre=btn.closest('.code').querySelector('pre');
  // textContent already decodes &lt; etc.; preserves newlines from <pre>
  const text=pre.textContent;
  navigator.clipboard&&navigator.clipboard.writeText(text);
  const o=btn.innerHTML;btn.classList.add('copied');
  btn.innerHTML='<svg viewBox="0 0 24 24" stroke-width="2"><path d="M5 12l5 5 9-11"/></svg>copied';
  setTimeout(()=>{btn.classList.remove('copied');btn.innerHTML=o;},1400);
}
```

> 现在示例值是**完整可粘贴**的（64-hex、完整 intent id），正文行内引用仍用 `…`；请求方法/路径作为独立请求行、不混进可复制的 JSON；request/response 用 amber-dim 连接条绑成一对；copy 复制纯净 JSON 且实体正确解码。amber 仍只在连接条（dim，非焦点亮 amber）+ copy 确认。

---

## 打磨 ③｜`caspilot-developers.html` › `#errors` › `.err-table`

**问题：**
- 状态码列用了四种颜色（payment/failed/muted/inflight），违反"状态色只在 badge/meter"的克制——这里是表格单元格直接上色，且 402 与 422 一橙一红会让读者误以为 402 比 422 轻、404 无关紧要，语义传达不准。
- "Example reason" 是裸文本，没体现它是 **error body 里的字段**。
- 缺一列"何时出现/如何恢复"——docs 的错误表最有用的是 recovery 指引。
- 表格在窄屏会横向溢出。

**打磨点：**
- 状态码改为统一的 mono `.estatus` badge（中性描边 + 小圆点），圆点才带语义色——把颜色收回到"badge 内的点"，符合规范；同时 4xx/5xx 不靠红橙制造焦虑层级。
- reason 列明确呈现为 `reason:` 字段样式（mono、引号），点明它来自 body。
- 新增 "Recover" 列给一句可操作指引。
- 窄屏下表格转为堆叠卡片式行。

**替换 `.err-table` 相关 CSS：**

```css
.err-table{width:100%;border-collapse:collapse;margin-top:8px;border:1px solid var(--hairline);border-radius:10px;overflow:hidden}
.err-table thead th{background:var(--surface-2);font-family:var(--mono);font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);text-align:left;padding:11px 16px;border-bottom:1px solid var(--hairline);white-space:nowrap}
.err-table tbody td{padding:14px 16px;border-bottom:1px solid var(--hairline);font-size:13px;vertical-align:top}
.err-table tbody tr:last-child td{border-bottom:none}
/* status as a neutral badge; the dot carries the (muted) semantic */
.estatus{display:inline-flex;align-items:center;gap:7px;font-family:var(--mono);font-size:12px;color:var(--text);background:var(--surface-2);border:1px solid var(--hairline);border-radius:999px;padding:4px 11px;white-space:nowrap}
.estatus .ed{width:6px;height:6px;border-radius:50%}
.estatus.e402 .ed{background:var(--payment)}
.estatus.e422 .ed{background:var(--failed)}
.estatus.e404 .ed{background:var(--text-muted)}
.estatus.e503 .ed{background:var(--inflight)}
.emeaning{color:var(--text);font-size:13px}
.ereason{font-family:var(--mono);font-size:11px;color:var(--text-muted);line-height:1.55}
.ereason .rk{color:var(--text-muted)}
.erecover{font-size:12px;color:var(--text-muted);line-height:1.5;max-width:30ch}
@media(max-width:760px){
  .err-table,.err-table tbody,.err-table tr,.err-table td{display:block;width:100%}
  .err-table thead{display:none}
  .err-table tr{border-bottom:1px solid var(--hairline);padding:6px 0}
  .err-table tr:last-child{border-bottom:none}
  .err-table td{border:none;padding:6px 16px}
  .err-table td::before{content:attr(data-l);display:block;font-family:var(--mono);font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px}
}
```

**替换整个 `.err-table` 的 HTML（加 Recover 列、status 用 badge、reason 标字段、窄屏 data-l）：**

```html
      <table class="err-table">
        <thead>
          <tr><th>Status</th><th>Meaning</th><th>reason (body)</th><th>Recover</th></tr>
        </thead>
        <tbody>
          <tr>
            <td data-l="Status"><span class="estatus e402"><span class="ed"></span>402</span></td>
            <td data-l="Meaning" class="emeaning">Payment Required</td>
            <td data-l="reason" class="ereason"><span class="rk">reason:</span> "quote: 500 cspr-test-cep18 to 00bb… — pay and retry with receipt"</td>
            <td data-l="Recover" class="erecover">Pay the quote, then retry the same call with the EIP-712 receipt.</td>
          </tr>
          <tr>
            <td data-l="Status"><span class="estatus e422"><span class="ed"></span>422</span></td>
            <td data-l="Meaning" class="emeaning">Policy denied</td>
            <td data-l="reason" class="ereason"><span class="rk">reason:</span> "amount exceeds vault daily cap (1000 &lt; 1500)"</td>
            <td data-l="Recover" class="erecover">Lower the amount or use a vault with remaining cap.</td>
          </tr>
          <tr>
            <td data-l="Status"><span class="estatus e404"><span class="ed"></span>404</span></td>
            <td data-l="Meaning" class="emeaning">Unknown intent</td>
            <td data-l="reason" class="ereason"><span class="rk">reason:</span> "no intent with id int_3hdp2en… — it may have been pruned"</td>
            <td data-l="Recover" class="erecover">Re-create the intent; pruned ids are not recoverable.</td>
          </tr>
          <tr>
            <td data-l="Status"><span class="estatus e503"><span class="ed"></span>503</span></td>
            <td data-l="Meaning" class="emeaning">Upstream unavailable</td>
            <td data-l="reason" class="ereason"><span class="rk">reason:</span> "getTrace 503 · node upstream unavailable, retry shortly"</td>
            <td data-l="Recover" class="erecover">Transient — retry with backoff; the intent state is unchanged.</td>
          </tr>
        </tbody>
      </table>
```

> 状态码颜色收回到"badge 内的小圆点"（符合"状态色只在 badge"），表格本身保持 hairline 中性；reason 明确标为 body 字段；新增 Recover 列让错误表真正可操作；窄屏堆叠为带字段标签的卡片，不再溢出。

---

三处打磨遵循全站一致判断：**amber 唯一焦点仍是 Launch console CTA + copy 确认；x402 flow 与 errors 的状态色全部收进"节点描边 / badge / badge 内圆点"，从不铺在卡片或表格单元格上；连接绑定用 accent-dim（非亮 amber）**。docs 示例值给到完整可粘贴，请求行与可复制 JSON 分离，错误表新增 recovery 指引。全程 path/id/hash/字段名 mono，JSON 无彩虹高亮，`prefers-reduced-motion` 下 scroll-spy 不依赖动画、copy 确认即时。
