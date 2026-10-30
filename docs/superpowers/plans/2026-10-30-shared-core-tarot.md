# 塔罗双端原型（共享核心 + H5/微信小程序）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把塔罗占卜流程抽成框架无关的 `@tarot/core`，并分别实现轻量 H5（Vite）和微信原生小程序两个独立渲染端，使用 pipeline 产出的新 78 张牌图。

**Architecture:** npm workspaces monorepo：`packages/core`（纯 ESM JS，状态机+数据）、`packages/h5`（Vite 原生 JS，直接 import 核心源码）、`packages/miniprogram`（微信原生，消费 esbuild 打出的核心 CJS 单文件 bundle）。构建脚本合并牌数据、压缩牌图、打包核心，产物全部提交。

**Tech Stack:** Node 22（内置 `node:test`）、esbuild、Vite 5+、原生微信小程序、macOS `sips`。

**Spec:** `docs/superpowers/specs/2026-10-30-shared-core-tarot-design.md`（实现者必须先读 spec 与本计划）

## Global Constraints

- 核心代码禁止出现 `document`、`window`、`wx`、`fetch`、`XMLHttpRequest`、`setTimeout`（占位 provider 的延时由调用方注入的等待函数实现，见 Task 6）。
- 不引入 React/Vue/Taro/uni-app、不引入任何动画库；H5 动效纯 CSS transition/3D transform。
- 牌图文件名规则：大阿 `${no}_${key}.jpg`（`00_fool.jpg`），小阿 `${花色码}${rank}_${key}.jpg`（`w1_ace.jpg`、`c11_page.jpg`）；花色码 w=权杖 c=圣杯 s=宝剑 p=星币；rank 1–14 = Ace,2–10,侍从,骑士,王后,国王。
- 共享视觉：单主题「暗夜金箔」，深紫黑底 + `#e4b865` 金色，牌背仅一枚 ☾；色板从 `preview/styles.css` 就近取，不逐像素复刻。
- 原型解读必须是本地占位文本，禁止接真实模型；占位文案结尾保留「（以上为原型占位解读）」。
- 每个任务结束都要提交一次 git（Task 1 负责 `git init`）。提交信息用中文短句，不带 Co-Authored-By 之外的模板。
- 生成物（`packages/core/src/data/cards.js`、`packages/h5/public/cards/*.jpg`、`packages/miniprogram/core/index.js`）提交进仓库。
- 不修改 `pipeline/` 与旧 `preview/` 下任何文件。

## Review Focus

这些是测试或流程容易漏掉、但真实使用会出问题的点：

1. **牌义映射错位**：旧 `ar/wa/cu/sw/pe` 编码合入新 id 时张冠李戴（如 ar13 的牌义配到别的牌、花色码 sw 误配成 p）。→ Task 2 的数据测试按 spec 风险条抽查具体牌名与牌义词。
2. **第 4 张牌/过期点击**：抽满 3 张后再点第 4 张、进入揭示页后点牌河、重复点同一张、翻牌后重复点已翻牌。→ Task 5 会话测试覆盖。
3. **解读接口失败**：provider reject 时状态停在 `loading` 导致按钮永久转圈。→ Task 6 测试要求进入 `error` 且可重新请求。
4. **reset 不彻底**：重新占一次后旧问题、旧牌、旧订阅脏数据残留（尤其小程序页面不销毁）。→ Task 5 测试 reset 后快照字段。
5. **小程序牌图跨端取图失败无人察觉**：开发者工具中 `127.0.0.1:5173` 不通时整页空白。→ Task 9 手动验证清单包含「停掉 Vite 时给出明显的图片加载失败提示」（image binderror 置占位样式）。

---

### Task 1: monorepo 脚手架与 git 初始化

**Files:**
- Create: `package.json`（根）、`.gitignore`、空目录占位 `packages/core/src/`、`packages/h5/src/`、`scripts/`、`packages/miniprogram/`
- Modify: 无

**Interfaces:**
- Produces: 根工作区 `tarot-proto`，workspaces 为 `packages/*`；根脚本名被后续所有任务依赖：`build:data`、`build:images`、`build:core`、`build`、`dev:h5`、`test`。

- [ ] **Step 1: 在 `/Users/winniehe/project/Sync-Grid/tarot/` 执行 `git init`，创建 `.gitignore`**

