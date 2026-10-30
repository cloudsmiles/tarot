# 塔罗双端原型设计：共享核心 + H5/微信小程序渲染分离

日期：2026-10-30
状态：待确认

## 1. 意图与背景

78 张 AI 生成的塔罗牌插画已由流水线产出（`pipeline/output/`，1664×2496，共 65MB），需要在产品中使用。

现有 `preview/` 是一个纯 H5 原型（原生 JS + GSAP），业务逻辑（牌组、洗牌、抽牌规则、解读文案）与 DOM 动画深度耦合在 `app.js` 中，无法被小程序复用。

现在要：

1. **小程序代码与 H5 代码分离** —— 两端展示形态不同，渲染层各自独立；
2. **构建共同的底座（控制面板）** —— 牌组数据、洗牌抽牌、牌阵、状态流转、解读接口等功能逻辑只写一份，两端共享；
3. **以此为基础做原型** —— 先跑通流程，不做重渲染效果。

旧 `preview/` 原样保留，作为视觉与交互参考，不做改动。

## 2. 目标 / 非目标 / 反目标

### 目标

- 框架无关的纯 JavaScript 核心 `@tarot/core`：不引用 DOM、不引用 `wx`、不依赖框架，可在浏览器与微信小程序运行时中直接执行。
- 两个独立渲染端：
  - **H5**：Vite + 原生 JS（无前端框架），单页，轻量 CSS 动效；
  - **微信小程序**：原生小程序（WXML/WXSS/JS），单页，轻量 CSS 动效。
- 两端跑通同一条流程：选定/输入问题 → 洗牌 → 抽 3 张（可重选）→ 发牌 → 逐张翻开（含正逆位）→ 本地占位解读 → 重新占一次。
- 使用新 78 张牌图；两端视觉沿用旧原型「暗夜金箔」气质（深底、金色描边、☾ 牌背），但**只有这一个主题**。
- AI 解读在核心中定义为 provider 接口，原型用本地牌义拼接占位；将来接火山引擎豆包（经云函数/后端代理）时只增加一个 provider 实现，两端 UI 与核心状态机不动。

### 非目标（本次不做）

- 不接入真实大模型、不搭建后端/云函数；
- 不做账号、历史记录、付费、分享等任何产品功能；
- 不做多主题切换、氛围粒子、GSAP 级别的复杂动画（洗牌分堆、抛物线飞牌、惯性牌河全部放弃）；
- 不引入 React/Vue/Taro/uni-app 等跨端框架；
- 不做小程序发布配置（合法域名、CDN、备案、真机适配打磨）；
- 不改动 `pipeline/` 与旧 `preview/` 目录。

### 反目标（怎样算失败）

- 核心里出现 `document`、`window`、`wx` 等平台 API；
- 任一端复制粘贴了一份洗牌/抽牌/牌义逻辑；
- 为了两端复用把 H5 的 DOM 结构或小程序的 WXML 抽象成跨端 UI 层（渲染必须各自自由）；
- 原型引入需要重型构建链才能跑起来的配置（开发者 clone 后应在几条命令内跑起任一端）。

## 3. 已确认的决策

| 决策点 | 选择 |
|---|---|
| 技术路线 | 微信原生小程序 + 框架无关共享核心（monorepo） |
| AI 解读 | 原型本地占位，核心预留 provider 接口 |
| 视觉程度 | 保留「暗夜金箔」气质，动效用纯 CSS 大幅简化；旧 preview 保留作参考 |
| 图片资源 | 生成压缩图供 H5 同源使用；小程序走可配置网络 URL（开发版关闭域名校验），不打进小程序包 |

## 4. 考虑过的方案与取舍

1. **微信原生 + 独立共享核心（选用）**
   核心是纯 JS，H5 经 Vite 直接以 ESM 引用源码；小程序不支持引用项目目录外的文件，由 esbuild 将核心打包成单个 CommonJS bundle，vendored 到小程序目录。渲染层两份完全独立。
   *取舍*：UI 要写两遍，但这正是需求本身（两端展示不同）；换来的是两端性能、调试体验、布局自由度都最好，核心边界也最清晰。

