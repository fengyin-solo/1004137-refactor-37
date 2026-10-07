# 机场地面保障调度管理系统

面向航班机位分配、廊桥调度、行李转运、货物装卸、航空加油、航食配餐与客舱清洁全流程的机场地面保障调度管理平台。

这是一个**纯前端**管理平台：Vue 3 + Vite + TypeScript，仓库里没有后端服务。业务数据由
`frontend/src/data/` 下的本地数据层提供：首次打开用示例数据播种，之后的登记、筛选与状态流转
结果都持久化在浏览器 `localStorage` 里，刷新或重开浏览器都还在。dev server 已关掉自动打开页面，
启动后按终端打印的地址手工打开。

## 目录结构

```text
.
├── frontend/                 Vue 3 + Vite + TypeScript 前端（唯一运行单元）
│   ├── src/views/            每个业务模块一个页面
│   ├── src/api/local-service.ts   本地数据服务：列表、筛选、动作流转、导出
│   ├── src/data/             模块元数据 / 示例数据 / localStorage 持久化
│   ├── src/stores/           会话与筛选状态
│   └── vite.config.ts        dev server 配置（open: false，无 /api 代理）
├── .gitignore
└── docker-compose.yml
```

## 启动

```bash
cd frontend
npm install
npm run dev
```

前端默认监听 `http://127.0.0.1:5173/`，dev server 不会自动打开浏览器，需要自己访问。

生产构建：

```bash
cd frontend
npm run build
```

## 业务模块

| 模块 | 目录 | 业务对象 | 主要字段 |
| --- | --- | --- | --- |
| 机位分配 | `stand` | 机位分配 | 机位编号、机位类型、所属航站楼 |
| 廊桥调度 | `bridge` | 廊桥 | 廊桥编号、所属机位、对接机型 |
| 地面电源 | `ground_power` | 地面电源 | 设备编号、设备类型、所属机位 |
| 行李转运 | `baggage` | 行李转运 | 转运编号、关联航班、行李件数 |
| 货物装卸 | `cargo` | 货物装卸 | 装卸编号、关联航班、货物品类 |
| 航空加油 | `fueling` | 加油记录 | 加油编号、关联航班、燃油型号 |
| 航食配餐 | `catering` | 配餐任务 | 配餐编号、关联航班、餐食类型 |
| 客舱清洁 | `cabin_clean` | 清洁任务 | 清洁编号、关联航班、清洁类型 |
| 排污服务 | `lavatory` | 排污记录 | 排污编号、关联航班、服务车型 |
| 除冰作业 | `deicing` | 除冰记录 | 除冰编号、关联航班、除冰液类型 |
| 牵引车调度 | `pushback` | 牵引任务 | 牵引编号、关联航班、牵引车型 |
| 地勤排班 | `crew_schedule` | 地勤人员 | 人员编号、姓名、岗位类别 |
| 特种车辆 | `special_vehicle` | 特种车辆 | 车辆编号、车辆类型、品牌型号 |
| 航班保障 | `flight_ops` | 航班保障 | 航班号、机尾号、计划到港 |
| 过站监控 | `turnaround` | 过站记录 | 过站编号、关联航班、计划到港 |
| 机坪安全 | `apron_safety` | 机坪安全 | 巡查编号、区域归属、巡查人员（含 `/apron_safety/:id` 详情、`/apron_safety/batch` 批量整改） |
| 事故上报 | `incident_report` | 事故上报 | 上报编号、巡查编号、闭环结论（只读引用机坪安全） |
| 装卸设备 | `load_equip` | 装卸设备 | 设备编号、设备类型、适用机型 |
| 应急保障 | `air_emergency` | 应急保障 | 应急编号、事件类型、涉及航班 |

## 约定

- 每个模块的页面在 `frontend/src/views/<模块>/index.vue`，页面只负责渲染，读写统一走
  `frontend/src/api/local-service.ts`。
- 字段、状态、动作与流转目标集中在 `frontend/src/data/modules.ts`；示例数据在
  `frontend/src/data/seed.ts`。
- 状态流转只允许在 `local-service.ts` 里改，页面组件不做业务判断。
- 机坪安全整改是例外收口：列表按钮、详情页、批量整改三个入口共用
  `frontend/src/data/apron.ts` 的动作规则与 `frontend/src/api/apron-service.ts` 的写入口
  （UI 统一为 `components/RectificationDock.vue`）。规则保证：
  - 状态只能 `待巡查 → 已巡查 → 待整改 → 已闭环` 顺序推进，已闭环不可重复整改；
  - 复查结果、安全状态只在「确认闭环」落定，整改措施只在「安排整改」落定，历史结论只追加不覆盖；
  - 跨区域人员不能改动其他责任区的问题；同一问题并发提交闭环只生效一次；
  - 缺区域归属的存量记录加载时迁移为「未归属区域」并固化原结论，对所有人只读。
- 事故上报清单不保存整改结论，通过 `apron-service.ts` 的 `sharedConclusion` 按巡查编号
  只读引用机坪安全记录，两边看到的复查结果/区域归属永远是同一份。
- 想回到初始数据：清掉浏览器里 `airport-ground-handling:entries` 这一项，或调用 `resetModule(模块)`。
- 纯规则校验：`node scripts/check-apron.mjs`（用 esbuild 临时打包规则与种子数据后在 Node 里断言）。