`.gitignore` 内容：`node_modules/`、`.DS_Store`、`dist/`。

- [ ] **Step 2: 创建根 `package.json`**

字段：`name:"tarot-proto", private:true, type:"module"`；`workspaces:["packages/core","packages/h5"]`；devDependencies 仅 `esbuild`（安装时最新稳定版）；scripts：

```
build:data   -> node scripts/build-data.mjs
build:images -> node scripts/resize-images.mjs
build:core   -> node scripts/build-core.mjs
build        -> npm run build:data && npm run build:images && npm run build:core
dev:h5       -> npm run dev -w packages/h5
test         -> node --test scripts/core.test.mjs
```

- [ ] **Step 3: 创建 `packages/core/package.json` 与 `packages/h5/package.json`**

core：`name:"@tarot/core", private:true, type:"module", main:"src/index.js", exports:{"." :"./src/index.js"}`。
h5：`name:"tarot-h5", private:true, type:"module"`，scripts `dev:"vite"`、`build:"vite build"`，devDependencies `vite`（最新稳定）。

- [ ] **Step 4: 在根目录运行 `npm install`，验证工作区链接**

`ls node_modules/@tarot/core` 应存在（symlink）。

- [ ] **Step 5: 提交**

```bash
git add .gitignore package.json package-lock.json packages/*/package.json
git commit -m "chore: 初始化 monorepo（core/h5 workspaces 与构建脚本入口）"
```

---

### Task 2: 牌数据生成脚本（pipeline 元数据 × 旧牌义 → 核心数据）

**Files:**
- Create: `scripts/build-data.mjs`、`scripts/core.test.mjs`（本任务先写其中的数据测试段）、`packages/core/src/data/cards.js`（生成）
- Read-only: `pipeline/cards.json`、`pipeline/minor.json`、`pipeline/cups.json`、`pipeline/swords.json`、`pipeline/pentacles.json`、`preview/cards.js`

**Interfaces:**
- Produces:
  - `@tarot/core` 的数据文件 `src/data/cards.js`，`export const CARDS`（数组）。
  - 单张牌类型（字段名被 Task 4–9 依赖，不可改名）：
    - 大阿：`{ id, arcana:'major', no:number, key, cn, en, img, up, rev, meta:{ornament,motif,mood,shot,subject} }`
    - 小阿：`{ id, arcana:'minor', suit:'wands'|'cups'|'swords'|'pentacles', suitCn, rank:number(1-14), key, cn, en, img, up, rev, meta:{...同} }`
  - 数组顺序：大阿 no 0→21，随后 wands、cups、swords、pentacles 各自 rank 1→14。

- [ ] **Step 1: 在 `scripts/core.test.mjs` 写数据测试（此时文件尚不存在，测试会失败）**

用 `node:test` 的 `test`/`assert`，`import { CARDS } from '../packages/core/src/data/cards.js'`，断言：
1. `CARDS.length === 78`；major 22 张、minor 56 张，四花色各 14 张。
2. 所有 `id` 与 `img` 全局唯一；每条 `up`/`rev` 为非空字符串；每条 `img` 形如 `^[0-9wcs p]...`（用白名单：`/^(?:\d{2}|[wcsp]\d{1,2})_[a-z]+\.jpg$/`）。
3. 顺序抽查：`CARDS[0]` 是 `{id:'00_fool', cn:'愚者'}`；`CARDS[13].id==='13_death'` 且其 `up` 等于旧 preview 中 ar13 的 up 文案（以「一个阶段的结束」开头）；`CARDS[22]` 为 `{id:'w1_ace', suit:'wands', suitCn:'权杖'}`；`CARDS[77]` 为 `{id:'p14_king', cn:'星币国王'}`。
4. 花色错位抽查：定位 `id==='s14_king'`，断言 `up==='公正与权威，判断有分量'`（旧 sw/ki 原文，区别于 w/ki「领导力与开创精神」、p/ki「富足可靠，善于经营积累」）；定位 `id==='s1_ace'`，断言 `up==='清晰的决断，真相划破迷雾'`。
5. 逆位抽查：`00_fool` 的 `rev` 等于旧 ar00 的 rev 原文 `鲁莽或逃避现实，冲动前需看清脚下`。

