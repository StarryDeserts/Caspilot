下面是 **`caspilot-vault-detail.html`** 这一个页面里、"refine next" 指定的三处组件打磨。每处标明改的是哪个组件 / 哪些 class，给可直接替换的片段。

---

## 打磨 ①｜`caspilot-vault-detail.html` › 右列 › `.meter-panel` (SpendMeter)

**问题：**
- "resets in 14h 22m" 是死字符串，看着不像活的计时器。
- meter 只有一条整段填充，看不出"今天的多笔 debit 各占多少"——而本页下面恰好有 Recent debits 明细，meter 与明细割裂。
- 没有百分比读数；越线警示只靠条变色，弱。
- single-payment-cap chip 只是静态数字，没表达"单笔上限相对日额度有多大"的语义。

**打磨点：**
- "resets in" 改为 JS 实时倒计时（分钟级跳动，`prefers-reduced-motion` 下仍显示静态值）。
- meter 轨道改为**分段堆叠**：按今日各笔 debit 切成相邻小段（共享同一 amber，段间用 1px canvas 缝隙），让 meter 与下方明细对应——这是"账本式"表达。
- meter 行加 mono 百分比读数，随阈值变色。
- single cap 用一个极细 marker 标在轨道上对应位置（500 / 100,000 = 0.5% 处），直观看出"单笔上限"在日额度中的位置。

**替换/追加 SpendMeter CSS：**

```css
.meter-big{display:flex;align-items:baseline;gap:8px;margin-bottom:4px}
.meter-big .used{font-family:var(--mono);font-variant-numeric:tabular-nums;font-size:36px;font-weight:500;color:var(--text);line-height:1}
.meter-big .total{font-family:var(--mono);font-variant-numeric:tabular-nums;font-size:16px;color:var(--text-muted)}
.meter-big .pct{margin-left:auto;font-family:var(--mono);font-size:13px;color:var(--text-muted);font-variant-numeric:tabular-nums}
.meter-big .pct.warn{color:var(--payment)}.meter-big .pct.crit{color:var(--failed)}
/* segmented, ledger-style track */
.meter-track{position:relative;height:10px;background:var(--surface-2);border-radius:5px;overflow:hidden;margin-top:12px;display:flex;gap:1px}
.meter-seg{height:100%;background:var(--accent);width:0;transition:width 900ms var(--ease),background 300ms var(--ease)}
.meter-seg:first-child{border-radius:5px 0 0 5px}
.meter-track.warn .meter-seg{background:var(--payment)}
.meter-track.crit .meter-seg{background:var(--failed)}
/* single-payment-cap marker */
.cap-marker{position:absolute;top:-3px;bottom:-3px;width:1px;background:var(--text-muted);opacity:.6;z-index:2}
.cap-marker::after{content:"max single";position:absolute;top:-15px;left:50%;transform:translateX(-50%);font-family:var(--mono);font-size:9px;color:var(--text-muted);white-space:nowrap}
.meter-foot{display:flex;align-items:center;justify-content:space-between;margin-top:14px}
.meter-foot .remain{font-family:var(--mono);font-size:12px;color:var(--text-muted);font-variant-numeric:tabular-nums}
.meter-foot .remain b{color:var(--text);font-weight:500}
```

**替换 SpendMeter 的 HTML（big 行加 pct、轨道改分段 + marker）：**

```html
            <div class="meter-big">
              <span class="used"><span data-roll="1200">0</span></span>
              <span class="total">/ 100,000</span>
              <span class="pct" data-pct="1.2">1.2%</span>
            </div>
            <div class="meter-track" id="meterTrack" data-total="100000">
              <!-- one segment per debit today, set by JS; cap marker too -->
            </div>
            <div class="meter-foot">
              <span class="remain"><b>98,800</b> remaining today</span>
              <span class="single-chip">single-payment cap <b>500</b></span>
            </div>
```

**脚本里替换 `window.load` 内填充 meter 的那段：** 用今日各笔 debit 构建分段 + cap marker + 倒计时。

