# Asset Atlas

- `tools/` 和 `archive/` 的 Markdown 卡片是资产详情的唯一事实源；README 只保留导航和摘要，生成的 HTML 不手改。
- 仓库内的演示卡片使用虚构资产；新增演示内容继续使用 `example.invalid`、通用路径和虚构主机名，不引入开发者的真实资产资料。
- 修改卡片、构建器或页面后运行 `npm run check`。修改交互时验证生成页面。
- 配套 skill 位于 `skills/manage-asset-atlas/`；不要将个人环境的路径、部署命令或长期授权写入分享版 skill。