- [ ] **Step 2: 运行 `npm test` 确认失败**

Expected: FAIL，无法解析 `cards.js`（文件不存在）。

- [ ] **Step 3: 实现 `scripts/build-data.mjs`**

职责：
1. 读 5 个 pipeline JSON（major=cards.json；wands=minor.json；其余同名）。
2. 用 `node:vm` 在沙箱中执行 `preview/cards.js` 全文并追加 `this.__out={MAJORS,SUITS};`，从沙箱取旧牌义；旧文件是浏览器脚本、无模块导出，只允许这样解析，禁止复制其文本到本脚本。
3. 显式映射表（写在脚本里）：
   - major：旧 `ar${no 两位补零}` ↔ pipeline 同 `no`；
   - suit code：`{wa:'wands',cu:'cups',sw:'swords',pe:'pentacles'}`，新文件前缀 `{wands:'w',cups:'c',swords:'s',pentacles:'p'}`；
   - rank：`{ac:1,'02':2,...,'10':10,pa:11,kn:12,qu:13,ki:14}`，与 pipeline 卡的数字 `no` 匹配；
   - `suitCn` 取旧 SUITS 的中文花色名（权杖/圣杯/宝剑/星币）。
4. `meta` 从 pipeline 卡取 `{ornament,motif,mood,shot,subject}`；`en` 取 pipeline 的 `title`；`cn` 大阿取旧 `name`（与 pipeline cn 相同），小阿取 pipeline 的 `cn`（如「权杖首牌」）。
5. `up/rev`：major 取旧 MAJORS 同卡；minor 取旧 `SUITS` 对应 code 的 `ranks[rankCode]` 二元组。
6. 脚本内做数量断言：合并出 78 张、id 无重复、每张都有 up/rev，否则 `process.exit(1)`。
7. 写出 ESM：文件头一行注释 `// 由 scripts/build-data.mjs 生成，请勿手改`，随后 `export const CARDS = ${JSON.stringify(cards,null,2)};`。

- [ ] **Step 4: 运行 `npm run build:data` 再 `npm test`**

Expected: 生成 `packages/core/src/data/cards.js`，测试 PASS。

- [ ] **Step 5: 提交**

```bash
git add scripts/build-data.mjs scripts/core.test.mjs packages/core/src/data/cards.js
git commit -m "feat(core): 生成 78 张牌数据（pipeline 元数据合并正逆位牌义）"
```

---

### Task 3: 牌图压缩脚本（sips）

**Files:**
- Create: `scripts/resize-images.mjs`、`packages/h5/public/cards/`（78 个输出文件）

**Interfaces:**
- Produces: `packages/h5/public/cards/<同名>.jpg`，被 Task 8 的 `<img src="/cards/...">` 与小程序开发期 `http://127.0.0.1:5173/cards/...` 共同依赖。

- [ ] **Step 1: 实现 `scripts/resize-images.mjs`**

用 `node:child_process` 的 `execFileSync` 调 `/usr/bin/sips`（先 `ls /usr/bin/sips` 确认存在）：
1. 读 `pipeline/output/` 全部 `.jpg`，断言 78 个；
2. 确保输出目录存在（`fs.mkdirSync(...,{recursive:true})`）；
3. 每张执行 `sips --resampleWidth 624 --setProperty formatOptions 75 <in> --out <out>`（width 大于原图则不放大；原图即 1664 宽，安全）；
4. 结束后再次列输出目录，断言仍为 78 个文件。

- [ ] **Step 2: 运行 `npm run build:images`，验证产物**

`ls packages/h5/public/cards | wc -l` = 78；
`sips -g pixelWidth packages/h5/public/cards/00_fool.jpg` 宽为 624；
`du -sh packages/h5/public/cards` 总量 ≤ 8MB（若超出，下调 formatOptions 到 65 重跑，并在脚本注释记录实际取值）。

- [ ] **Step 3: 提交**

```bash
git add scripts/resize-images.mjs packages/h5/public/cards
git commit -m "chore: 压缩 78 张牌图到 624px 供双端原型使用"
```

---

### Task 4: 核心 — 洗牌、牌阵、共享文案

**Files:**
- Create: `packages/core/src/deck.js`、`packages/core/src/spread.js`、`packages/core/src/content.js`
- Modify: `scripts/core.test.mjs`（追加测试段）

