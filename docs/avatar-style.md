# 示例头像

7 张示例卡片各有一枚独立的馆藏印章。头像保存在 `assets/avatars/T-NNN.webp`，卡片用同一永久 ID 引用；页面构建时将它内嵌，因此离线 HTML 不需要额外图片服务器。

共同外观是黑色珐琅圆面、暖金金属边和细密同心环。主体完整居中，约占正方形画布的 86%；背景透明，不含文字、字母、数字或品牌标识。每枚用不同中央符号和少量强调色区分。

| 编号 | 资产 | 中央符号 | 强调色 |
|---|---|---|---|
| T-000 | Asset Atlas | 罗盘与相连节点 | 档案青绿 `#4E7C78` |
| T-001 | 口袋笔记 | 打开的笔记本与书签 | 古金 `#A7823C` |
| T-002 | 图片压缩小工具 | 风景照片叠片与向内箭头 | 灰紫蓝 `#6772A6` |
| T-003 | 每日阅读摘要 | 展开纸页与朝阳 | 暗珊瑚 `#B75B62` |
| T-004 | 小小博客 | 羽毛笔与纸页 | 铜橙 `#B07849` |
| T-005 | 实验服务器 | 三层服务器塔与连接节点 | 钴石蓝 `#4B68A1` |
| T-006 | 旧链接检查脚本 | 链环与归档盒 | 石板灰 `#76818D` |

可以用下面的提示词思路绘制新的同风格头像。一次生成一枚，替换中央符号和强调色；只提供用途对应的抽象意象，不发送完整资产卡片。

```text
Create one square museum seal avatar. Center a complete circular seal
occupying about 86% of the canvas. Use black enamel, warm metallic gold
edges, fine concentric rings and a subtle engraved texture.
Central symbol: [one symbol from the table or your own abstract symbol].
Accent color: [one restrained accent color].
Keep a consistent front-facing composition, line weight and soft lighting.
Use a genuinely transparent background, with no colored backdrop.
No text, letters, numbers, logos, extra objects or cropped edges.
```

文件要求：256×256、带 alpha 的 WebP，单文件不超过 32 KiB。卡片中的引用格式为：

```markdown
| 头像 | [查看](../assets/avatars/T-007.webp) |
| 头像意象 | 抽象符号 · 强调色名 #RRGGBB |
```

把文件与卡片放好后运行 `npm run check`。检查透明四角、完整外圈，以及缩小到列表尺寸后能否分辨符号。自己的卡片仍可不配头像，公开示例则保留完整配图，方便直接体验。
