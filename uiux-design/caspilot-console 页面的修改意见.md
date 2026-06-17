## 1. Cap bar — 加阈值变色、刻度、剩余提示

当前 cap bar 只有一个静态 amber 填充。打磨点：**接近上限时不再是 amber 而是警示色**（cap 是用量监控，amber 应留给"授权"语义，高用量本质是状态信号），加 80%/100% 刻度线和剩余文案。

**替换片段 1 里 cap 卡的 HTML：**

```html
          <div class="stat">
            <div class="slabel">Daily cap used</div>
            <div class="snum"><span data-roll="1200">0</span> <span class="ssub" style="display:inline">/ 100,000</span></div>
            <div class="cap-bar" data-pct="1.2">
              <div class="cap-ticks"><i style="left:80%"></i><i style="left:100%"></i></div>
              <div class="cap-fill" data-pct="1.2"></div>
            </div>
            <div class="cap-foot"><span class="cap-rem">98,800 remaining</span><span class="cap-pct">1.2%</span></div>
          </div>
```

**追加/替换 CSS：**

```css
.cap-bar{position:relative;height:5px;background:var(--surface-2);border-radius:3px;margin-top:12px;overflow:hidden}
.cap-ticks i{position:absolute;top:0;bottom:0;width:1px;background:var(--canvas);opacity:.8;z-index:1}
.cap-fill{height:100%;width:0;border-radius:3px;background:var(--accent);transition:width 900ms var(--ease),background 300ms var(--ease)}
/* threshold colors: cap is a status signal, not an authorize signal */
.cap-fill.warn{background:var(--payment)}
.cap-fill.crit{background:var(--failed)}
.cap-foot{display:flex;align-items:center;justify-content:space-between;margin-top:7px;font-family:var(--mono);font-size:10px;color:var(--text-muted)}
.cap-foot .cap-pct{color:var(--text)}
```

**脚本里填充时按阈值加类：**

```js
document.querySelectorAll('.cap-fill').forEach(f=>{
  const pct=parseFloat(f.dataset.pct);
  f.style.width=pct+'%';
  if(pct>=90)f.classList.add('crit');else if(pct>=80)f.classList.add('warn');
});
```

> 设计取舍：原稿"amber only on CTA + cap bar"。这里把**低用量保持 amber**（符合规范），但 80%/100% 越线时切到 payment/failed —— 因为"快爆上限"是必须被一眼看到的状态，而状态色本就允许出现在 meter 中。amber 仍是低用量下的默认，单视口里不会与 CTA 抢焦点。

---

## 2. IntentTable 行 + badge — 焦点可达、行内 chevron、badge 收口

打磨点：整行可键盘聚焦（`tabindex`+回车跳转）、hover 时右侧浮现 chevron、amount 负载更真实、badge dot 用实心语义点而非 `currentColor`（更稳）。

**替换 IntentTable 相关 CSS：**

```css
tbody tr{cursor:pointer;transition:background 140ms var(--ease)}
tbody tr:hover{background:var(--surface-2)}
tbody tr:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
tbody td{padding:12px 16px;border-bottom:1px solid var(--hairline);font-size:13px;vertical-align:middle}
tbody tr:last-child td{border-bottom:none}
/* trailing chevron reveals on hover/focus */
td.go{width:28px;padding-right:14px;text-align:right}
td.go svg{width:14px;height:14px;stroke:var(--text-muted);fill:none;opacity:0;transform:translateX(-3px);transition:opacity 140ms var(--ease),transform 140ms var(--ease)}
tr:hover td.go svg,tr:focus-visible td.go svg{opacity:1;transform:translateX(0)}
.badge .bdot{width:6px;height:6px;border-radius:50%}
.badge.draft .bdot{background:var(--text-muted)}
.badge.validated .bdot{background:var(--validated)}
.badge.payment .bdot{background:var(--payment)}
.badge.executed .bdot{background:var(--executed)}
.badge.failed .bdot{background:var(--failed)}
```

**替换 thead + 一行示例（其余行同构，末尾加 `<td class="go">`）：**

```html
              <thead>
                <tr><th>Intent</th><th>Agent</th><th>Token</th><th class="num">Amount</th><th>State</th><th>Updated</th><th></th></tr>
              </thead>
```

