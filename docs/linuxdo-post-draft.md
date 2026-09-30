# 自荐草稿

建议标题：**[开源] 项目做多了，连部署在哪都忘了，于是整理了一份个人资产地图（附 skill）**

---

最近整理自己的项目，发现了一个挺实际的问题：工具做得越来越快，但过一段时间，自己也记不清做过什么了。

有的只是本地脚本，有的挂在服务器上跑，有的是网站，还有一些定时任务，平时没有页面能点进去。真要再用的时候，又开始翻文件夹、找网址，回忆当时怎么启动、数据放在哪里。

所以给自己做了个 **Asset Atlas，个人资产地图**，这次把代码、示例卡片和配套 skill 一起整理开源了。

仓库：https://github.com/xPeiPeix/asset-atlas

在线体验：https://asset-atlas-nu.vercel.app

离线演示：https://github.com/xPeiPeix/asset-atlas/releases/latest/download/asset-atlas.html

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FxPeiPeix%2Fasset-atlas&project-name=asset-atlas&repository-name=asset-atlas)

想自己试的话，也可以点上面的按钮部署到自己的 Vercel 账号，不需要数据库或 API Key。

![用虚构资产生成的页面](https://raw.githubusercontent.com/xPeiPeix/asset-atlas/main/docs/preview.webp)

其实实现不复杂，核心就是 **一项资产，一张 Markdown 卡片**。

卡片先写一句“它是干什么的”，再按需要补代码目录、启动方式、访问入口、部署位置、数据备份、当前状态。一个小脚本填几项就够了，没必要为了整齐把每张卡都填满。

然后给它一个不会变化的编号。项目改名、搬目录，还是原来那张卡；不用了就归档，保留停用原因，以后还能找到。

页面只是把这些卡片展示出来，支持搜索、分类、状态筛选和关系图。哪天不想用这个界面了，Markdown 还在，也能继续读和修改。

我觉得真正有用的是配套的 **skill**。否则很容易花一个晚上整理得漂漂亮亮，后面就忘了更新。

现在可以在做完一个项目后，让助手检查是否已经登记，再补齐卡片；也可以在项目的 `AGENTS.md` 留下对应卡片的位置。后面改了部署位置、启动方式或用途时，就能找到原记录一起更新。

当然，它不是装好就会在后台自动同步。还是要把“更新卡片”放进平时做项目的流程里；查不到、没验证的信息就标出来，不让助手猜。

公开版只需要 Node.js，本地构建后得到一个可以离线打开的 HTML，也支持 Vercel 一键部署。仓库里的资产都是虚构示例，生成文件包含全部卡片；换成自己的资料后，记得不要直接部署成公开页面。

这次主要想分享的是这种整理方式，代码和 skill 都是 MIT，觉得合适可以直接拿去改。

也想听听大家怎么处理这个问题：做过的项目是随手记在笔记里，还是有自己的工具清单？如果试了这套东西，最想知道卡片字段会不会太多、日常更新顺不顺手。