```js
const debitsToday=[500,300,400]; // mirrors the Recent debits rows for today
const singleCap=500;
function paintMeter(){
  const track=document.getElementById('meterTrack');if(!track)return;
  const total=+track.dataset.total;
  const sum=debitsToday.reduce((a,b)=>a+b,0);
  const pct=sum/total*100;
  // segments
  debitsToday.forEach(d=>{
    const seg=document.createElement('div');seg.className='meter-seg';
    track.appendChild(seg);
    requestAnimationFrame(()=>{seg.style.width=(d/total*100)+'%';});
  });
  // threshold class
  if(pct>=90)track.classList.add('crit');else if(pct>=80)track.classList.add('warn');
  // single-cap marker
  const mk=document.createElement('div');mk.className='cap-marker';mk.style.left=(singleCap/total*100)+'%';track.appendChild(mk);
  // pct readout color
  const pctEl=document.querySelector('.meter-big .pct');
  if(pct>=90)pctEl.classList.add('crit');else if(pct>=80)pctEl.classList.add('warn');
}
function tickReset(){
  const el=document.getElementById('resetsIn');if(!el)return;
  // demo: rolling window resets ~14h22m from now
  const target=new Date(Date.now()+(14*60+22)*60*1000);
  function upd(){
    const ms=target-Date.now();if(ms<=0){el.textContent='resetting…';return;}
    const h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000);
    el.textContent='resets in '+h+'h '+String(m).padStart(2,'0')+'m';
  }
  upd();if(!reduce)setInterval(upd,30000);
}
```

并把 `window.load` 的回调改为：

```js
window.addEventListener('load',()=>{
  document.querySelectorAll('[data-roll]').forEach(roll);
  paintMeter();
  tickReset();
});
```

**最后给 "resets in" span 一个 id** —— 替换片段 2 里 `.mresets` 那行：

```html
              <span class="mresets" id="resetsIn">resets in 14h 22m</span>
```

> SpendMeter 现在是真正的"账本计量器"：分段对应明细、单笔上限有 marker、百分比随阈值变色、reset 是活的倒计时。amber 仍是唯一焦点色（分段共享 amber，越线整体让位 payment/failed），cap marker 用中性灰不抢色。

---

## 打磨 ②｜`caspilot-vault-detail.html` › 左列 › `.ledger` (Scoped policy 面板)

**问题：**
- 八行权重完全相同，但语义有分组：**身份**（admin / contract / token / allowlist）、**限额**（max single / daily cap）、**有效期与角色**（valid until / signer role）。一锅平铺，judges 看不出"这是一份分条目的授权契约"。
- 数值（500 / 100,000）和 hash（00aa…）混排，数值没有强调。
- valid until 临期、signer role=local_dev（非生产签名者）这类**需要注意的点**没有任何视觉提示。
- hash 行不可复制。

**打磨点：**
- 用极轻的分组小标题（mono kicker）把 ledger 分成 identity / limits / lifecycle 三组，组间留白，组内仍 hairline 逐行。
- 限额数值用稍亮/稍大字重强调（仍 mono tabular）。
- valid until 临期时日期转 payment 色 + 小注；signer role=local_dev 给一个中性 "dev" 提示 chip（不是错误，是事实标注）。
- hash 行尾加轻量 copy 按钮（hover 才显形）。

**替换/追加 ledger CSS：**

```css
.ledger{margin-top:4px}
.lgroup{margin-top:18px}
.lgroup:first-child{margin-top:8px}
.lgroup .lgk{font-family:var(--mono);font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;padding-bottom:6px}
.ledger .lrow{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:11px 0;border-bottom:1px solid var(--hairline)}
.lgroup .lrow:last-child{border-bottom:none}
.ledger .lk{font-family:var(--mono);font-size:12px;color:var(--text-muted)}
.ledger .lv{font-family:var(--mono);font-size:12px;color:var(--text);text-align:right;font-variant-numeric:tabular-nums;word-break:break-all;display:inline-flex;align-items:center;gap:8px;justify-content:flex-end}
.ledger .lv.amount{font-size:13px;color:var(--text)}
.ledger .lv.soon{color:var(--payment)}
.lv .lcopy{opacity:0;width:13px;height:13px;cursor:pointer;transition:opacity 140ms var(--ease)}
.lrow:hover .lv .lcopy{opacity:.7}
.lv .lcopy:hover{opacity:1}
.lv .lcopy svg{width:13px;height:13px;stroke:var(--text-muted);fill:none}
.dev-tag{font-family:var(--mono);font-size:9px;color:var(--text-muted);background:var(--surface-2);border:1px solid var(--hairline);border-radius:5px;padding:2px 6px;letter-spacing:.04em}
```

**替换整个 `.ledger` HTML：**