**Interfaces:**
- Consumes: `CARDS`（Task 2）。
- Produces:
  - `shuffleDeck(cards, rng) -> Array<{card, reversed:boolean}>`：Fisher–Yates；`rng: () => number`，默认 `Math.random`；每张的 `reversed` 也由同一次 rng 序列决定（交换后再调一次 `rng()<0.5`）。
  - `THREE_CARD_SPREAD = { id:'past-present-future', count:3, labels:['过去','现在','未来'] }`
  - `PRESET_QUESTIONS = ['我们最近的感情关系走向如何？','目前手上的工作／项目发展如何？','近期财务状况需要注意什么？','我现在最需要觉察的内在课题？']`（沿用旧 preview，含全角斜杠）。

- [ ] **Step 1: 在 core.test.mjs 追加测试**

1. 确定性 rng（固定数组循环返回值）下，两次 `shuffleDeck(CARDS, rngFactory())` 结果逐张相等（id 与 reversed）；换一组种子结果不同。
2. 结果 78 张、id 不重复、reversed 全为 boolean。
3. 常量断言：`THREE_CARD_SPREAD.count===3`、labels 为过去/现在/未来；`PRESET_QUESTIONS.length===4`。

- [ ] **Step 2: 运行测试确认新段失败**（导入的模块尚不存在）

- [ ] **Step 3: 实现三个文件**

`deck.js` 仅含 Fisher–Yates 与 reversed 标记；`spread.js`/`content.js` 仅常量。

- [ ] **Step 4: `npm test` 全绿后提交**

```bash
git add packages/core/src/deck.js packages/core/src/spread.js packages/core/src/content.js scripts/core.test.mjs
git commit -m "feat(core): 洗牌算法、三牌阵与预设问题"
```

---

### Task 5: 核心 — 会话状态机

**Files:**
- Create: `packages/core/src/session.js`
- Modify: `scripts/core.test.mjs`（追加测试段）

**Interfaces:**
- Consumes: `CARDS`、`shuffleDeck`、`THREE_CARD_SPREAD`。
- Produces: `createSession(options)`，options `{ cards=CARDS, spread=THREE_CARD_SPREAD, rng=Math.random }`。
  - `getState()` / `subscribe(fn): () => void`；每次状态变更生成**新的顶层 state 对象**并同步通知所有订阅者（通知在方法返回前完成）。
  - 方法与允许的调用时相：

| 方法 | 时相约束 | 成功效果 / 返回 |
|---|---|---|
| `setQuestion(q)` | idle | 裁剪后存 `question`（`String(q).trim().slice(0,80)`）；返回 undefined |
| `start()` | idle 且 question 非空 | → shuffling；生成 `river`（78 项 `{card,reversed}`，顺序即 shuffleDeck 结果）；返回 true。问题为空返回 false 且状态不变 |
| `finishShuffle()` | shuffling | → picking |
| `pick(riverIndex)` | picking，未满，index 未选 | 追加 `{riverIndex, card, reversed}`；返回 true，否则 false |
| `unpick(riverIndex)` | picking | 移除该项；返回是否移除过 |
| `confirmPicks()` | picking 且 picks 数 === spread.count | → revealing；返回 true，否则 false |
| `flip(position)` | revealing | 把 `flipped[position]` 置 true；返回本次是否新翻（已翻返回 false） |
| `requestReading(provider)` | revealing 且 3 张全翻 | 置 `readingStatus:'loading'`，await provider 后 `'ready'`+`readingText`；失败 `'error'`；返回 Promise |
| `reset()` | 任意 | 回到初始 idle 快照（question/river/picks/flipped/reading 全清空，phase='idle'），通知一次 |

  - state 形状：`{ phase, question, river, picks, flipped:[bool,bool,bool], readingStatus, readingText }`，初值 `phase:'idle', question:'', river:[], picks:[], readingStatus:null, readingText:''`。
  - `picks` 元素即 `{riverIndex, card, reversed}`；位置由数组下标决定（第 1 张=过去）。

- [ ] **Step 1: 在 core.test.mjs 追加状态机测试**

