下面是 **`caspilot-vaults.html`** 这一个页面里、"refine next" 指定的三处组件打磨。每处标明改的是哪个组件 / 哪些 class，给可直接替换的片段。

---

## 打磨 ①｜`caspilot-vaults.html` › SignFlow 模态 › `.flow-rail` + 各 `.step-pane`

**问题：**
- 进度 rail 只有"填满/未填"两态，看不出**已完成 vs 当前**的区别（done 和 active 的 `i` 都是 `width:100%`，仅靠 label 颜色区分，太弱）。
- step 之间没有"上一步摘要"承接——REVIEW 步用户已看不到自己 DRAFT 填了什么 admin/contract（JSON 里是写死的 `00aa…`，与表单实际输入脱节）。
- rail 在窄屏会把 4 个 label 挤变形。

**打磨点：**
- done 步的 bar 用**实心 executed 绿**（已确认）、active 步用 **amber**（正在进行）、future 用 hairline——三态分明，且符合"绿=已完成、amber=当前授权动作"。
- done 步 label 前加一个 ✓；active 步 label 保持 amber。
- REVIEW 的 JSON 改为由脚本根据表单实际值注入（截断显示），让"你将签署的就是你刚填的"成立。
- 窄屏 label 只留序号。

**替换 rail 相关 CSS：**

```css
.flow-rail{display:flex;gap:8px;padding:16px 22px 4px}
.frail-step{flex:1;display:flex;flex-direction:column;gap:6px}
.frail-step .fbar{height:3px;border-radius:2px;background:var(--hairline);overflow:hidden;position:relative}
.frail-step .fbar i{position:absolute;inset:0;width:0;border-radius:2px;transition:width 280ms var(--ease),background 200ms var(--ease)}
/* done = confirmed (green), active = in-progress (amber) */
.frail-step.done .fbar i{width:100%;background:var(--executed)}
.frail-step.active .fbar i{width:100%;background:var(--accent)}
.frail-step .flbl{font-family:var(--mono);font-size:10px;letter-spacing:.04em;color:var(--text-muted);transition:color 200ms var(--ease);display:flex;align-items:center;gap:4px;white-space:nowrap}
.frail-step.active .flbl{color:var(--accent)}
.frail-step.done .flbl{color:var(--text)}
.frail-step .flbl .ck{display:none;color:var(--executed)}
.frail-step.done .flbl .ck{display:inline}
.frail-step.done .flbl .nx{display:none}
@media(max-width:520px){.frail-step .flbl .word{display:none}}
```

**替换 rail 的 HTML（label 拆出可隐藏的 `.word` + done 的 ✓）：**

```html
  <div class="flow-rail">
    <div class="frail-step active" data-step="1"><div class="fbar"><i></i></div><div class="flbl"><span class="ck">✓</span><span class="nx">1</span> ·&nbsp;<span class="word">DRAFT</span></div></div>
    <div class="frail-step" data-step="2"><div class="fbar"><i></i></div><div class="flbl"><span class="ck">✓</span><span class="nx">2</span> ·&nbsp;<span class="word">REVIEW</span></div></div>
    <div class="frail-step" data-step="3"><div class="fbar"><i></i></div><div class="flbl"><span class="ck">✓</span><span class="nx">3</span> ·&nbsp;<span class="word">CONNECT</span></div></div>
    <div class="frail-step" data-step="4"><div class="fbar"><i></i></div><div class="flbl"><span class="ck">✓</span><span class="nx">4</span> ·&nbsp;<span class="word">SIGN</span></div></div>
  </div>
```

**替换 REVIEW pane 的 JSON 容器（去掉写死值，留注入点）：**

```html
    <div class="step-pane" id="pane-2">
      <div class="json" id="reviewJson"></div>
      <div class="reassure"><svg viewBox="0 0 24 24" stroke-width="1.8"><path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/></svg>This is what you'll sign. The backend never sees your key.</div>
    </div>
```

**在脚本里新增 JSON 注入（并在进入 step 2 时调用）：** 在 `toStep` 的 `if(n===2)` 分支内、`showPane(n)` 之前插入 `buildReview();`，并加这个函数：

