下面是 **`caspilot-landing.html`** 这一个页面里、"refine next" 指定的三处组件打磨。每处都标明改的是哪个 section / 哪个 class，给出可直接替换的片段。

---

## 打磨 ①｜`caspilot-landing.html` › HERO section › `.hero-grid` + `.hero-glow` + `.telemetry`

**问题：** 当前 `.hero-glow` 里有一行废样式 `transform:transl(-50%,-50%)`（拼写错误，被下一行覆盖才没出事）；网格是均匀铺满，缺少"仪表透视"纵深；glow 是单层椭圆，略平。

**打磨点：** 修掉废样式；网格加一层近大远小的纵向透视感（用第二层更细的网格 + 顶部渐隐）；glow 改双层（外散射 + 内核），脉冲只作用于内核，更克制；telemetry chip 增加"块高/区块"两段 mono，更像真实遥测。

**替换 HERO 相关 CSS：**

```css
.hero-grid{position:absolute;inset:0;background-image:linear-gradient(var(--hairline) 1px,transparent 1px),linear-gradient(90deg,var(--hairline) 1px,transparent 1px);background-size:64px 64px;opacity:.16;mask-image:radial-gradient(ellipse 78% 58% at 50% 44%,#000 28%,transparent 76%);-webkit-mask-image:radial-gradient(ellipse 78% 58% at 50% 44%,#000 28%,transparent 76%)}
/* second, finer grid for instrument depth */
.hero-grid::after{content:"";position:absolute;inset:0;background-image:linear-gradient(var(--hairline) 1px,transparent 1px),linear-gradient(90deg,var(--hairline) 1px,transparent 1px);background-size:16px 16px;opacity:.5;mask-image:linear-gradient(to bottom,transparent,#000 60%,transparent);-webkit-mask-image:linear-gradient(to bottom,transparent,#000 60%,transparent)}
/* outer scatter — static; inner core — the only pulse */
.hero-glow{position:absolute;left:50%;top:62%;width:560px;height:320px;transform:translateX(-50%);background:radial-gradient(ellipse at center,rgba(255,90,31,.14),rgba(255,90,31,0) 68%);filter:blur(26px);pointer-events:none;z-index:1}
.hero-glow::before{content:"";position:absolute;left:50%;top:50%;width:240px;height:120px;transform:translate(-50%,-50%);background:radial-gradient(ellipse at center,rgba(255,90,31,.28),rgba(255,90,31,0) 70%);filter:blur(14px);animation:glowPulse 2s ease-in-out infinite}
@keyframes glowPulse{0%,100%{opacity:.5}50%{opacity:1}}
.telemetry{position:absolute;top:24px;right:24px;display:flex;align-items:center;gap:8px;font-family:var(--mono);font-size:11px;color:var(--text-muted);background:var(--surface);border:1px solid var(--hairline);border-radius:999px;padding:6px 12px;z-index:3}
.telemetry .tdot{width:6px;height:6px;border-radius:50%;background:var(--executed);position:relative}
.telemetry .tdot::after{content:"";position:absolute;inset:-3px;border-radius:50%;background:var(--executed);opacity:.2;animation:pulse 2s ease-out infinite}
.telemetry .tsep{color:var(--hairline)}
.telemetry .tok{color:var(--executed)}
```

**替换 telemetry 的 HTML（HERO section 内）：**

```html
  <div class="telemetry">
    <span class="tdot"></span>casper-test
    <span class="tsep">·</span>block 2,184,773
    <span class="tsep">·</span>a3f9…c7f0 <span class="tok">verified</span>
  </div>
```

> 仍只有一个 amber 脉冲（glow 内核），telemetry 的绿点是 health 语义、非 amber，不抢焦。

---

## 打磨 ②｜`caspilot-landing.html` › THE MODEL section › `.mcard` + `.intent-chip` + `.flow-badges`

**问题：** 三张卡视觉权重相等，但叙事是有顺序的（提议→授权→执行）；hover 只有位移，缺少"当前/激活"暗示；底部 `.flow-badges` 的箭头和卡片没有视觉关联。

**打磨点：** 卡片顶部加一条与步骤对应的极细标记线（前两步中性，第三步 = 执行，用 amber——这是页面叙事的落点，符合"amber 标记授权/执行时刻"）；`.intent-chip` 的 key 列等宽对齐更像终端输出；hover 时序号变亮。

**替换 MODEL 相关 CSS：**

```css
.mcard{position:relative;background:var(--surface);border:1px solid var(--hairline);border-radius:14px;padding:26px;transition:transform 200ms var(--ease),border-color 200ms var(--ease);box-shadow:inset 0 1px 0 rgba(255,255,255,.02);overflow:hidden}
.mcard::before{content:"";position:absolute;top:0;left:0;right:0;height:2px;background:var(--hairline);transition:background 200ms var(--ease)}
.mcard:hover{transform:translateY(-4px);border-color:#3a3a42}
/* the third step is execution — the narrative payoff carries the amber */
.mcard.exec::before{background:var(--accent)}
.mcard .mstep{font-family:var(--mono);font-size:11px;color:var(--text-muted);margin-bottom:14px;transition:color 200ms var(--ease)}
.mcard:hover .mstep{color:var(--text)}
.mcard h3{font-family:var(--display);font-weight:600;font-size:20px;margin-bottom:10px}
.mcard p{color:var(--text-muted);font-size:14px;margin-bottom:18px}
.intent-chip{background:var(--surface-2);border:1px solid var(--hairline);border-radius:9px;padding:12px 14px;font-family:var(--mono);font-size:11px;color:var(--text);line-height:1.9}
.intent-chip .k{display:inline-block;width:74px;color:var(--text-muted)}
```