```html
            <div class="ledger">
              <div class="lgroup">
                <div class="lgk">identity</div>
                <div class="lrow"><span class="lk">admin</span><span class="lv">00aa…<span class="lcopy" onclick="copyId(this,'00aa…')"><svg viewBox="0 0 24 24" stroke-width="1.8"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg></span></span></div>
                <div class="lrow"><span class="lk">cep-18 contract</span><span class="lv">00cc…<span class="lcopy" onclick="copyId(this,'00cc…')"><svg viewBox="0 0 24 24" stroke-width="1.8"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg></span></span></div>
                <div class="lrow"><span class="lk">allowed token</span><span class="lv">cspr-test-cep18</span></div>
                <div class="lrow"><span class="lk">receiver allowlist</span><span class="lv">00bb…<span class="lcopy" onclick="copyId(this,'00bb…')"><svg viewBox="0 0 24 24" stroke-width="1.8"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg></span></span></div>
              </div>
              <div class="lgroup">
                <div class="lgk">limits</div>
                <div class="lrow"><span class="lk">max single payment</span><span class="lv amount">500</span></div>
                <div class="lrow"><span class="lk">daily cap</span><span class="lv amount">100,000</span></div>
              </div>
              <div class="lgroup">
                <div class="lgk">lifecycle</div>
                <div class="lrow"><span class="lk">valid until</span><span class="lv">2025-12-31</span></div>
                <div class="lrow"><span class="lk">signer role</span><span class="lv">local_dev <span class="dev-tag">dev signer</span></span></div>
              </div>
            </div>
```

> 现在 ledger 读起来是一份**分条目的授权契约**：身份 / 限额 / 生命周期三组层级分明；限额数值被强调；`local_dev` 被如实标注为 dev signer（中性、不报警）；hash 可复制。临期场景只需给 valid until 的 `.lv` 加 `soon` 类即转 payment 色——无需新色。

---

## 打磨 ③｜`caspilot-vault-detail.html` › `#revokeDialog` (Revoke typed-confirm)

**问题：**
- 用户要输入 `REVOKE`，但确认句把它埋在一段话里（"type **REVOKE** below"），且输入框没有把"待输入的目标 token"和"当前 vault id"放在一起——typed-confirm 的最佳实践是让用户**抄写一个与对象绑定的字符串**，降低误操作。
- 错误态写死必然出现（demo 里 `doRevoke` 永远 `.show`），没有成功路径，读者以为永远失败。
- 没有列出"撤销会影响什么"——破坏性操作应明示后果。
- 输入正确前按钮 disabled，但没有"匹配/不匹配"的即时反馈。

**打磨点：**
- 把确认目标改为与 vault 绑定的字符串 `revoke vault_7af3…`（抄写更具体、更难误触），并在 label 旁显示要抄的目标 + 一键示意。
- 输入框加即时匹配指示（匹配时边框转 executed 绿、显示 ✓）。
- 加一个简短"后果"列表（mono，2 条）。
- 脚本支持成功路径：成功后关闭 dialog + success toast；保留服务端错误回显作为另一分支（用 `demoFail` 开关示意）。

**替换/追加 dialog CSS：**

```css
.dialog .dconseq{list-style:none;margin:0 0 18px;border:1px solid var(--hairline);border-radius:9px;overflow:hidden}
.dialog .dconseq li{display:flex;align-items:flex-start;gap:9px;font-family:var(--mono);font-size:11px;color:var(--text-muted);padding:9px 12px;border-bottom:1px solid var(--hairline);line-height:1.5}
.dialog .dconseq li:last-child{border-bottom:none}
.dialog .dconseq li svg{width:13px;height:13px;stroke:var(--payment);fill:none;flex-shrink:0;margin-top:1px}
.confirm-target{display:flex;align-items:center;justify-content:space-between;gap:8px;background:var(--surface-2);border:1px solid var(--hairline);border-radius:7px;padding:7px 10px;margin-bottom:8px}
.confirm-target .ct-str{font-family:var(--mono);font-size:12px;color:var(--text)}
.confirm-target .ct-copy{font-family:var(--mono);font-size:10px;color:var(--accent);cursor:pointer;background:none;border:none}
.dialog input.match{border-color:var(--executed)!important;box-shadow:0 0 0 3px rgba(22,163,74,.16)!important}
.input-wrap{position:relative}
.input-wrap .ok-check{position:absolute;right:11px;top:50%;transform:translateY(-50%);width:15px;height:15px;stroke:var(--executed);fill:none;opacity:0;transition:opacity 140ms var(--ease)}
.input-wrap.matched .ok-check{opacity:1}
```

