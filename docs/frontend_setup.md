# 前端运行指引（React + Vite + Ant Design）

本仓库已新增 `front-end/` 目录，使用 React 18 + Vite + Ant Design + Plotly + Mapbox 作为正式 Web 控制台。以下说明如何启动与集成。

## 1. 安装依赖

```bash
cd front-end
npm install
```

> 若尚未安装 Node.js，请先到 https://nodejs.org 下载 LTS 版本（18+）。

## 2. 开发模式

后台（FastAPI）与前端需要分别启动：

```bash
# 终端 A：运行 FastAPI
uvicorn backend.main:app --reload --port 8000

# 终端 B：运行 Vite
cd front-end
npm run dev
```

访问 http://localhost:5173 即可看到新版控制台（通过 Vite 代理访问 `/api` 接口）。

## 3. 生产构建

前端打包：

```bash
cd front-end
npm run build
```

产物输出至 `front-end/dist/`。可以：

1. 使用 `npm run preview` 验证；
2. 将 `dist` 上传至任意静态托管（如 Nginx、OSS、Vercel、Netlify）；
3. 或复制到 FastAPI，通过 `StaticFiles`（示例：`app.mount("/", StaticFiles(directory="front-end/dist", html=True))`）提供。

## 4. 目录说明

```
front-end/
  ├─ src/
  │   ├─ api/           # 与 FastAPI 对接的 axios 封装
  │   ├─ components/    # 布局与通用组件
  │   ├─ pages/         # Dashboard / DataHub / Trajectory / RiskLab
  │   ├─ store/         # Zustand 状态管理
  │   └─ styles/        # 全局样式与主题
  ├─ vite.config.ts     # Vite 配置（含代理）
  ├─ package.json
  └─ tsconfig*.json
```

## 5. 与后台的约定

- 所有调用均指向 `/api/...`，Vite 代理至 `http://127.0.0.1:8000`。若后台端口变更，请同步修改 `vite.config.ts` 的 `server.proxy`。
- 目前使用接口：
  - `GET /api/summary`
  - `GET /api/datasets/:name`
  - `GET /api/trajectories/flight/:fuuid`
  - `GET /api/trajectories/vehicle/:id`
  - `POST /api/contracts/check`
  - `GET /api/blockchain/stats`
- 若后台新增分析/告警 API，只需在 `src/api/client.ts` 中添加封装函数，再在对应页面引入。

## 6. 自定义主题

- 主题集中在 `src/styles/global.css` 与 `ConfigProvider` 配置，可根据需要调整主色、字体、阴影等，打造航空行业控制台风格。
- Mapbox token 目前为占位符，请替换为自己的 key（`src/pages/TrajectoryPage.tsx` 中的 `MAPBOX_TOKEN` 常量）。

按照上述步骤即可运行和扩展新版专业前端。若需要将更多分析/仿真结果融入 UI，只需扩展 API 与相应页面即可。