2. **Taro 4（React）/ uni-app（Vue）跨端编译（放弃）**
   一套 UI 代码编译到 H5 与小程序，开发量小，但渲染层也被共享、平台差异靠条件分支处理，直接违背「代码分离、渲染各自不同」的要求；且重动画与特殊布局受跨端约束。

3. **先只做 H5 轻量原型（放弃）**
   能更快看到东西，但小程序对接核心时才第一次验证核心的平台无关性，风险后置；双端一起做反而能及早暴露边界设计问题。

## 5. 目录结构

```
tarot/
  pipeline/                    # 已有，不动
  preview/                     # 已有旧原型，不动（视觉参考）
  docs/
  package.json                 # npm workspaces 根，私有
  scripts/
    build-data.mjs             # 合并 pipeline 元数据 + 旧 cards.js 牌义 -> 核心数据
    resize-images.mjs          # 78 张原图 -> 压缩图（macOS sips，无第三方依赖）
    build-core.mjs             # esbuild 打包核心 CJS bundle -> miniprogram/core/
    test-core.mjs              # node:test 核心规则冒烟测试
  packages/
    core/                      # @tarot/core（框架无关纯 ESM JS）
      package.json
      src/
        index.js               # 对外导出
        data/cards.js          # 【生成产物，提交】78 张完整牌数据
        content.js             # 预设问题等共享文案
        deck.js                # 洗牌、正逆位
        spread.js              # 牌阵定义（先只有三牌阵）
        session.js             # 状态机 + 订阅
        reading.js             # ReadingProvider 接口约定 + 本地占位实现
    h5/                        # Vite 原生 JS 单页
      package.json vite.config.js
      index.html
      src/main.js src/styles.css
      public/cards/*.jpg       # 【生成产物】压缩牌图
    miniprogram/               # 微信原生小程序
      project.config.json app.js app.json app.wxss sitemap.json
      core/index.js            # 【生成产物，提交】核心 CJS bundle
      pages/index/index.{wxml,wxss,js,json}
```

生成产物（cards.js、压缩图、core bundle）全部提交进仓库，让任一端**不跑生成脚本也能直接启动**；脚本用于数据/图片更新后重新生成。

## 6. 核心设计（@tarot/core）

### 6.1 牌数据

`data/cards.js` 由 `scripts/build-data.mjs` 生成，数据来源：

- 元数据（中文名、英文名、画面描述等）：`pipeline/cards.json`（22 张大阿）、`pipeline/minor.json`（权杖 14）、`cups.json`、`swords.json`、`pentacles.json`；
- 正逆位关键词牌义：旧 `preview/cards.js`（78 张齐全），在脚本中通过本地 vm 解析其 `MAJORS` / `SUITS` 常量后按编号映射；
- 图片文件名直接采用 `pipeline/output/` 的现有命名，核心只存文件名，不存路径前缀。

单张牌结构：

```js
// 大阿
{ id:'00_fool', arcana:'major', no:0, key:'fool',
  cn:'愚者', en:'THE FOOL', img:'00_fool.jpg',
  up:'勇敢踏上未知的新旅程……', rev:'鲁莽或逃避现实……',
  meta:{ ornament, motif, mood, shot, subject } }   // meta 来自 pipeline，供将来扩展

// 小阿
{ id:'w1_ace', arcana:'minor', suit:'wands', suitCn:'权杖', rank:1, key:'ace',
  cn:'权杖首牌', en:'ACE OF WANDS', img:'w1_ace.jpg', up:'…', rev:'…', meta:{…} }
```

约定：花色码 `w=权杖 c=圣杯 s=宝剑 p=星币`；rank 1–14 依次为 Ace、2–10、侍从(11)、骑士(12)、王后(13)、国王(14)。

`content.js` 放两端共享文案：4 个预设问题（感情关系/事业发展/财务状况/自我觉察，沿用旧原型）。

### 6.2 牌阵

```js
THREE_CARD_SPREAD = { id:'past-present-future', count:3, labels:['过去','现在','未来'] }
```

结构上保留牌阵可扩展性（count + 每个位置 label），原型只实现这一种。

### 6.3 会话状态机

`createSession(options)` 创建一次占卜会话，options：`{ cards, spread, rng }`（均可注入，`rng` 默认 `Math.random`，注入确定性随机用于测试）。

状态：

