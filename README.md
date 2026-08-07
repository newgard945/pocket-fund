# 💸 Nathan Fund

一个运行在 [Operit AI](https://operit.app) 平台上的个人记账插件（ToolPkg）。

管理日薪、分池储蓄、银行利息、愿望清单和消费记录——通过侧边栏 WebView 界面操作，数据以 JSON 文件本地持久化。

## 功能一览

- 日薪自动累计与余额计算
- 收入 / 支出 / 罚金 / 转账记录
- 四池分配管理（拾光金 · 宠猫金 · 机动金 · 银行）
- 银行账户与复利计算
- 愿望清单与预算追踪
- 消费周报与理财笔记
- WebView 侧边栏界面，支持自定义字体与主题
- 余额摘要自动注入对话上下文（消息注入）

## 项目结构

```
├── manifest.json                # 插件清单（包名、版本、入口声明）
├── dist/
│   ├── main.js                  # 入口：注册 UI 路由到侧边栏
│   └── ui/
│       └── fund_screen.js       # 核心后端逻辑（409行）
├── resources/
│   ├── webview/
│   │   ├── fund.html            # 页面骨架
│   │   ├── fund-v3.css          # 样式表
│   │   └── fund-v3.js           # 前端交互逻辑（645行）
│   └── fonts/                   # 自定义字体（.gitignore）
└── README.md
```

## 架构

```
┌─────────────────────────────────────────────┐
│              Operit AI 宿主环境              │
├─────────────────────────────────────────────┤
│  main.js ─→ 注册侧边栏路由                  │
│       ↓                                     │
│  fund_screen.js（后端逻辑层）                │
│       │  ┌───────────────────────────┐      │
│       ├──│ hostInterface（9个API方法）│      │
│       │  └───────────────────────────┘      │
│       ↓                                     │
│  data.json ←→ 本地文件读写                   │
├─────────────────────────────────────────────┤
│  WebView 渲染层                              │
│  fund.html + fund-v3.css + fund-v3.js       │
│       ↕  postMessage / hostInterface 桥接    │
└─────────────────────────────────────────────┘
```

## 数据流

1. 用户打开侧边栏 → `main.js` 加载 `fund_screen.js`
2. `boot()` 初始化 → 读取 `data.json`，计算当前余额
3. `pushDataToWebView()` → 将数据序列化后注入 WebView
4. 用户在 WebView 中操作 → 通过 `hostInterface` 调用后端方法
5. 后端方法执行写入 → 更新 `data.json`，触发界面刷新

## API 接口（hostInterface）

| 方法名 | 功能 | 主要参数 |
|--------|------|----------|
| `readData` | 读取完整数据 | 无 |
| `writeData` | 写入完整数据 | `data: object` |
| `getBalance` | 获取当前余额摘要 | 无 |
| `addIncome` | 记录收入 | `amount`, `note`, `date` |
| `addPenalty` | 记录罚金 | `amount`, `reason`, `date` |
| `addTreat` | 记录消费支出 | `amount`, `note`, `category` |
| `correctBalance` | 手动修正余额 | `new_balance`, `reason` |
| `sendNotification` | 发送余额提醒 | 无 |
| `rebindNotification` | 重新绑定通知注入 | 无 |

## 余额计算逻辑

```
如果存在 correctBalance 修正记录：
  余额 = 最近一次修正值
       + 修正后的日薪累计
       + 修正后的收入合计
       - 修正后的支出合计

否则：
  余额 = 初始值
       + 建账以来日薪累计（日薪 × 天数）
       + 全部收入
       - 全部支出

分池分配比例（可配置）：
  拾光金 30% · 宠猫金 45% · 机动金 15% · Nathan自有 10%
```

## 数据结构示例（data.json）

```json
{
  "created_at": "2026-05-20",
  "daily_salary": 5,
  "transactions": [],
  "corrections": [],
  "allocation": {
    "enabled": true,
    "ratio": { "savings": 30, "treat": 45, "flex": 15, "nathan": 10 },
    "pools": {
      "savings": { "balance": 0, "goal": "...", "goal_amount": 0 },
      "treat": { "balance": 0 },
      "flex": { "balance": 0 }
    },
    "bank": {
      "total": 0,
      "naya_custody": 0,
      "annual_rate": 0.015,
      "accumulated_interest": 0
    }
  },
  "wishes": [],
  "finance_notes": [],
  "notification": { "enabled": true }
}
```

## 设计决策

1. **为什么用 JSON 而不是数据库？**  
   移动端单用户场景，数据量小（百条量级），JSON 读写最简单、最透明，便于调试和手动修正。

2. **为什么 WebView 和逻辑层分离？**  
   前端负责渲染和交互，逻辑层负责数据校验和持久化。这样前端可以独立迭代 UI 而不影响数据安全。

3. **为什么用虚拟 URL 拦截而不是 REST API？**  
   Operit ToolPkg 环境没有 HTTP 服务器。通过 `handleResourceRequest` 拦截 WebView 的资源请求，返回本地文件内容——实现了类似静态文件服务的效果。

4. **为什么余额有双模式计算？**  
   `correctBalance` 允许手动对账。一旦修正，后续计算基于修正点重新累加，避免历史流水错误永远影响当前余额。

5. **为什么备份写在写入之前？**  
   每次 `writeData` 前自动保存 `.bak`。JSON 原子写入在移动端不可靠（进程被杀、存储卡异常），备份是最后一道防线。

## 技术栈

- **运行环境**：Operit AI ToolPkg Runtime（Node.js 风格模块加载）
- **前端**：原生 HTML + CSS + JavaScript，WebView 渲染
- **数据存储**：本地 JSON 文件
- **桥接**：WebView ↔ Native 双向通信（`addJavascriptInterface` / `postMessage`）
- **字体**：Noto Serif SC、Bodoni Moda、Libre Caslon Text、Ma Shan Zheng

## 本地开发

本插件依赖 Operit AI 平台运行。前端界面可直接用浏览器打开 `resources/webview/fund.html` 预览样式（部分功能需要 Native 桥接环境才能工作）。

## License

Private project. Not for redistribution.