**替换整个 `#revokeDialog` 的 `.dialog-body` + `.dialog-foot` HTML：**

```html
  <div class="dialog-body">
    <div class="dicon"><svg viewBox="0 0 24 24" stroke-width="1.8"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg></div>
    <h2>Revoke this vault?</h2>
    <p class="dtext">This permanently revokes the delegated authority of <b>vault_7af3…</b>. It cannot be undone.</p>
    <ul class="dconseq">
      <li><svg viewBox="0 0 24 24" stroke-width="1.8"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>In-flight intents scoped to this vault will fail.</li>
      <li><svg viewBox="0 0 24 24" stroke-width="1.8"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>No further debits can be routed through it.</li>
    </ul>
    <label for="revokeInput">Type to confirm</label>
    <div class="confirm-target">
      <span class="ct-str" id="ctStr">revoke vault_7af3…</span>
      <button class="ct-copy" onclick="copyTarget()">copy</button>
    </div>
    <div class="input-wrap" id="revokeWrap">
      <input id="revokeInput" spellcheck="false" placeholder="revoke vault_7af3…" oninput="checkRevoke()">
      <svg class="ok-check" viewBox="0 0 24 24" stroke-width="2"><path d="M5 12l5 5 9-11"/></svg>
    </div>
    <div class="ierr" id="revokeErr">
      <svg viewBox="0 0 24 24" stroke-width="1.8"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>
      <div class="ia-code">revokeVault 409: vault has in-flight intents — settle or cancel them first</div>
    </div>
  </div>
  <div class="dialog-foot">
    <button class="btn btn-secondary" onclick="closeRevoke()">Cancel</button>
    <button class="btn btn-danger grow" id="revokeBtn" disabled onclick="doRevoke(this)">Revoke vault</button>
  </div>
```

**替换脚本里的 revoke 逻辑（支持匹配指示 + 成功/失败两路）：**

```js
const REVOKE_TARGET='revoke vault_7af3…';
function copyTarget(){navigator.clipboard&&navigator.clipboard.writeText(REVOKE_TARGET);}
function checkRevoke(){
  const v=document.getElementById('revokeInput').value.trim();
  const ok=v===REVOKE_TARGET;
  document.getElementById('revokeBtn').disabled=!ok;
  document.getElementById('revokeInput').classList.toggle('match',ok);
  document.getElementById('revokeWrap').classList.toggle('matched',ok);
}
const demoFail=true; // flip to false to see the success path
function doRevoke(btn){
  document.getElementById('revokeErr').classList.remove('show');
  const o=btn.innerHTML;btn.disabled=true;btn.innerHTML='<span class="spinner danger"></span>Revoking…';
  setTimeout(()=>{
    btn.disabled=false;btn.innerHTML=o;
    if(demoFail){
      document.getElementById('revokeErr').classList.add('show'); // server message surfaced
    }else{
      closeRevoke();
      // success: flip header badge to EXPIRED + toast (toast markup optional)
      const b=document.querySelector('.header-left .badge');
      b.className='badge expired';b.innerHTML='<span class="bdot"></span>REVOKED';
    }
  },1500);
}
```

> Revoke 现在符合 typed-confirm 最佳实践：抄写**与对象绑定**的字符串（`revoke vault_7af3…`，可一键复制）、实时匹配反馈（绿框 + ✓）、明示后果、且有真实的成功/失败两条路径——失败回显服务端 409 原文，成功把 header badge 翻为 REVOKED。破坏性仍用 failed 红，确认达成的反馈用 executed 绿，无新增装饰色。

---

三处打磨遵循全站一致判断：**amber 唯一焦点 = SpendMeter 填充（越线让位 payment/failed）；executed 绿只用于"确认达成/匹配成功"（reset 段、typed-confirm 匹配勾、revoke 成功）；payment 用于"需注意但非错误"（临期、后果提示、近上限）；failed 用于破坏性与服务端错误**。全程 hex/amount/timestamp mono，meter 与下方 debit 明细对应成账本，typed-confirm 与对象绑定。`prefers-reduced-motion` 下倒计时不轮询、数字与分段不动画。