```
idle ──setQuestion/start──▶ shuffling ──finishShuffle──▶ picking
picking ──pick/unpick（最多 3 张，可取消重选）──▶ 满 3 张后 confirmPicks ──▶ revealing
revealing ──flip(i) 逐张翻──▶ 三张全翻后可 requestReading(provider) ──▶ reading 就绪
任意时刻 reset() 回到 idle
```

- `start()`：用注入的 rng 生成 78 张牌的随机顺序与每张**独立 50% 概率**的正逆位标记（逆位在抽中时即确定，与旧原型行为一致），进入 `shuffling`，向渲染层提供完整牌河数据；
- 洗牌动画时长是渲染层的事：渲染层播完自己的动画后调用 `finishShuffle()`；
- `pick(riverIndex)` / `unpick(riverIndex)`：超过牌阵张数的 pick 被核心忽略（返回 false），不依赖 UI 禁用；
- `confirmPicks()`：按选择顺序绑定牌阵位置（第 1 张=过去……），进入 `revealing`；
- `flip(position)`：标记该位置已翻开；
- `requestReading(provider)`：先置 `readingStatus:'loading'`，await `provider.generate(ctx)` 成功后置 `'ready'` 并写入文本，失败置 `'error'`。

核心对外是订阅 + 快照模式：

```js
const session = createSession()
session.getState()           // 返回当前完整快照（普通对象，渲染层不得原地修改）
const off = session.subscribe(state => /* 推送快照 */)
```

自实现一个极简 emitter，不引第三方库。状态对象形状（大致）：

```js
{
  phase:'idle'|'shuffling'|'picking'|'revealing',
  question:'',
  river:[{ card, reversed }],          // 78 项，start 后不变
  picks:[{ riverIndex, card, reversed }],  // 长度 0..3
  flipped:[false,false,false],
  readingStatus:null|'loading'|'ready'|'error',
  readingText:'',
}
```

### 6.4 解读 provider

```js
// 接口约定（鸭子类型，不做基类）
provider.generate({ question, spread, picks }) -> Promise<string>
```

`localReadingProvider`：模拟约 1.5s 延迟，输出沿用旧原型的占位格式（每牌「【位置｜牌名·正/逆位】关键词」+ 固定开场/结尾，明确标注占位）。

未来的 `httpReadingProvider`（本次不实现）把 ctx POST 到云函数，由云函数带 API Key 调豆包。

## 7. H5 渲染端（packages/h5）

- Vite + 原生 JS，无前端框架；`vite.config.js` 固定 `port: 5173, strictPort: true, host: true`（小程序开发期复用此服务取图）。
- 核心以 ESM 直接 import 源码（`@tarot/core` workspace 包），改核心后 H5 热更新，无需构建步骤。
- 单页四个区块，按 `phase` 切换显示（与旧 preview 同构）：
  1. **问卜**：品牌标记、预设问题 chips、textarea（80 字上限）、牌阵说明、开始按钮（问题为空时禁用）；
  2. **洗牌/抽牌**：问题回显、`0 / 3` 计数、三个已选槽位；牌河是一条原生横向滚动容器（`overflow-x: scroll` + 78 个纯 CSS 牌背，系统惯性滚动），点击牌背选中/取消，选中牌从牌河淡出、缩放到上方槽位（单元素 CSS transition，不做跨元素抛物线）；
  3. **揭示**：三个牌槽（过去/现在/未来），点击触发 CSS 3D `rotateY` 翻牌，正面 `<img>` 在翻牌时才设置 src（懒加载），逆位牌面旋转 180°；三张翻完按钮淡入；
  4. **解读**：loading 文案 → 占位文本；「重新占一次」调 `session.reset()`。
- 视觉：取旧 `styles.css` 的暗夜金箔色板与牌背描边（`#e4b865` 金、深紫黑底、Cinzel 英文 + 系统中文衬线回退），去掉粒子层、主题菜单、手机外壳宽边框以外的装饰；只保留现代浏览器基础兼容。
- 78 个牌背是纯 CSS 节点（无图片），性能无压力；全页最多加载 3 张牌面图。

## 8. 微信小程序渲染端（packages/miniprogram）

