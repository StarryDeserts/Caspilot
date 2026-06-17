# Caspilot Logo 集成方案

把 "heading dial" 这套 logo 落到已交付的 8 个页面里。按**变体 → 落点**组织，每条标明用哪个变体、放在哪个页面的哪个组件、用什么尺寸/配色。

---

## 一、复用资产清单（先抽成可引用的形态）

logo 有三套 viewBox（48 / 32 / 16-favicon），集成时**不要每处手抄坐标**。建议先固化为两种可引用形态：

| 形态                                     | 用途                   | 实现                                                         |
| ---------------------------------------- | ---------------------- | ------------------------------------------------------------ |
| **内联 SVG 组件**（48-viewBox 全细节版） | 所有 UI 内可见的 glyph | 抽成一个 `caspilotGlyph()` 片段 / 模板，靠 `style="--accent;color"` 双变量控制双色 |
| **favicon SVG**（32-viewBox 简化版）     | 浏览器标签页、PWA 图标 | 存为 `favicon.svg`，`<link rel="icon">` 引用                 |

> 关键约束沿用 logo 页结论：**ring = `currentColor`（继承文字色），needle/tip = `var(--accent)`**。这意味着集成时不需要为每个深/浅背景重画——只改外层 `color` 与 `--accent` 两个值。

---

## 二、按页面 / 组件的具体落点

### 1. App Shell（`caspilot-shell.html`）— 侧边栏 wordmark
**当前状态：** `.brand .wordmark` 现在用一个 `.mark-dot`（9×9 amber 圆角方块）+ "Caspilot" 文字。
**替换：** 用 **glyph-only 变体（变体 2）** 换掉 `.mark-dot`，尺寸 **22–24px**，紧跟 12px gap 接 Bricolage 600 文字 → 即 logo 页的**主横向锁定 lockup（变体 1）**。
- 配色：`color:#ECECEE`（继承侧栏文字）、`--accent:#FF5A1F`。
- tagline "autonomy you can audit" 已在侧栏存在 → 直接构成**变体 1b（带 tagline 锁定）**，无需额外处理。
- 影响范围：因为 6 个 app 页（Console / Intents / Intent Detail / Vaults / Vault Detail）共用同一 shell 侧栏，**改一处即全站生效**。

### 2. App Shell — 侧边栏底部 footer
**落点：** `.sidebar-footer` 的 `.env-label` 左侧那个 `.net-dot` 可保留（它是 health 语义绿点，非 logo）。**不在这里放 logo**，避免一个视口出现两个 glyph。

### 3. Landing（`caspilot-landing.html`）— Hero 不放 glyph，但 footer 放
**Hero：** 已有 56px 大标题 + 唯一 amber glow，**不再放 glyph**（会与标题抢焦、且违反"amber 一次"）。
**Footer：** `.footer .fbrand` 现在用 `.md`（8×8 amber 方块）+ "Caspilot"。→ 换成 **glyph-only 变体 16–18px** + 文字 = 小号横向锁定。
- 配色：`color:#ECECEE`、`--accent:#FF5A1F`。
**Footer CTA 区：** 不放 glyph（该区已有 amber CTA + glow）。

### 4. Developers（`caspilot-developers.html`）— 独立 top bar
**当前状态：** `.topbar .wordmark` 用 `.mark-dot` + 文字（这是独立于 app shell 的自有顶栏）。
**替换：** 用 **glyph-only 20px** + 文字 = 主横向锁定（变体 1），左上角。
**doc-footer：** `.doc-footer .fbrand` 的 `.md` 方块同样换成 **glyph 16px** + 文字。

### 5. 全站 — 浏览器标签 favicon
**落点：** 8 个 HTML 文件的 `<head>` 各加：
```html
<link rel="icon" type="image/svg+xml" href="favicon.svg">
```
用 **favicon 变体（变体 3，32-viewBox 简化版，stroke 4、短梭针、无枢轴点）**。
- favicon.svg 内部**固定深色画布逻辑**：因为浏览器标签背景不可控，favicon 应自带背景或用足够对比——建议 favicon.svg 里 ring 用 `#ECECEE`、needle 用 `#FF5A1F`、配一个 `#0A0A0B` 圆角底，确保浅色标签栏下仍清晰。

### 6. WalletButton / NetworkPill 等小组件 — **不放 logo**
这些是功能控件，放 glyph 会稀释品牌锚点。保持现状。

