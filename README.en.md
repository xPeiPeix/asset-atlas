# Asset Atlas · Personal Asset Map

[中文](README.md)｜English

AI makes building tools easier than ever, but finished projects end up scattered everywhere. Asset Atlas brings them into one collection: what each project does, where its code lives, how to run it, and where it is deployed. Browse locally, host privately, or [password-protect individual cards](docs/usage.md#卡片密码保护-node-模式) with the Node server.

[Live demo](https://asset-atlas-nu.vercel.app) · [Create my first card](#create-my-first-card) · [User guide](docs/usage.md)

![Asset overview: a card and avatar for each project](docs/preview.webp)

![Card details: purpose, startup instructions, and a zoomable flowchart](docs/preview-flow.webp)

## Create my first card

Run this command and select your coding assistant when prompted:

```sh
npx skills add xPeiPeix/asset-atlas --skill manage-asset-atlas -g
```

Then open your project and ask your assistant:

> Use manage-asset-atlas to turn the current project into my first asset card. Use ~/my-asset-atlas as my asset library; create it if it does not exist, then open the local preview.

[Full instructions](skills/manage-asset-atlas/references/first-card.md#完整可复制指令) · [Local use and privacy](docs/local-use-and-privacy.md)

## Deploy your private collection with Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FxPeiPeix%2Fasset-atlas&project-name=asset-atlas&repository-name=asset-atlas)

Choose a private repository and enable **Vercel Authentication → All Deployments** (free) before adding personal cards. [Setup steps](docs/usage.md#部署到-vercel)

[MIT](LICENSE) · [Feedback](https://github.com/xPeiPeix/asset-atlas/issues) · **Star**

Community: [LINUX DO](https://linux.do/)