- 原生小程序，单页 `pages/index`，四个 `wx:if` 区块与 H5 流程一一对应；不使用自定义组件框架。
- 核心：`require('../../core/index.js')` 引用由 `npm run build:core` 生成的 CJS bundle（esbuild 打包，全量打到一个文件）。
- 页面 JS 在 `onLoad` 创建 session，`subscribe` 回调中 `setData`；为避免大对象传输，牌河数据（78 项，含牌名等）在 `start` 时一次性 setData，之后订阅只推送 `phase/picks/flipped/reading` 等小字段。
- 牌河：`scroll-view scroll-x`，78 个牌背 view；选中/翻牌均用 class 切换 + WXSS transition/3D transform 实现。
- 牌图：`<image src="{{cardBaseUrl + card.img}}">`。
  - `app.js` globalData 默认 `cardBaseUrl: 'http://127.0.0.1:5173/cards/'`，即 H5 dev 服务器，开发期两端共用同一套压缩图；
  - `project.config.json` 置 `urlCheck:false`（开发版不校验合法域名），README 注明真机预览需手机与电脑同局域网并改用局域网 IP；
  - 正式上线只需把该 URL 换成 CDN/COS 地址，代码不感知。
- AppID：`project.config.json` 先填测试号占位并在 README 注明替换方式；不申请、不绑定真实 AppID。
- 交互限制适配：无 hover、无 DOM 测量动画；textarea 用原生组件；按钮用 `button` 开放能力样式归零。

## 9. 图片压缩

`scripts/resize-images.mjs` 调 macOS 自带 `sips`（零第三方依赖）：

- 输入 `pipeline/output/*.jpg`，输出 `packages/h5/public/cards/`；
- 宽 624px（牌面在屏上的 CSS 宽度约 120–200px，覆盖 3x DPR），JPEG quality 75 左右，目标单张 60–110KB、总计 ≤ 8MB；
- 文件名保持不变；
- 脚本写死 sips 路径用法，仅面向当前 macOS 开发环境（原型阶段够用）。

## 10. 根脚本与启动方式

```
npm install
npm run build            # build:data + build:images + build:core（首次或资源更新时）
npm run dev:h5           # 起 Vite，http://127.0.0.1:5173
npm run build:core -w / --watch   # 改核心后同步小程序 bundle（提供 watch 模式）
npm test                 # node:test 核心冒烟测试
```

小程序：微信开发者工具导入 `packages/miniprogram`（前提是 `npm run build:core` 已生成 bundle，仓库内会直接提交一份）。

## 11. 核心冒烟测试（轻量）

`scripts/test-core.mjs` 用内置 `node:test`，无第三方依赖，覆盖：

- 生成牌数据恰好 78 张、id 与 img 唯一、大小阿数量 22/56；
- 注入确定性 rng 时洗牌结果可复现；78 张不重复；
- pick 超过 3 张被拒、unpick 后可补选、confirmPicks 后位置绑定正确；
- 每张牌逆位标记为布尔值；
- localReadingProvider 返回文本包含问题与三张牌名；
- reset 后回到 idle 且数据清空。

## 12. 留给实现者的决定

- 具体色值/间距/字号：从旧 `preview/styles.css` 就近取，不必逐像素复刻；
- H5 区块转场与卡片 transition 的具体时长/缓动（要求克制，总计不引入任何动画库）；
- WXML/WXSS 与 H5 DOM 的 class 命名不要求一致，各自顺手即可；
- esbuild/ vite 的具体版本取安装时最新稳定版；
- 小程序页面 setData 的字段裁剪粒度，以微信开发者工具不报警告为准；
- README 放根目录，写清四条命令、小程序导入与 AppID/域名说明。

## 13. 主要风险

1. **核心平台无关性是口头承诺** —— 靠「小程序先跑通」+ 核心冒烟测试兜底；核心代码评审时检查有无平台 API。
2. **牌义映射错位** —— 旧 `ar/wa/cu/sw/pe` 编码到新 `no/key` 的映射只此一份脚本，映射表在脚本中显式列出并由测试校验数量与抽查牌名（如 ar13=死神、swki=宝剑国王、peac=星币首牌）。
3. **真机取图** —— 原型仅保证开发者工具 + 局域网调试，不保证任意手机移动网络下可用（无 HTTPS 域名），已在非目标中排除。
4. **sips 依赖 macOS** —— 当前开发环境即 macOS（Darwin 21.6），可接受；换平台时改用 sharp，接口不变。
