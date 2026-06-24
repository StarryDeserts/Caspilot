# Caspilot 原生 CSPR 浏览器签名 —— 人工测试流程（逐步）

这份文档带你在真实浏览器里，用 Casper Wallet 扩展 **签名并支付** 一笔真实的 casper-test
原生 CSPR 转账，由 CSPR.click 广播，后端 **独立校验链上终局** 后才记为 EXECUTED，
拿到一个 **真实、可在 cspr.live 查询** 的 deployHash。

> 为什么是「原生 CSPR」而不是 CEP-18：你的钱包里本来就有测试网 CSPR，所以这是唯一
> 能真正广播成功的形态。之前用 CEP-18 占位合约包广播会被节点拒绝
> （`-32008 "no such package at hash"`），因为那个包在链上根本不存在。

---

## 0. 前置条件（缺一不可）

- 一个装了 **Casper Wallet 浏览器扩展** 的浏览器，扩展已切到 **casper-test** 测试网。
- **两个账户**（关键）：原生转账必须在 **两个不同的 purse** 之间移动，所以需要
  - **签名账户（sender）**：你用来连接 + 签名 + 付款的账户。
  - **收款账户（receiver）**：一个 **不同的** 公钥——最简单的做法是在 **同一个
    Casper Wallet 里新建第二个账户**。钱从 sender → receiver，**两个账户都还在你钱包里**，
    没有真实损失，金额也很小（2.5 CSPR）。
  > ⚠️ **不能填自己（收款人 = sender）**：源 purse == 目标 purse 会被 Casper 的 mint
  > 在链上回滚（`EqualSourceAndTarget` → 用户侧显示 **"Invalid purse"**），交易虽被打包扣
  > gas 却 **什么都没转**。后端现在会在 **构建阶段就拒绝**（`422 self_transfer_forbidden`），
  > 钱包根本不会弹窗、也不会浪费 gas。
- **签名账户** 里有测试网 CSPR：用水龙头领取，至少准备 **~5 CSPR**
  （转账 2.5 CSPR + gas）。收款账户无需预先充值（原生转账会按需创建该账户）。
  水龙头：<https://testnet.cspr.live/tools/faucet>。
- 记下 **两个公钥**：`01` 开头（ED25519，66 字符）或 `02` 开头（SECP256K1，68 字符）。
  sender 用于连接钱包；receiver 用于第 2 步的 `CASPILOT_NATIVE_RECEIVER` 与第 6 步的 Receiver 框。

---

## 1. 当前服务状态（我已经帮你起好）

| 服务 | 地址 | 状态 |
|---|---|---|
| Web 控制台 | <http://localhost:3001> | ✅ 已启动 |
| API | <http://localhost:8787> | ✅ 已启动，但目前是 **CEP-18 默认策略** 模式 |

`/healthz` 返回 `{"ok":true}`。

> ⚠️ 注意：当前 API 跑的是 **CEP-18 默认策略**（`DEFAULT_DEMO_POLICY`）。原生 CSPR 转账
> 走的是 **单独的 motes 计价策略**（`nativeDemoPolicy`），它的 allowlist 只放行 **一个**
> 收款公钥。所以在真正广播之前，**必须** 用你的公钥把 API 重启成原生模式（见第 2 步），
> 否则原生意图会在 `validate-policy` 那步被拒（REJECTED）。

---

## 2. 关键一步：把 API 重启成原生模式（用 **收款账户** 的公钥）

把 `<收款方公钥>` 替换成第 0 步的 **receiver**（第二个账户的公钥，**不是** 你用来签名的
sender）。这个值必须和后面抽屉里 **Receiver 输入框填的值完全一致**。

```bash
# 先释放 8787 端口（停掉当前 CEP-18 模式的 API）
kill $(lsof -ti:8787) 2>/dev/null

# 用收款方公钥以「原生 + 实时链上 co-sign」模式重启
cd /home/stardust/dev/HackQuest/caspilot/apps/api
CASPILOT_NODE_RPC_URL="https://node.testnet.casper.network/rpc" \
CASPILOT_NATIVE_RECEIVER="<收款方公钥>" \
CASPILOT_DB_PATH=":memory:" \
PORT=8787 \
npx tsx src/index.ts
```

启动日志出现这一行即成功：

```
caspilot-api listening on :8787 (live on-chain co-sign enabled)
```

> 如果你只是想 **先逛逛 UI**（连钱包、看意图列表），不做真实广播，可以跳过第 2 步，
> 直接用我已起好的 API。但只要你要走到第 9 步「签名广播」，就必须先做第 2 步。

---

## 3. 浏览器逐步操作

### 步骤 1 —— 打开控制台
浏览器访问 **<http://localhost:3001/intents>**
（直接进 `/intents`；首页 `/` 是营销页，没有钱包按钮）。
左侧能看到 Caspilot 侧边栏（Dashboard / **Intents** / Vaults / Developers），
右上角能看到 **Connect CSPR.click** 按钮。

### 步骤 2 —— 连接钱包
右上角点 **「Connect CSPR.click」** →
弹出 CSPR.click 账户选择框 → 选 **Casper Wallet** → 在扩展弹窗里 **批准连接**。
连接成功后，按钮变成显示你公钥缩写的样子（如 `01ab…cd34`，带一个小圆点）。

### 步骤 3 —— 进入 Intents 列表
若不在列表页，点左侧导航 **「Intents」**（或地址栏 `/intents`）。
页面标题是 **Intents**。

### 步骤 4 —— 新建意图
右上角点 **「New intent」** 按钮 → 右侧滑出 **New intent** 抽屉。

### 步骤 5 —— 切到原生模式
抽屉里 **「Transfer type」** 处，点 **「Native CSPR」**（默认是「CEP-18 token」）。
切换后，**Token / Contract 两个输入框会消失**，只剩 Agent / Receiver / Amount。

