下面是 **`caspilot-logo.html`** 的 "refine next" 三处单独打磨。每处说明改的是 SVG 里哪些坐标 / 哪个变体，给可直接替换的片段，并解释取舍。

---

## 打磨 ①｜needle 角度 + 长度（所有 48×48 变体的 `<polygon>` 指针）

**问题：**
- 当前指针沿**纯水平轴（0°）**穿出，与 ring 缺口中线重合——读起来像"指针卡在缺口里"，少了"罗盘正在指向某个航向"的动态感。
- 菱形尾端就落在圆心，尾翼太短，不够"指南针式平衡针"（前长后短的 lance）。
- 针尖 x=44 几乎贴到 viewBox 边缘，clear-space 被吃掉。

**打磨点：**
- 指针**上抬约 12°**（指向右上），让它明确"穿过缺口指向一个航向"，而非躺平。这也呼应"pilot setting a heading"。
- 改为**前长后短的平衡 lance**：尾翼伸到圆心另一侧一点点（短），前锋更长更尖。
- 针尖收到 x≈42.5，给右侧留出 clear-space；tip tick 跟随针尖新位置。

**几何**（viewBox 48，圆心 24,24，约 −12° 即向右上）：
- 针尖：`(42.3, 20.6)`
- 两侧腰（前段较窄、视觉更尖）：`(28.2, 22.0)` 与 `(26.6, 26.6)`
- 尾尖（圆心另一侧的短尾）：`(20.8, 25.7)`
- tip tick 垂直于针轴、贴针尖外侧。

**替换所有 48×48 变体里的指针三件套**（变体 1 / 1b / 2 / 5 / clear-space；mono 变体见打磨说明末尾）：

```html
            <!-- compass needle: balanced lance, ~12° up through the gap -->
            <polygon points="42.3,20.6 28.2,22.0 24,24 26.6,26.6 20.8,25.7" fill="var(--accent)"/>
            <circle cx="24" cy="24" r="2.1" fill="currentColor"/>
            <!-- tip tick, square to the needle axis -->
            <rect x="40.6" y="18.4" width="2" height="3.4" rx="1" transform="rotate(-12 41.6 20.1)" fill="var(--accent)"/>
```

> 说明：polygon 五点构成"前长后短"的不对称 lance——`42.3,20.6` 是上抬的针尖，`24,24` 是圆心枢轴处的腰线收束，`20.8,25.7` 是越过圆心的短尾。tip tick 用 `rotate(-12 …)` 与针轴对齐，不再是水平小条。
>
> **mono 双色变体（变体 4）** 同样替换这三件，但把两处 `fill="var(--accent)"` 改成 `fill="currentColor"`（保持单色），坐标完全一致。

---

## 打磨 ②｜ring 缺口位置 + 宽度（所有 48×48 变体的 `<path>` 弧）

**问题：**
- 当前缺口端点 `34.4,13.2 ↔ 34.4,34.8`，朝右开口约 56°，**偏宽**——C 的开口太大，远看接近"半环"，C 的字母识别度下降；且缺口上下对称居中于水平轴，而指针已上抬 12°，缺口与指针不再呼应。
- 缺口要"框住"上抬的指针：开口应略微**偏向右上**，让指针正好从开口"飞出"。

**打磨点：**
- 缺口收窄到约 **44°**（更像字母 C，bezel 更完整、更"仪表")。
- 开口中线随指针上抬，整体**向上偏 ~10°**，使指针穿过开口正中。
- 半径 16、stroke 3 不变（保持与字重协调）。

**几何**（圆心 24,24，r=16，缺口中线 ≈ −10°，半角 ≈ 22°）：
- 缺口上端点（约 −32°）：`x = 24 + 16·cos(32°) ≈ 37.6`，`y = 24 − 16·sin(32°) ≈ 15.5`
- 缺口下端点（约 +12°）：`x = 24 + 16·cos(12°) ≈ 39.7`，`y = 24 + 16·sin(12°) ≈ 27.3`
- 大弧从下端点逆时针扫到上端点（`A 16 16 0 1 0`，sweep 0 保持外圈走向）。

**替换所有 48×48 变体里的 ring path：**

```html
            <!-- instrument bezel: open ring (C), ~44° gap angled to upper-right -->
            <path d="M39.7 27.3 A16 16 0 1 0 37.6 15.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
```