用确定性 rng，覆盖：
1. 完整快乐路径：start→finishShuffle→pick 3 个 index→confirmPicks→逐张 flip→（reading 在 Task 6 测）；各步 phase 值正确。
2. start 空问题返回 false、phase 不变。
3. 抽第 4 张返回 false 且长度仍 3；重复 pick 同一 index 返回 false；unpick 后可补选新 index；picks 顺序就是选择顺序。
4. 非 picking 时相调 pick/confirmPicks 返回 false 且不抛错；未抽满 confirmPicks 返回 false。
5. 未到 revealing 调 flip 返回 false；重复 flip 同位置第二次返回 false。
6. reset 后 state 与初始快照逐字段相等（用一个新会话的初始 state 做深比较），且仍可重新走完整流程。
7. 订阅计数：连续 5 次合法变更，订阅函数被调用恰好 5 次，且最后一次收到的是最新 state；`subscribe` 返回的取消函数生效后不再收到通知。
8. 每次通知的 state 是新对象（`!==` 上一次），但未变更的 `river` 在 start 之后引用保持稳定。

- [ ] **Step 2: 运行确认失败，然后实现 `session.js`**

内部用闭包保存 state，一个 `set(patch)` 辅助完成对象替换与通知；无任何 DOM/定时器 API。

- [ ] **Step 3: `npm test` 全绿后提交**

```bash
git add packages/core/src/session.js scripts/core.test.mjs
git commit -m "feat(core): 占卜会话状态机（问卜-抽牌-揭示-解读-重置）"
```

---

### Task 6: 核心 — 本地占位解读 provider 与统一出口

**Files:**
- Create: `packages/core/src/reading.js`、`packages/core/src/index.js`
- Modify: `scripts/core.test.mjs`（追加测试段）

**Interfaces:**
- Produces:
  - `createLocalReadingProvider({ wait=null, delay=1500 }={})`：返回 `{ generate(ctx) }`。核心自身不出现 `setTimeout`：`wait` 为 null 时立即返回文本；渲染端注入 `wait: ms => new Promise(r => setTimeout(r, ms))` 获得 1.5s 「凝神」延时（H5/小程序两边各自注入）。
  - `ctx = { question, spread, picks }`，`picks` 元素同 state（`{position?}` 不需要——下标即位置；provider 内部用 `spread.labels[i]`）。
  - 返回文本格式（换行用 `\n`，内容必须逐字满足测试）：
    ```
    针对你的问题「{question}」，三张牌诉说着这样的流动：

    【过去｜{cn}·{正位|逆位}】{up|rev}
    【现在｜...】...
    【未来｜...】...

    综合来看，牌面邀请你正视当下的处境，并把觉察化为下一步的具体行动。

    （以上为原型占位解读）
    ```
  - `src/index.js` 导出：`CARDS`、`PRESET_QUESTIONS`、`THREE_CARD_SPREAD`、`shuffleDeck`、`createSession`、`createLocalReadingProvider`。

- [ ] **Step 1: 在 core.test.mjs 追加测试**

1. `wait:async()=>{}`、`delay:0` 的 provider，喂入构造的 ctx（question「测试问题」，三张 picks，其中第 2 张 `reversed:true`），返回文本：开头与结尾固定句逐字相等；三张牌各出现一行，逆位那张行内含「·逆位」和该卡 `rev` 文案。
2. 与状态机联动：全翻后 `await session.requestReading(provider)`，`readingStatus==='ready'`，`readingText` 同上且包含问题；未全翻时调用返回的 Promise 结束后状态仍是 `null`（方法应直接 return，不置 loading）。
3. 失败路径：provider `generate` 抛错（wait 立即 resolve）时，`readingStatus==='error'`、`readingText===''`，且再次请求成功 provider 后能回到 `ready`（可恢复）。
4. loading 期间状态确为 `'loading'`（用一个手动控制的 wait promise 在 resolve 前断言）。

- [ ] **Step 2: 确认失败后实现 reading.js 与 index.js**

- [ ] **Step 3: `npm test` 全绿后提交**

```bash
git add packages/core/src/reading.js packages/core/src/index.js scripts/core.test.mjs
git commit -m "feat(core): 本地占位解读 provider 与统一导出"
```

---

### Task 7: 核心 CJS bundle（供小程序消费）

**Files:**
- Create: `scripts/build-core.mjs`、`packages/miniprogram/core/index.js`（生成）

