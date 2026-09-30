# T-000 · Asset Atlas

> 用 Markdown 保存资产资料，并生成可搜索的地图。

| 字段 | 内容 |
|---|---|
| 状态 | 🟢 在用 |
| 分类 | 开发平台与集成 |
| 标签 | `资产卡片`、`本地优先`、`示例` |
| 主维护位置 | 本机 |
| 本机启动 | `npm ci`，然后 `npm run serve` |
| 数据与备份 | Markdown 卡片；可自行用 Git 保存历史。 |
| 最近核验 | 未核验 |
| 备注 | 这是格式示例，不包含作者的真实资产资料。 |

## 核心业务流程

```mermaid
flowchart TB
    Change["新增工具或项目变化"] --> Skill["按 skill 核对事实"]
    Skill --> Card["更新唯一 Markdown 卡片"]
    Card --> Check["校验并生成地图"]
    Check --> Find["下次按编号或用途找回来"]
```
