# 原生代码绘制头像

没有 ImageGen 等生图工具时，直接编写 SVG、Canvas 或其他绘图代码，为资产制作专属头像。Claude 等编程助手可以沿用这个流程，不需要更换模型或另外配置生图 API。已有头像默认保留，仅在用户要求时替换。

## 画一枚对应项目用途的圆章

![用 SVG 代码绘制的馆藏印章样例](../assets/avatar-seal.svg)

可从 [SVG 样例](../assets/avatar-seal.svg) 开始：保留外圈和黑色圆面，替换中央符号及少量强调色。这个文件随 skill 安装；按当前 skill 的实际路径读取，不假定它装在某个助手的固定目录。

- 画布为 `256×256`，圆章居中，占宽度约 86%，边缘完整，四角透明。
- 黑色珐琅圆面、暖金细线与同心环；选一个能解释用途的符号，如笔记本、压缩箭头、服务器节点。
- 用基础图形、路径和少量渐变绘制。先保证缩小到 64px 仍清楚，不堆细节，不加文字、品牌标识或画布背景。
- SVG 只包含本地矢量图形，不引用外部图片、字体或脚本。绘图只需要抽象用途，不需要完整卡片、私有路径或项目数据。

绘图源可保存在资产库的 `assets/avatar-sources/T-NNN.svg`。SVG 用于编辑，页面实际引用的是 `assets/avatars/T-NNN.webp`；不要把 SVG 直接填进要求 WebP 的头像字段。

## 导出与验收

用当前环境可用的图像工具将 SVG 转成 WebP。例如，先在资产库中保存绘图源并创建输出目录，将下面的 `T-007` 换成实际的新卡编号，确认不会覆盖已有头像后运行：

```sh
npx --yes --package sharp-cli@6.1.0 sharp -i assets/avatar-sources/T-007.svg -o assets/avatars/T-007.webp -f webp -q 88 --alphaQuality 100 resize 256 256
```

这个 [sharp-cli](https://github.com/vseventer/sharp-cli) 转换方式已用随 skill 提供的 SVG 实测：256×256，12,368 字节，四角 alpha 均为 0。实际大小随绘图内容变化。首次下载工具需要联网，图像转换在本机完成，无需把它加进资产库依赖或全局安装。

也可以在浏览器 Canvas 中绘制后导出。若使用 `canvas.toBlob(..., "image/webp", quality)`，检查结果 MIME 类型和实际文件格式：不支持 WebP 的浏览器可能返回 PNG，不能只修改扩展名。[Canvas 导出说明](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob)

最终文件必须满足：**256×256、真实 alpha 透明背景、单文件不超过 32 KiB**。检查四角 alpha 为 0、外圈完整、缩略图可辨认；过大时简化纹理或降低编码质量，保持尺寸和透明度。

在卡片中按永久 ID 引用，例如：

```markdown
| 头像 | [查看](../assets/avatars/T-007.webp) |
| 头像意象 | 书页与相连节点 · 档案青绿 #4E7C78 |
```

替换示例编号和意象为实际内容，保留其他卡片和头像，运行 `npm run check` 后打开页面检查实际效果。暂时无法导出时可复用现成头像并说明情况，不把缺少 ImageGen 当作制卡失败。