**Interfaces:**
- Produces: 一个自包含 CommonJS 文件，`require('../../core/index.js')` 得到与 `@tarot/core` 相同的 6 个导出。

- [ ] **Step 1: 实现 `scripts/build-core.mjs`**

用 esbuild JS API：entryPoints `packages/core/src/index.js`，bundle，`format:'cjs'`，platform 默认即可；outfile `packages/miniprogram/core/index.js`；支持 `--watch`（`process.argv.includes('--watch')` 时用 `context.watch()`）。文件头由 esbuild banner 注入一行 `// 由 scripts/build-core.mjs 生成，请勿手改`。

- [ ] **Step 2: 运行 `npm run build:core`，用 node 冒烟验证**

`node -e "const c=require('./packages/miniprogram/core/index.js'); console.log(c.CARDS.length, typeof c.createSession, typeof c.createLocalReadingProvider)"`
Expected: `78 function function`。再 grep 产物确认无 `document`/`window`/`wx.` 字样。

- [ ] **Step 3: 提交**

```bash
git add scripts/build-core.mjs packages/miniprogram/core/index.js
git commit -m "build: 打包核心 CJS bundle 供微信小程序引用"
```

---

### Task 8: H5 渲染端（Vite 原生 JS，暗夜金箔，纯 CSS 动效）

**Files:**
- Create: `packages/h5/vite.config.js`、`packages/h5/index.html`、`packages/h5/src/main.js`、`packages/h5/src/styles.css`

**Interfaces:**
- Consumes: `@tarot/core` 的 6 个导出；牌图 `/cards/{img}`（Task 3）。
- 视觉/交互契约（被手动验证步骤依赖）：
  - 视口按移动端设计（宽 ≤ 480px 居中，更宽时留暗底），单主题暗夜金箔，无主题切换器、无粒子、无 GSAP。
  - 三个 section 用 `is-active` class 切换：`#screen-ask`、`#screen-draw`、`#screen-reveal`（揭示页内含解读区）。
  - 流程 DOM id 与 main.js 绑定（main.js 只用这些 id/class）：
    - 问卜：`#chips`（4 个 `button.chip[data-q]`，文案取 PRESET_QUESTIONS）、`#questionInput`（textarea maxlength=80）、`#startBtn`（问题为空 disabled）
    - 抽牌：`#drawQuestion`、`#pickCount`、`#tray`（3 个 `.tray-slot`）、`#river`（横向滚动容器，内含 78 个 `.mini-card` 牌背按钮，`data-idx`）、`#confirmBtn`（未满 3 隐藏）
    - 揭示：`#revealQuestion`、`#slots`（3 个 `.slot[data-pos]` 内含 `.slot-label` 与牌）、`#aiBtn`、`#reading`（内含 `#readingText`）、`#againBtn`

- [ ] **Step 1: `vite.config.js`**

`server:{ port:5173, strictPort:true, host:true }`（host 真方便局域网小程序真机取图）。

- [ ] **Step 2: `index.html`**

mobile viewport（`maximum-scale=1.0, user-scalable=no`）、`lang="zh-CN"`、`<div id="app">`、引 `/src/main.js`；标题「塔罗占卜」。结构按上面的契约写全三个 section；牌河 `.mini-card` 与槽位由 main.js 渲染，HTML 里只留容器。

- [ ] **Step 3: 实现 `main.js`**

1. `import { CARDS, PRESET_QUESTIONS, THREE_CARD_SPREAD, createSession, createLocalReadingProvider } from '@tarot/core'`。
2. 创建 session（默认 rng），订阅回调里统一 `render(state)`：切 section、更新计数/槽位/按钮显隐/解读区；问卜页 chips 由 PRESET_QUESTIONS 渲染。
3. start 后一次性渲染 78 个牌背节点（纯 DOM textContent/className 构建，不用 innerHTML 拼用户数据；牌名等进入 DOM 一律 textContent 或 img alt/属性设置）。
4. 选中：给节点加 `.is-picked`（CSS 淡出+缩小落回牌堆观感），槽位显示小金框+序号；取消（再点）走 `unpick`；满 3 显示 `#confirmBtn`，点击 `confirmPicks()` 切揭示页。
5. 揭示页：槽位显示牌背（CSS 3D `rotateY` 翻转结构 `.card3d > .card-back/.card-front`），点击某槽 `flip(pos)`；**只在翻牌瞬间**创建/设置正面 `<img src="/cards/{img}">`，`reversed` 时 front 加 `.reversed`（旋转 180°）；img onerror 给 front 加 `.img-error` 占位底色，不阻塞翻转。
6. 三张全翻显示 `#aiBtn`；点击后按钮隐藏、`#reading` 显示「正在凝神连结牌意…」，调用 `await session.requestReading(createLocalReadingProvider({ wait: ms => new Promise(r => setTimeout(r, ms)) }))`，ready 后填 `readingText`（`white-space:pre-wrap`）；error 时显示可点的重试提示。
7. `#againBtn` → `session.reset()` 并回到问卜页、清空 input 与动态容器。
8. 转场：section 与卡片只用 CSS transition（透明度/位移，建议 0.3–0.5s），不得引动画库。

