# 使用指南

[返回首页](../README.md) · [首次建卡与可复制指令](../skills/manage-asset-atlas/references/first-card.md) · [本地使用与隐私](local-use-and-privacy.md)

## 这套方法

1. **先说用途。** 每张卡第一句话说明这个工具解决什么问题，再记录代码、启动方式和入口。
2. **一份详情。** 资产信息保存在卡片，清单和页面从卡片生成；README 只保留项目介绍与使用入口。
3. **编号保持不变。** `T-001` 是身份，名称和位置可以变。停用后移入 `archive/`，编号不复用。
4. **让项目记得自己的卡片。** 在项目的 `AGENTS.md` 留下卡片位置，后续用途、入口或部署变化时，助手能找到该更新的记录。
5. **把不确定写出来。** “待核验”和“已确认能用”分开；仅整理了文字，不刷新核验日期。

不是每张卡都要填满。一个本地脚本可能只需要用途、路径、运行命令；有远端部署和数据库的工具再补相应字段。没有公开网址的定时任务、备份脚本也可以是一项资产。

## 本地运行

需要 Node.js 22 或更新版本。

```sh
git clone https://github.com/xPeiPeix/asset-atlas.git
cd asset-atlas
npm ci
npm run check
npm run serve
```

浏览器打开终端打印的本机地址。也可以直接打开生成的 `asset-atlas.html`；它包含页面、卡片和 Mermaid 运行时，离线也能搜索、筛选和查看关系图。页面里的外部网址自然仍需要联网。

同一次构建还生成 `dist/index.html`，可用于 Vercel 或其他静态托管服务。

界面支持分类、状态、全文搜索、排序、卡片详情、`#T-001` 直达、明暗主题、两套配色，以及关系图的全屏缩放。卡片中新增字段会自动进入详情，不需要同步修改前端。

示例头像随仓库提供，也会内嵌进离线 HTML。需要为自己的卡片配图时，可参考[头像风格与文件规格](avatar-style.md)。

### 示例里可以看什么

仓库自带 6 张活动卡片和 1 张归档卡片，每张均配有独立的馆藏印章头像。在线演示和 Vercel 一键部署最初展示的都是这些虚构示例；制作自己的卡片请按 [README](../README.md#制作我的第一张卡) 中的 skill 用法操作。

| 示例 | 展示内容 |
|---|---|
| T-000 · Asset Atlas | 业务流程图、搜索快捷键、Markdown 下载 |
| T-001 · 口袋笔记 | 应用架构图、网站入口、数据库与备份、凭证存放位置 |
| T-002 · 图片压缩小工具 | 简单本地工具、启动命令、编辑器入口 |
| T-003 · 每日阅读摘要 | 定时任务、时序图、日志位置、自定义核验待办 |
| T-004 · 小小博客 | 静态网站、部署说明、示例核验日期与排序 |
| T-005 · 实验服务器 | SSH 入口、服务器与应用的关系图、关联资产 |
| T-006 · 旧链接检查脚本 | 归档原因、保留编号、状态图 |

这组卡片包含全部 5 种状态和 6 个分类，均有独立头像与标签。图表可以查看大图、缩放和拖动；搜索、分类、状态、排序和主题切换可直接在列表中体验。网址、SSH 别名、编辑器路径及核验日期均为演示数据。

![浅色、暖金主题下的流程图与卡片详情](preview-flow.webp)

## 配套 skill

分享版 skill 与代码放在同一个仓库：[`skills/manage-asset-atlas/`](../skills/manage-asset-atlas/)。

按 [README](../README.md#制作我的第一张卡) 中的 `npx skills add` 命令安装后即可调用；`-g` 安装到用户目录，各个项目都能用，更多参数见 [安装选项](https://github.com/vercel-labs/skills#options)。命令只负责安装，制卡由助手完成；也可以直接让助手阅读仓库内的 `SKILL.md`。完整首次制卡流程随 skill 一同提供。

首次使用时明确告诉它你的资产库目录，之后可以这样说：

> 使用 $manage-asset-atlas，把这个项目登记到我的资产库，先检查有没有已有卡片。只记录已确认的信息。

> 这个项目的部署位置变了，请更新它原来的卡片，再重新生成资产地图。

> 这个工具已经停用了，把原卡片归档，保留编号和停用原因。

skill 会帮助维护卡片及项目中的反向链接；它不代表后台自动扫描，也不会凭空知道部署变化。需要把它纳入日常修改项目的流程。提交、推送、远端查询和网站发布仍按使用者的当次要求执行。

## 开始记录自己的资产

复制 [`templates/tool-entry.md`](../templates/tool-entry.md)，保存成 `tools/T-007-your-tool.md`，填写标题、一句话用途和核心字段，再运行 `npm run check`。无需在 README 重复登记清单。校验输出会给出下一个可用编号，实际新增时以该输出为准。

示例卡片用于解释格式，正式使用前可以清理示例并从自己的编号开始。已经正式分配给真实资产的编号则不要重复使用。`T-000` 留给资产地图自身。

```text
tools/       活动卡片，资产详情的事实源
archive/     归档卡片，保留原编号
templates/   新卡片模板
skills/      可分享的维护 skill
web/         页面源码
scripts/     构建、校验与本地预览
```

记录凭证时只写存放位置，不写密码、Token 或 Cookie。卡片和生成文件的分享限制见[本地使用与隐私说明](local-use-and-privacy.md)。


## 部署到 Vercel

本地制卡和查看不需要部署。需要在手机、其他电脑上查看时，可以把自己的地图部署到 Vercel，再用 Vercel 登录保护访问。**Hobby 免费套餐也支持保护全部部署，包括正式域名。** 这项能力于 2026-09-09 开放，见 [Vercel 官方公告](https://vercel.com/changelog/protect-production-deployments-for-free-on-every-plan)。

1. 点击 [README 中的 Deploy with Vercel 按钮](../README.md#一键部署私有的资产典藏库)，在自己的账号中创建项目，确认新建的 Git 仓库为 **Private**。Hobby 用户使用 [GitHub 个人账户下的私有仓库](https://vercel.com/docs/git#using-hobby-teams)。先部署仓库自带的虚构示例。
2. 在 Vercel 项目的 **Deployment Protection** 页面开启 **Vercel Authentication**，范围选择 **All Deployments**，保存。不要只选择 Standard Protection，它仍会公开正式域名。
3. 用未登录的浏览器或无痕窗口打开正式网址和生成的部署网址，确认只能看到 Vercel 登录页；用有项目权限的本人账号登录后，应能看到地图。私人使用时不要创建公开的 Shareable Links 或 Protection Exceptions。
4. 确认仓库私有、网站访问保护生效后，再把自己的卡片提交到该私有仓库。Git 集成会重新构建页面，之后仍通过 Vercel 登录查看。

**私有仓库和网站访问保护是两项设置。** 前者保护源码和卡片文件，后者保护网页；Deploy 按钮本身不会保证两项都已开启。也可以先在 Vercel 的团队设置中，将新项目默认保护设为 Vercel Authentication / All Deployments，创建后仍检查项目实际配置。

Vercel 只发布构建出的 `dist/`，不需要数据库、API Key 或在 Asset Atlas 内另建账号系统。访问者使用有权限的 Vercel 账号登录。私有部署会把资料上传到自己的 Git 托管服务和 Vercel；希望资料不上传托管平台时，继续使用本地 HTML。

相关说明：[访问保护](https://vercel.com/docs/deployment-protection) · [Vercel Authentication](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication) · [Deploy Button](https://vercel.com/docs/deploy-button)。