**替换 model-grid 的 HTML（给第三张卡加 `exec` 类，三个 chip 用对齐的 `.k`）：**

```html
    <div class="model-grid">
      <div class="mcard reveal">
        <div class="mstep">01 · PROPOSE</div>
        <h3>Propose</h3>
        <p>The agent drafts a payment intent. Nothing moves yet — it is only a proposal on the record.</p>
        <div class="intent-chip">
          <span class="k">token</span>cspr-test-cep18<br>
          <span class="k">amount</span>500<br>
          <span class="k">network</span>casper:casper-test
        </div>
      </div>
      <div class="mcard reveal">
        <div class="mstep">02 · AUTHORIZE</div>
        <h3>Authorize</h3>
        <p>A SignerGuard policy checks caps and allowlist before anything signs. The agent never holds keys.</p>
        <div class="intent-chip">
          <span class="k">policy</span>caps · allowlist<br>
          <span class="k">signer</span>detached<br>
          <span class="k">agent_keys</span>none
        </div>
      </div>
      <div class="mcard exec reveal">
        <div class="mstep">03 · EXECUTE</div>
        <h3>Execute</h3>
        <p>A detached signature broadcasts to casper-test. The result is verifiable — a real deploy hash.</p>
        <div class="intent-chip">
          <span class="k">deploy</span>a3f9…c7f0<br>
          <span class="k">finality</span>finalized<br>
          <span class="k">proof</span>testnet.cspr.live
        </div>
      </div>
    </div>
```

> amber 在本 section 只出现一次：第三张"Execute"卡顶部那条 2px 线——正是叙事落点"链上执行/可验证"。`.flow-badges` 的 FSM 色保持只在 badge 内，无需改动。

---

## 打磨 ③｜`caspilot-landing.html` › SECURITY MODEL section › `.sec-head` + `.grow` 排版 + `.hashline`

**问题：** 安全 band 的标题与正文排版偏"营销"，与"instrument-grade"调性略有出入；`.grow` 序号、标题、说明三者层级对比不够；`.hashline` 在窄屏下 hash 与链接会挤。

**打磨点：** 标题区改为左对齐的"档案条目"质感（mono kicker + 紧凑标题），更像安全白皮书而非落地页；`.grow` 标题用更克制的字号、序号用等宽并加一条与之对齐的引导；`.hashline` 加 label、窄屏堆叠、hash 用更小字号确保 64 hex 不破版。

**替换 SECURITY 相关 CSS：**

```css
.security{background:var(--surface);border-top:1px solid var(--hairline);border-bottom:1px solid var(--hairline)}
.security .sec-head{text-align:left;max-width:780px;margin:0 auto 40px}
.security .sec-head .eyebrow{margin-bottom:12px}
.security .sec-head h2{font-size:26px;letter-spacing:-.015em}
.security .sec-head .slead{color:var(--text-muted);font-size:15px;margin-top:10px;max-width:560px}
.guarantees{max-width:780px;margin:0 auto}
.grow{display:grid;grid-template-columns:36px 1fr;gap:0 18px;padding:22px 0;border-bottom:1px solid var(--hairline)}
.grow:last-child{border-bottom:none}
.grow .gnum{font-family:var(--mono);font-size:12px;color:var(--accent-dim);padding-top:4px;letter-spacing:.05em}
.grow .gtitle{font-family:var(--display);font-weight:600;font-size:16px;margin-bottom:4px;letter-spacing:-.01em}
.grow .gsub{color:var(--text-muted);font-size:14px;line-height:1.6}
.hashline{display:flex;align-items:center;gap:12px;flex-wrap:wrap;background:var(--surface-2);border:1px solid var(--hairline);border-radius:9px;padding:11px 14px;margin-top:14px}
.hashline .hlabel{font-family:var(--mono);font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em}
.hashline .hx{font-family:var(--mono);font-size:11px;color:var(--text);word-break:break-all;flex:1;min-width:0}
.hashline a{font-family:var(--mono);font-size:11px;color:var(--accent);text-decoration:none;display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.hashline a:hover{text-decoration:underline}
.hashline a svg{width:12px;height:12px;stroke:currentColor;fill:none}
@media(max-width:560px){.hashline{flex-direction:column;align-items:flex-start}}
```

> 用 `--accent-dim`（不是亮 amber）给序号，避免在安全 band 引入第二个亮焦点——亮 amber 仍只属于 CTA 与 hero glow。

**替换 SECURITY 的 sec-head + hashline HTML：**

```html
    <div class="sec-head">
      <span class="eyebrow">SECURITY MODEL</span>
      <h2>Guarantees, not promises</h2>
      <p class="slead">Autonomy is only safe when the boundaries are structural. These four hold whether or not the agent behaves.</p>
    </div>
```

```html
          <div class="hashline">
            <span class="hlabel">deploy</span>
            <span class="hx">a3f9c2e1b7d04856f1aa92c3e84b07d51c6f2a98e3b4d7c019fa5e62b8d34c7f0</span>
            <a href="#" rel="noreferrer">testnet.cspr.live<svg viewBox="0 0 24 24" stroke-width="1.8"><path d="M7 17L17 7M9 7h8v8"/></svg></a>
          </div>
```

---

三处打磨贯穿同一判断：**亮 amber 在整个 landing 页只锚定两处——hero glow 内核与各 CTA；叙事落点（Execute 卡顶线）借用一次**；安全序号等次要强调用 `--accent-dim`，FSM 状态色继续只活在 badge 内，纵深和质感靠 hairline + mono + 双层网格表达，不引入任何渐变或装饰色。