- [ ] **Step 4: 实现 `styles.css`**

色板从 `preview/styles.css` 取暗夜金箔值（深紫黑底、`#e4b865` 金、暗红点缀）；牌背金色描边 + ☾ 字符；牌河 `display:flex; overflow-x:auto; scroll-snap-type:x proximity`（牌卡 scroll-snap-align:center 可选）；翻牌用 `transform-style:preserve-3d; transition:transform .6s`，`.is-flipped .card3d{transform:rotateY(180deg)}`，`.card-front{transform:rotateY(180deg)}`、`.reversed img{transform:rotate(180deg)}`。

- [ ] **Step 5: 启动 dev server 做手动验证（金丝雀路径 + 边界）**

`npm run dev:h5`，用浏览器开 `http://127.0.0.1:5173/`，逐项验证：
1. 问题空时按钮禁用；chip 与手输都能开始；
2. 洗牌后牌河可横向滑动、选 3 张/取消重选/第 4 张点不动；满 3 出现确认按钮；
3. 翻牌 3D 正常、逆位图倒置、img 只在翻牌时发请求（DevTools Network 过滤 jpg，初始为 0 张，翻几张加载几张）；
4. AI 解读含问题与三张牌名、占位结尾；再占一次后状态干净、可完整再来一轮；
5. 刷新页面无控制台错误；`npm run build -w packages/h5` 通过。

- [ ] **Step 6: 提交**

```bash
git add packages/h5/vite.config.js packages/h5/index.html packages/h5/src
git commit -m "feat(h5): 暗夜金箔轻量原型（牌河选牌-翻牌-占位解读）"
```

---

### Task 9: 微信原生小程序渲染端

**Files:**
- Create:
  - `packages/miniprogram/project.config.json`、`sitemap.json`
  - `packages/miniprogram/app.js`、`app.json`、`app.wxss`
  - `packages/miniprogram/pages/index/index.{js,wxml,wxss,json}`
- Consumes: `packages/miniprogram/core/index.js`（Task 7）、牌图 `{cardBaseUrl}{img}`、H5 dev server。

**Interfaces:**
- 页面 data 字段（WXML 依赖这些名字）：`phase, question, presets, river(数组项 {id, idx}), picks(数组项 {cn,imgUrl,reversed,label,imgError:false}), pickedCount, flipped(3 bool), canConfirm, canRead, readingStatus, readingParagraphs(string[])`。解读文本在 JS 里按 `\n` 拆段存入 `readingParagraphs`（WXML 无法渲染换行符）。
- 事件：`onPreset(e)`（data-q）、`onQuestionInput(e)`、`onStart`、`onCardTap(e)`（data-idx）、`onConfirm`、`onSlotTap(e)`（data-pos）、`onAi`、`onRetry`、`onAgain`。

- [ ] **Step 1: 工程配置**

`project.config.json`：`appid:"touristappid"`（测试号占位，README 注明替换）、`compileType:"miniprogram"`、`setting.urlCheck:false`、`setting.es6:false`（核心已打包）、`miniprogramRoot` 指向 `packages/miniprogram/` 本身（即导入目录就是该目录，miniprogramRoot 写 `"."`）。`app.json`：`pages:["pages/index/index"]`，`window` 深色底标题「塔罗占卜」。`sitemap.json` 用默认 `{"rules":[{"action":"allow","page":"*"}]}`。

- [ ] **Step 2: `app.js` 全局牌图基址**