### 7. 空状态 / 错误大图 — 可选品牌化（克制）
**落点：** 各页 EmptyState（Intents / Vaults / Recent intents）和 NotFound 的 `.eicon` / `.nficon` 当前是功能图标（列表线、vault 框）。
**建议：不替换**——这些图标有具体语义（"列表""vault"），换成 logo 反而失去信息。**唯一例外**：如果要做一个"全空首屏 / 加载首屏"的品牌时刻，可用 **glyph-only 64px + 页面级 amber glow** 居中——但每个视口仍只一次。

---

## 三、双色 / 反转的统一控制

集成后**只有两个 token 需要随上下文切换**，不需要重画 SVG：

| 上下文                                              | `color`（ring） | `--accent`（needle/tip）              |
| --------------------------------------------------- | --------------- | ------------------------------------- |
| 深色 UI（app/landing/docs 默认）                    | `#ECECEE`       | `#FF5A1F`                             |
| 浅色卡 / 浅色背景（如 on-light 演示、未来浅色导出） | `#0A0A0B`       | `#FF5A1F`                             |
| 单色受限场景（水印 / 印章 / 禁用态）                | 单一墨色        | 同 `currentColor`（amber 收敛为墨色） |

把 glyph 抽成组件后，这就是给组件传两个 CSS 变量的事。

---

## 四、"一个视口只出现一次 glyph，amber 仍只锚定一次焦点"的校验

这是集成时最容易破坏的规范。逐场景核对：

- **app 页**：侧栏 lockup 是唯一 glyph；其 needle 是该处唯一 amber。页面正文里的 amber（主 CTA / cap bar / meter / 当前 step）属于**功能焦点**，与侧栏 glyph 在空间上分离（侧栏 vs 内容区），不冲突——但要确保**不在同一视觉簇里堆两个 amber**。侧栏 glyph 体量小、靠左上，内容区 CTA 靠右上，天然分开。✓
- **landing**：Hero 无 glyph（amber 给 glow+CTA）；footer 有小 glyph（amber 给 needle），二者隔了整页，不同时入视口。✓
- **developers**：top bar glyph（amber needle）+ 同栏右侧 "Launch console"（amber CTA）会**同时入视口且都带 amber** —— ⚠️ 唯一需要裁决的冲突点。

**对 developers top bar 的裁决：**
top bar 里 glyph 的 amber needle 与 Launch console 的 amber 实底按钮同框。两种解法：
- **方案 A（推荐）**：top bar 的 glyph **用 mono 变体（变体 4，needle 也走 currentColor=#ECECEE）**，把唯一 amber 让给 Launch console CTA。品牌识别靠 C 形 bezel + lance 形状仍然成立，只是此处不点亮 needle。
- 方案 B：保留彩色 glyph，把 Launch console 改为 secondary（outline）样式——但这会削弱主 CTA，不划算。

→ 采用方案 A：**developers top bar 用单色 glyph，amber 留给 CTA**。这也正是 logo 页"变体 4 monochrome"存在的用途。

---

## 五、落地顺序（最小改动、最大覆盖）

1. **抽组件**：把 48-viewBox glyph 固化为一个可传 `color` / `--accent` 的内联 SVG 片段；把 32-viewBox 简化版导出为 `favicon.svg`。
2. **改 app shell 侧栏**（`.brand`）：`.mark-dot` → glyph 22px。一处改动覆盖 5 个 app 页。
3. **改 developers top bar**：`.mark-dot` → **单色 glyph 20px**（方案 A）；doc-footer `.md` → glyph 16px。
4. **改 landing footer**：`.fbrand .md` → glyph 16px。
5. **全站 8 文件**加 `<link rel="icon" href="favicon.svg">`。
6. **校验**：逐页确认每个视口 glyph ≤1、amber 焦点 ≤1（developers 已用单色 glyph 化解）。

---

## 六、明确不放 logo 的地方（避免过度品牌化）

- WalletButton / NetworkPill / HealthDot —— 功能控件
- StateBadge / FSM stepper 节点 —— 状态语义，禁止混入品牌
- 表格行 / KV ledger —— 数据区
- EmptyState / NotFound 的语义图标 —— 保留信息性图标
- 任何已经有 amber 功能焦点的紧邻位置 —— 防双 amber

---

**一句话总结：** logo 的主战场是 **app shell 侧栏（一改覆盖 5 页）+ developers 独立 top bar + landing/docs 的 footer + 全站 favicon**；双色靠 `color`/`--accent` 两个变量切换不重画；唯一的 amber 冲突在 developers top bar，用**单色 glyph 变体**让位给 CTA 解决；状态徽章、功能控件、语义图标一律不碰，确保 glyph 与 amber 在每个视口都只锚定一次。