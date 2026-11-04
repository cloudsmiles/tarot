# 塔罗占卜 · 双端原型

「静心 · 问卜」三牌阵（过去 · 现在 · 未来）塔罗原型。H5 与微信小程序是两套独立渲染端，
共用一个平台无关的核心底座：同一套牌数据、洗牌、会话状态机与解读接口，各自实现界面。

## 结构

```
tarot/
├── packages/
│   ├── core/         共享底座（零平台 API）：78 张牌数据、洗牌、三牌阵、
│   │                 问卜→抽牌→揭示→解读 会话状态机、解读 provider 接口
│   ├── h5/           H5 渲染端：Vite + 原生 JS，开发时直接引用 core 源码
│   └── miniprogram/  微信原生小程序渲染端：引用 core 的 CJS 打包产物
├── scripts/          生成物脚本与核心测试（node:test）
└── pipeline/         图像流水线：output/ 留 1664px 完整原图（数据源，勿手改），
                     meanings.js 为正逆位牌义源，*.json 为生成元数据
```

> 根目录 `preview/` 是已退役的静态原型，仅本地视觉参考，已加入 `.gitignore` 不进仓库；
> 图片资源分层：完整原图只存本地 `pipeline/output/`（不进 git，新机器需另行拷贝该目录），
> 前端压缩图由 `build:images` 单向生成；部署只需压缩图，无需原图。

AI 解读由 `packages/server`（Node，端口 8787）对接火山方舟，SSE 流式返回；
provider 为鸭子类型接口，`packages/h5/src/main.js` 的 `AI_ENABLED` 关闭时回退本地模拟文本。
服务端配置见 `packages/server/config.example.yaml`（真实 `config.yaml` 不进 git）。

## 环境要求

- Node.js 22+（用到内置 `node:test`；workspaces）
- macOS（压缩牌图调用系统自带 `sips`）
- 微信开发者工具（仅小程序端需要）

## 命令

```bash
npm install        # 安装依赖（workspaces：core + h5）
npm run build      # 重新生成全部产物：牌数据 + 压缩牌图 + 小程序 CJS bundle（幂等）
npm run dev:h5     # 启动 H5 dev server：http://localhost:5173
npm test           # 运行核心测试（node:test，26 个用例）
```

`build` 由三步组成，也可单独运行：`build:data` / `build:images` / `build:core`。

## 首次运行

1. `npm install`
2. `npm run build`（生成牌数据、78 张压缩牌图、小程序 bundle）
3. `npm run dev:h5`，浏览器打开 http://localhost:5173 走一遍：
   选方向/输入问题 → 洗牌 → 牌河凭直觉选 3 张（可取消重选，第 4 张会被拒绝）
   → 逐张翻牌（含正逆位）→ AI 占位解读 → 重新占一次。

## 微信小程序端

1. 保持 `npm run dev:h5` 运行——原型阶段牌图由本地 Vite（5173 端口）提供。
2. 微信开发者工具中「导入项目」，目录选择 **`packages/miniprogram`**（不是仓库根目录）。
3. AppID：`packages/miniprogram/project.config.json` 中当前为测试号
   `"appid": "touristappid"`，替换为你自己的 AppID。
4. 本地走 HTTP 取图：同文件 `setting.urlCheck` 已设为 `false`（关闭合法域名校验），
   仅限本地开发；正式上线需把牌图放到 HTTPS 域名并在小程序后台配置合法域名。
5. **真机预览**：开发者工具模拟器内 `127.0.0.1` 指向开发机可直接用；
   手机预览时把 `packages/miniprogram/app.js` 的 `globalData.cardBaseUrl`
   从 `http://127.0.0.1:5173/cards/` 改为开发机的局域网 IP
   （如 `http://192.168.x.x:5173/cards/`），手机与电脑需在同一网段。上线时换成 CDN/COS 地址。
6. 修改 `packages/core` 后，小程序不会自动拿到新代码——需重新运行
   `npm run build:core` 生成 `packages/miniprogram/core/index.js`（H5 端无需此步）。

## 生成物（均已提交，勿手改）

| 产物 | 生成命令 | 输入 |
| --- | --- | --- |
| `packages/core/src/data/cards.js` | `build:data` | `pipeline/*.json` + `pipeline/meanings.js`（正逆位牌义） |
| `packages/h5/public/cards/*.jpg`（78 张正面 + back，宽 624 / q70，约 14MB） | `build:images` | `pipeline/output/*.jpg`（macOS `sips`，原图 1664px 留档于 pipeline） |
| `packages/miniprogram/core/index.js` | `build:core` | `packages/core/src`（esbuild 打包为 CJS） |

`npm run build` 是幂等的：重建后 `git status` 应无差异。