### 步骤 6 —— 填写表单（逐个输入框）

| 字段（标签） | 输入框 id | 填什么 |
|---|---|---|
| **Agent · account-hash (00 + 64 hex)** | `agent` | 任意合法的 `00`+64位hex。可直接粘贴：`00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`（= `00` + 64 个 `a`） |
| **Receiver · public key (01/02 + hex)** | `receiver` | **填收款账户公钥**（第 0 步的 receiver，**必须 ≠ 你的签名账户**；和第 2 步的 `CASPILOT_NATIVE_RECEIVER` **一字不差**） |
| **Network** | （只读 chip） | 锁死为 `casper:casper-test`，无需填 |
| **Amount · motes** | `amount` | 填 `2500000000`（= 2.5 CSPR，casper-test 转账最小值；策略上限 5 CSPR = `5000000000`） |

### 步骤 7 —— 创建
抽屉底部点 **「Create intent」** →
抽屉关闭，列表顶部出现新意图，右下角弹出「Intent created」提示，
并自动跳转到详情页 `/intents/<id>`。

### 步骤 8 —— 校验策略
详情页中部的 **Actions** 面板，此时状态是 **DRAFT**。
点 **「Validate policy」** →
若策略通过，状态变 **POLICY_VALIDATED**（这一步是后端校验，不需要钱包）。

> 如果这里变成 **REJECTED**：多半是 API 没用 **收款方公钥** 重启（还在 CEP-18 模式），
> 或 Receiver 与 `CASPILOT_NATIVE_RECEIVER` 不一致 → 回第 2 步。

### 步骤 9 —— 签名并广播
Actions 面板出现主按钮 **「Sign & submit on testnet (wallet)」**
（钱包已连时可点；没连会灰掉，提示 *Connect a CSPR.click wallet to co-sign this transfer.*）。
点它，状态条依次出现：
1. `Building unsigned transfer…`（后端用你的公钥构建未签名的原生 transfer）
2. `Awaiting wallet signature…`（同时弹出 Casper Wallet 签名窗）

### 步骤 10 —— 钱包批准
在 **Casper Wallet 弹窗** 里点 **Sign / Approve**。
确认内容是一笔 **原生 transfer**、金额 **2.5 CSPR**、收款人是 **你的收款账户**（与签名账户不同）。

### 步骤 11 —— 链上校验
CSPR.click 广播后，状态条变成：
`Broadcast <hash>… — verifying on-chain…`
后端开始轮询 `info_get_deploy` 等待终局（finality）。

### 步骤 12 —— 完成
状态条变成 **`Verified on-chain — intent executed.`**，意图状态变 **EXECUTED**。

### 步骤 13 —— 查看真实链上证据
详情页 **On-chain proof** 面板出现 **真实 deployHash** 和
**「View on testnet.cspr.live」** 链接。点开，在区块浏览器里能看到这笔真实交易。

---

## 4. 预期状态流转一览

```
DRAFT ──(Validate policy)──▶ POLICY_VALIDATED ──(Sign & submit + 钱包批准 + 链上终局)──▶ EXECUTED
```

状态条文案：
`Building unsigned transfer…` → `Awaiting wallet signature…` →
`Broadcast <hash>… — verifying on-chain…` → `Verified on-chain — intent executed.`

---

## 5. 故障排查

| 现象 | 原因 / 处理 |
|---|---|
| 「Sign & submit」按钮灰着点不动 | 钱包没连 → 先做步骤 2 |
| `validate-policy` 返回 **REJECTED** | API 没用 **收款方公钥** 重启（还在 CEP-18 模式），或 Receiver ≠ `CASPILOT_NATIVE_RECEIVER` → 回第 2 步 |
| 「Sign & submit」后报 **`self_transfer_forbidden` (422)** | Receiver 填成了 **签名账户自己** → 原生转账要求收款方 ≠ 签名方。换一个不同的收款账户（同钱包第二个账户），并用它重启 API（第 2 步）+ 改 Receiver 框（步骤 6） |
| 链上回滚 **"Invalid purse"** / `execution_reverted (422)` | 同上：这是自转账（源=目标 purse）才会出现；本次修复后构建阶段就会先挡 `self_transfer_forbidden`。确认收款方 ≠ 签名方 |
| 钱包报 `-32008 "no such package at hash"` | 这是旧 CEP-18 占位包的问题；原生模式不会出现。若出现说明意图没切成 Native CSPR（token 不是 `CSPR`）→ 回步骤 5 |
| 钱包报余额不足 | 领水龙头，确保账户 ≥ ~5 CSPR |
| 端口 8787 被占用起不来 | `kill $(lsof -ti:8787)` 后重试 |
| 只想演示推进、不做真实广播 | POLICY_VALIDATED 下用 **「Mark executed (demo)」** + 在 `Deploy hash (64-hex) · demo fallback` 输入框贴一个 64 位 hex 占位值。**这是 demo 快进，不产生真实链上交易，不要当作真实证明。** |

---

## 6. 诚实声明（重要）

- **只有** 走完步骤 9–13（真钱包签名 + CSPR.click 广播 + 后端 `info_get_deploy` 终局校验）
  得到的 deployHash，才是 **真实、可在 cspr.live 查询** 的链上证据。
- **「Mark executed (demo)」** 填入的 deployHash 是 **占位/合成** 的，不是真实交易；
  对这种意图 **不要** 点「View on testnet.cspr.live」当作真实证明。
- 这一步 **必须由你在装了钱包扩展的真实浏览器里完成**；jsdom / SSR / 自动化测试都无法替代
  真实的钱包弹窗与广播（WSL2 下扩展可用性已由你之前的测试确认）。
