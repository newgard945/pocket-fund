# 💸 Nathan Fund

一个运行在 [Operit AI](https://operit.app) 平台上的个人记账工具（ToolPkg 插件）。

## 功能

- 日薪自动累计与余额计算
- 收入 / 支出 / 转账记录
- 分池管理（储蓄池、消费池、机动池）
- 银行账户与利息计算
- 愿望清单与预算追踪
- 理财笔记与消费周报
- WebView 侧边栏界面，支持自定义主题
- 消息注入：将余额摘要自动注入对话上下文

## 项目结构

```
├── manifest.json              # 插件清单（包名、版本、入口、资源声明）
├── dist/
│   ├── main.js                # 入口：注册 UI 路由
│   └── ui/
│       └── fund_screen.js     # 主逻辑：数据读写、WebView 桥接、host 接口
├── resources/
│   ├── webview/
│   │   ├── fund.html          # 页面骨架
│   │   ├── fund-v3.css        # 样式
│   │   └── fund-v3.js         # 前端交互逻辑
│   └── fonts/                 # 自定义字体
└── README.md
```

## 技术栈

- **运行环境**：Operit AI ToolPkg Runtime（Node.js 风格模块系统）
- **前端**：原生 HTML + CSS + JavaScript（无框架），通过 WebView 渲染
- **数据存储**：本地 JSON 文件读写
- **桥接**：WebView ↔ Native 双向通信（hostInterface / postMessage）

## 后端逻辑概览

`fund_screen.js` 承担了类似后端 Controller + Service 的职责：

1. **路由注册**：通过 `hostInterface` 暴露 `readData`、`writeData`、`getBalance` 等接口给前端调用
2. **数据校验**：参数类型检查、必填校验、金额非负验证
3. **业务逻辑**：日薪累计算法、分池比例拆分、利息复利计算、流水幂等写入
4. **持久化**：JSON 文件原子写入，写前自动备份

## 本地开发

本插件依赖 Operit AI 平台运行。如需本地查看前端界面，可直接用浏览器打开 `resources/webview/fund.html`（部分功能需要 Native 桥接环境）。

## License

Private project. Not for redistribution.