```html
                <tr tabindex="0" onclick="go('int_3hdp2en')" onkeydown="rowKey(event,'int_3hdp2en')">
                  <td class="mono id"><a href="#">int_3hdp…</a></td>
                  <td class="mono muted">00aa…</td>
                  <td class="mono">cspr-test-cep18</td>
                  <td class="num">500</td>
                  <td><span class="badge validated"><span class="bdot"></span>POLICY_VALIDATED</span></td>
                  <td class="muted">12s ago</td>
                  <td class="go"><svg viewBox="0 0 24 24" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg></td>
                </tr>
```

**脚本加键盘处理：**

```js
function rowKey(e,id){if(e.key==='Enter'||e.key===' '){e.preventDefault();go(id);}}
```

> badge 的 `.bdot` 从 `currentColor` 改为显式语义色，避免某些渲染下继承异常；视觉无变化，状态色依旧只活在 badge 内。

---

## 3. Vault 卡 — 加 admin/token 标识层级、meter 阈值、临期高亮

打磨点：vault 卡顶部加一个状态点表达"健康/临期"、meter 同样按阈值变色、`valid until` 临近时变 payment 色提醒。

**替换 vault 相关 CSS：**

```css
.vault-card{position:relative;border:1px solid var(--hairline);border-radius:10px;padding:16px;margin-bottom:14px;transition:border-color 160ms var(--ease)}
.vault-card:last-child{margin-bottom:0}
.vault-card:hover{border-color:#3a3a42}
.vault-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.vault-head .vt{font-family:var(--mono);font-size:12px;color:var(--text);display:flex;align-items:center;gap:7px}
.vault-head .vt .vdot{width:6px;height:6px;border-radius:50%;background:var(--executed)}
.vault-head .vexp{font-family:var(--mono);font-size:10px;color:var(--text-muted)}
.vault-head .vexp.soon{color:var(--payment)}
.meter-fill{height:100%;border-radius:3px;background:var(--executed);width:0;transition:width 900ms var(--ease),background 300ms var(--ease)}
.meter-fill.warn{background:var(--payment)}
.meter-fill.crit{background:var(--failed)}
```

**替换两张 vault 卡 HTML：**

```html
              <div class="vault-card">
                <div class="vault-head">
                  <span class="vt"><span class="vdot"></span>vault · 00cc…</span>
                  <span class="vexp">valid until 2025-12-31</span>
                </div>
                <dl class="vault-kv">
                  <dt>admin</dt><dd>00aa…</dd>
                  <dt>token</dt><dd>cep18 · 00cc…</dd>
                  <dt>max single</dt><dd>500</dd>
                  <dt>daily cap</dt><dd>100,000</dd>
                </dl>
                <div class="meter-row"><span class="mk">used today</span><span class="mv">1,200 / 100,000</span></div>
                <div class="meter"><div class="meter-fill" data-pct="1.2"></div></div>
              </div>
              <div class="vault-card">
                <div class="vault-head">
                  <span class="vt"><span class="vdot"></span>vault · 00ef…</span>
                  <span class="vexp soon">valid until 2025-03-15</span>
                </div>
                <dl class="vault-kv">
                  <dt>admin</dt><dd>00aa…</dd>
                  <dt>token</dt><dd>cep18 · 00ef…</dd>
                  <dt>max single</dt><dd>2,500</dd>
                  <dt>daily cap</dt><dd>250,000</dd>
                </dl>
                <div class="meter-row"><span class="mk">used today</span><span class="mv">48,500 / 250,000</span></div>
                <div class="meter"><div class="meter-fill" data-pct="19.4"></div></div>
              </div>
```

**脚本里 meter 填充也按阈值加类（与 cap bar 合并处理）：**

```js
document.querySelectorAll('.meter-fill').forEach(f=>{
  const pct=parseFloat(f.dataset.pct);
  f.style.width=pct+'%';
  if(pct>=90)f.classList.add('crit');else if(pct>=80)f.classList.add('warn');
});
```

---

三处打磨一致遵循同一原则：**用量/容量类指示器在越线时才动用语义色（payment→failed），低位维持中性或 amber**，状态色始终被关在 badge / meter / cap bar 这些"仪表"里，不外溢到面板。amber 在单视口内仍只锚定主 CTA 与低位 cap 条。