`globalData.cardBaseUrl = 'http://127.0.0.1:5173/cards/'`；`app.wxss` 放全局深色背景与金色文字基础样式。

- [ ] **Step 3: `pages/index/index.js`**

1. `const core = require('../../core/index.js')`，`onLoad` 中取 `getApp().globalData.cardBaseUrl`，创建 session 与本地 provider（注入 `wait: ms => new Promise(r => setTimeout(r, ms))` 获得 1500ms 延时），保存到页面实例（不放 data）；初始 data 的 `presets` 直接用 `core.PRESET_QUESTIONS`。
2. `subscribe` 回调中做**裁剪 setData**：river 只在 `start()` 后单独 `setData({river: state.river.map((r,i)=>({idx:i,id:r.card.id}))})` 一次；其余变更只 setData 小字段（phase/question/pickedCount/canConfirm/canRead/flipped/readingStatus/readingText；picks 在变动时映射为 `{cn,img,reversed,label:spread.labels[i]}`）。
3. 事件按核心方法一一转发；`onQuestionInput` 直接 `setData({question:e.detail.value})`（不再回灌核心，点开始时 `setQuestion`）。
4. `onAi` 中 `requestReading`，ready/error 由订阅更新 UI；`onRetry` 再调一次。
5. `onUnload` 调订阅取消函数。
6. 拼 img 路径的辅助放 WXML 表达式里不可行（小程序不能函数调用）：picks 映射时直接拼好完整 url 放进 data（字段 `imgUrl`）。

- [ ] **Step 4: WXML/WXSS**

四个 `wx:if` 区块与 H5 流程同构；牌河用 `<scroll-view scroll-x class="river">`，78 个牌背 view（`bindtap="onCardTap" data-idx`，选中加 class）；槽位翻牌结构用两个 view + `transform: rotateY`，`.flipped` class 切换；正面 `<image src="{{item.imgUrl}}" mode="aspectFill">`，`binderror` 给该项加 `imgError` class（setData 到对应 picks 项）显示金色描边占位框；逆位 class 倒置；解读区 `hidden`/`wx:if` 按 readingStatus 切换，文本不换行保留用解码方式：WXML 中 `\n` 不会换行，需在 JS 里把文本按 `\n` split，WXML 用块级 view 循环渲染段落。

- [ ] **Step 5: 手动验证（微信开发者工具，由用户执行——本环境无 DevTools，实现者只能静态保证）**

实现者在交付说明中明确列出，请用户验证：
1. 导入 `packages/miniprogram`，先 `npm run dev:h5` 保证 5173 在跑；
2. 金丝雀路径同 H5 第 5 步的 1–4；
3. Network 面板牌图来自 127.0.0.1:5173；停掉 Vite 时牌面出现描边占位而不是整页崩；
4. 真机预览改用电脑局域网 IP 的说明已写进 README。

- [ ] **Step 6: 提交**

```bash
git add packages/miniprogram
git commit -m "feat(miniprogram): 原生小程序渲染端（消费核心 CJS bundle）"
```

---

### Task 10: README 与全量构建收尾

**Files:**
- Create: `README.md`

- [ ] **Step 1: 写根 `README.md`**

内容（简体中文）：项目三段结构一图说明；环境要求（Node 22、macOS sips、微信开发者工具）；命令四条（install/build/dev:h5/test）；首次运行顺序；小程序导入步骤、AppID 替换、`cardBaseUrl` 改局域网 IP 与关闭域名校验的位置；生成物与重新生成方式；旧 preview 仅为视觉参考、勿改 pipeline。

- [ ] **Step 2: 全量回归**

1. 删除并重建生成物验证幂等：`npm run build` 成功；`npm test` 全绿；
2. `git status` 应只有本次 README 变更（生成物重建后内容一致——若不一致，说明生成不确定，需修复脚本后再提交）；
3. `npm run build -w packages/h5` 通过。

- [ ] **Step 3: 提交**

```bash
git add README.md
git commit -m "docs: 双端原型 README（结构、命令、小程序接入说明）"
```

- [ ] **Step 4: 向用户交付手动验证清单**：H5 浏览器金丝雀路径（Task 8 Step 5）+ 小程序开发者工具清单（Task 9 Step 5），说明小程序部分因环境限制需用户亲自验证。