```js
function trunc(h){return h.length>10?h.slice(0,4)+'…'+h.slice(-4):h;}
function buildReview(){
  const j=document.getElementById('reviewJson');
  const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
  j.innerHTML=
'<span class="jk">"deploy"</span>: {\n'+
'  <span class="jk">"entry_point"</span>: <span class="js">"create_vault"</span>,\n'+
'  <span class="jk">"network"</span>: <span class="js">"casper:casper-test"</span>,\n'+
'  <span class="jk">"args"</span>: {\n'+
'    <span class="jk">"admin"</span>: <span class="js">"'+esc(trunc(v_admin.value.trim()))+'"</span>,\n'+
'    <span class="jk">"cep18"</span>: <span class="js">"'+esc(trunc(v_contract.value.trim()))+'"</span>,\n'+
'    <span class="jk">"max_single"</span>: <span class="jv">"'+esc(v_single.value.trim())+'"</span>,\n'+
'    <span class="jk">"daily_limit"</span>: <span class="jv">"'+esc(v_daily.value.trim())+'"</span>,\n'+
'    <span class="jk">"valid_until"</span>: <span class="js">"'+esc(v_until.value)+'"</span>\n'+
'  }\n'+
'}';
}
```

> rail 现在三态清晰：走过的步是绿 ✓、当前步是 amber、未到的是灰；REVIEW 里展示的 admin/contract/amount 与用户实际输入一致——"所见即所签"。

---

## 打磨 ②｜`caspilot-vaults.html` › `.vcard` + `.meter` (SpendMeter)

**问题：**
- SpendMeter 只有一条填充，没有**百分比读数**，用户得自己算 218,500 / 250,000 是多少。
- 高用量（87.4%）卡虽然 meter 变色了，但卡片其余部分毫无警示——容易被忽略。
- Expired 卡的 meter 是空的（0%），但视觉上和"刚创建、0 用量"的 Active 卡无法区分。
- 整卡可点，但 hover lift 时没有任何"前进"暗示。

**打磨点：**
- meter 行右侧加 mono 百分比读数，颜色随阈值（≥80% payment、≥90% failed）。
- 高用量卡在 meter 下方补一行极简 mono 提示 "near daily cap"（仅 ≥80% 出现）。
- Expired 卡 meter 轨道用更暗的填充质感（斜纹）表达"已停用"而非"未使用"。
- hover 时卡片右上角浮现一个 chevron，呼应"进入详情"。

**替换/追加 vcard + meter CSS：**

```css
.vcard{position:relative;background:var(--surface);border:1px solid var(--hairline);border-radius:14px;padding:22px;cursor:pointer;transition:transform 200ms var(--ease),border-color 200ms var(--ease);box-shadow:inset 0 1px 0 rgba(255,255,255,.02)}
.vcard:hover{transform:translateY(-4px);border-color:#3a3a42}
.vcard:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.vcard.expired{opacity:.65}
/* hover chevron hint */
.vcard .vgo{position:absolute;top:20px;right:20px;width:16px;height:16px;opacity:0;transform:translateX(-3px);transition:opacity 160ms var(--ease),transform 160ms var(--ease)}
.vcard:hover .vgo{opacity:1;transform:translateX(0)}
.vcard .vgo svg{width:16px;height:16px;stroke:var(--text-muted);fill:none}
.meter-row{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:7px}
.meter-row .mk{font-family:var(--mono);font-size:11px;color:var(--text-muted)}
.meter-row .mv{font-family:var(--mono);font-size:12px;color:var(--text);font-variant-numeric:tabular-nums}
.meter-row .mpct{font-family:var(--mono);font-size:11px;color:var(--text-muted);font-variant-numeric:tabular-nums;margin-left:8px}
.meter-row .mpct.warn{color:var(--payment)}.meter-row .mpct.crit{color:var(--failed)}
.meter{height:5px;background:var(--surface-2);border-radius:3px;overflow:hidden}
.meter-fill{height:100%;width:0;border-radius:3px;background:var(--accent);transition:width 900ms var(--ease),background 300ms var(--ease)}
.meter-fill.warn{background:var(--payment)}.meter-fill.crit{background:var(--failed)}
/* expired track: striped + inert */
.vcard.expired .meter{background:repeating-linear-gradient(45deg,var(--surface-2),var(--surface-2) 4px,var(--hairline) 4px,var(--hairline) 5px)}
.meter-note{font-family:var(--mono);font-size:10px;color:var(--payment);margin-top:6px;display:none}
.meter-note.show{display:block}
```

**给三张卡补 chevron + 百分比读数；以 87.4% 卡为例（其余同构）：** 在每张 `.vcard` 内首行加 `<span class="vgo">…</span>`，并把 meter-row 与 meter 段替换为：

```html
          <span class="vgo"><svg viewBox="0 0 24 24" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg></span>
          <div class="meter-row"><span class="mk">daily cap used</span><span><span class="mv"><span data-roll="218500">0</span> / 250,000</span><span class="mpct" data-pct="87.4">87.4%</span></span></div>
          <div class="meter"><div class="meter-fill" data-pct="87.4"></div></div>
          <div class="meter-note">near daily cap — review before next intent</div>
```