> 说明：缺口从 56°→44°，C 更可读、bezel 更完整；开口偏右上正好让 ①里上抬 12° 的指针居中穿出——环与针在同一航向轴上，"heading dial"的因果关系成立。`round` 端帽让缺口两端是干净的圆头，像真实仪表 bezel 的开口。

---

## 打磨 ③｜favicon 16px 易读性（变体 3 的 32-viewBox 简化 glyph）

**问题：**
- 16px 下 ring（stroke 3.5 / viewBox 32 → 实际 ~1.75px）偏细，圆心 `r=2` 的枢轴点和短针 polygon 会**糊成一团**，C 的缺口在 16px 几乎看不出。
- tip tick 已删，但针仍是个小三角，16px 下与枢轴点黏连。

**打磨点：**
- 把 favicon 简化为**"缺口 C + 一根从缺口射出的实心短梭"**，去掉独立枢轴圆点（在 16px 它只会变噪点）——让针的尾端直接坐在圆心，形成一个"针根=枢轴"的整体。
- ring stroke 提到 **4**（viewBox 32 → 16px 下 ~2px，清晰可辨），缺口角度同步收到 ~44° 并偏右上（与大 logo 一致）。
- 针做成**更短更宽的梭形**，在 16px 仍是一个明确的"指向右上的尖"，amber 占比足够被看见。
- 同屏继续给 16px 真实尺寸 + 96px 检视。

**几何**（viewBox 32，圆心 16,16，r=11，缺口 ~44° 右上）：
- 缺口上端（约 −32°）：`16+11·cos32 ≈ 25.3`，`16−11·sin32 ≈ 10.2`
- 缺口下端（约 +12°）：`16+11·cos12 ≈ 26.8`,`16+11·sin12 ≈ 18.3`
- 短梭针尖（−10° 方向，约到 r≈11.5）：`(27.3, 14.0)`；腰 `(18.6, 14.6)`/`(17.6, 17.7)`；尾 `(14.6, 17.0)`

**替换变体 3 的两处 favicon SVG（16px 与 96px，内容相同、仅尺寸不同）：**

```html
        <svg width="16" height="16" viewBox="0 0 32 32" role="img" aria-labelledby="t-fav16" style="--accent:#FF5A1F;color:#ECECEE">
          <title id="t-fav16">Caspilot</title>
          <path d="M26.8 18.3 A11 11 0 1 0 25.3 10.2" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
          <polygon points="27.3,14.0 18.6,14.6 16,16 17.6,17.7 14.6,17.0" fill="var(--accent)"/>
        </svg>
```

```html
        <svg width="96" height="96" viewBox="0 0 32 32" role="img" aria-labelledby="t-fav96" style="--accent:#FF5A1F;color:#ECECEE">
          <title id="t-fav96">Caspilot</title>
          <path d="M26.8 18.3 A11 11 0 1 0 25.3 10.2" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
          <polygon points="27.3,14.0 18.6,14.6 16,16 17.6,17.7 14.6,17.0" fill="var(--accent)"/>
        </svg>
```

**同步更新变体 3 的说明文案（`.vnote`）：**

```html
    <p class="vnote">Simplified for 16px: the pivot dot is dropped (it only adds noise that small), the needle becomes a short solid shuttle rooted at center, and the ring stroke is bumped to 4. The C-gap and amber tip stay legible.</p>
```

> 说明：16px 下最致命的是细节黏连——去掉独立枢轴点、把针根直接坐进圆心，让"针=指向"成为一个干净的实心形；stroke 4 保证 ring 在 16px 有足够墨量；缺口/航向与大 logo 一致，缩放体系统一。**注意：USAGE specs 区块里那个 16px 的 min-size 示例**也应替换为这版简化 favicon（同上 16px 片段），保持一致。

---

三处打磨贯穿同一判断：**环（仪表 bezel）= currentColor，针 + tip tick = 唯一 amber；缺口、针、tip 全部对齐到同一条 −10°~−12° 的"航向轴"上，让 ring 与 needle 形成"设定航向"的因果整体**。所有描边保留 `vector-effect="non-scaling-stroke"`，16/32/48 三套 viewBox 各自像素对齐；favicon 在 16px 主动牺牲细节（弃枢轴点、加粗 stroke、短梭针）换取识别度。无渐变、无第二强调色、无旋转脱离缺口轴。