**脚本里 meter 填充时同步百分比读数颜色 + note：** 把片段 3 里 `window.load` 内填充 meter 的那段替换为：

```js
  requestAnimationFrame(()=>document.querySelectorAll('.meter-fill[data-pct]').forEach(f=>{
    const pct=parseFloat(f.dataset.pct);f.style.width=pct+'%';
    const card=f.closest('.vcard');
    const pctEl=card&&card.querySelector('.mpct');
    const note=card&&card.querySelector('.meter-note');
    if(pct>=90){f.classList.add('crit');pctEl&&pctEl.classList.add('crit');note&&note.classList.add('show');}
    else if(pct>=80){f.classList.add('warn');pctEl&&pctEl.classList.add('warn');note&&note.classList.add('show');}
  }));
```

> SpendMeter 现在给出绝对值 + 百分比 + 越线警示三层信息；阈值色只活在 meter/百分比/note 里，不污染整卡；Expired 用斜纹轨道与 "0 用量的 Active" 明确区分。amber 仍只在低用量 meter，越线即让位给 payment/failed。

---

## 打磨 ③｜`caspilot-vaults.html` › step 3 CONNECT › `.guard-note` 文案 + 结构

**问题：**
- 当前 guard-note 是一段话，把"拒用私钥""只传 detached 签名"混在一起，judges 一眼抓不到**这是结构性保证而非口头承诺**。
- 没有把保证拆成可逐条核对的项，与 landing 页"guarantees not promises"的调性不一致。
- 文案 "refuses to use it" 略被动，不够"accountable"。

**打磨点：**
- 把 guard-note 升级为带标题的小卡 + 两条可核对项（盾 ✓ 图标），语气改为主动、字面、可验证。
- 标题用 mono kicker "wallet guard"，与仪表质感统一。
- 措辞贴合系统约束：私钥/`CSPR_CLOUD_KEY` 永不离开钱包；后端只收到 detached 签名。

**替换 guard-note CSS：**

```css
.guard-note{background:var(--surface-2);border:1px solid var(--hairline);border-radius:10px;padding:14px 16px;margin-top:20px;text-align:left}
.guard-note .gkick{font-family:var(--mono);font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;display:flex;align-items:center;gap:7px;margin-bottom:10px}
.guard-note .gkick svg{width:14px;height:14px;stroke:var(--accent);fill:none}
.guard-line{display:flex;align-items:flex-start;gap:9px;font-family:var(--mono);font-size:11px;color:var(--text-muted);line-height:1.6;padding:5px 0}
.guard-line svg{width:13px;height:13px;stroke:var(--executed);fill:none;flex-shrink:0;margin-top:2px}
.guard-line b{color:var(--text);font-weight:500}
```

**替换 step 3 的 guard-note HTML：**

```html
      <div class="guard-note">
        <div class="gkick"><svg viewBox="0 0 24 24" stroke-width="1.8"><path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/><path d="M9 12l2 2 4-4"/></svg>wallet guard · enforced</div>
        <div class="guard-line"><svg viewBox="0 0 24 24" stroke-width="2"><path d="M5 12l5 5 9-11"/></svg><span>Your private key and <b>CSPR_CLOUD_KEY</b> never leave the wallet. If a provider tries to surface either, Caspilot <b>refuses the connection</b> — it does not proceed.</span></div>
        <div class="guard-line"><svg viewBox="0 0 24 24" stroke-width="2"><path d="M5 12l5 5 9-11"/></svg><span>Only a <b>detached signature</b> crosses the wire. The backend signs nothing and stores no key material.</span></div>
      </div>
```

> 文案从"一段安抚话"变为**两条可核对的结构性保证**：主动语态（"refuses the connection — it does not proceed""signs nothing"），mono 呈现，与 landing 的安全 band 同调。amber 只用于 guard kicker 的盾图标（标识"这是受保护的环节"），核对勾用 executed 绿。

---

三处打磨贯穿同一判断：**amber 严格锚定"当前进行中的授权动作"（active step rail、主按钮、低位 meter、guard 盾标）；已完成用 executed 绿（done step、核对勾）；越线警示用 payment/failed，且只活在 meter / 百分比 / note 这些仪表里**。全程 hex/amount/signature 用 mono，REVIEW 的 JSON 与表单实际输入一致，保证"所见即所签"。`prefers-reduced-motion` 下 rail 填充、数字滚动、脉冲全部降级为即时。
