# obsidotion
A simple obsidian plugin that syncs from/to obsidian/notion. Works on all platforms

# Screenshots
### From windows
![Screenshot (77)](https://github.com/p32929/obsidotion/assets/6418354/95243ab8-58a4-4359-a72e-7d501c14f822)

### From Android
![Screenshot_20240525-161914_Obsidian](https://github.com/p32929/obsidotion/assets/6418354/7639a491-ce9c-4986-a7df-64d8f636f2df)

# How to use
1. Star the repo :P
2. Install the plugin (see installation methods below)
3. Follow this instruction: https://github.com/EasyChris/obsidian-to-notion/?tab=readme-ov-file#how-to-use

After that you can:
1. Upload the whole vault to notion ( replaces remote data if already exists )
2. Download the whole notion database to obsidian ( replaces local file if already exists )

# How to install

## Method 1: Download from releases (easiest)
1. Go to [Releases](https://github.com/p32929/obsidotion/releases)
2. Download `obsidotion-plugin.zip` from the latest release
3. Extract the zip file
4. Copy the extracted folder to `your_obsidian_vault/.obsidian/plugins/obsidotion`
5. Open obsidian and enable the plugin

## Method 2: Manual build


1. Star the repo :P
2. Clone the repo inside `your_obsidian_vault/.obsidian/plugins`
3. Go to the folder
4. Run `npm install` or `yarn`
5. Run `npm run build` or `yarn build`
6. Open obsidian
7. Enable the plugin

## For developers who dont want to copy files manually every time

You can create a `.env` file to auto-copy the built files to your obsidian vault. This way you dont have to manually copy `main.js`, `manifest.json`, `styles.css` every time you build.

Create a `.env` file:
```
OBSIDIAN_VAULT_PATH=/path/to/your/obsidian/vault/.obsidian/plugins
PLUGIN_ID=obsidotion
```

If you dont provide the `.env` file, the build will still work fine. You'll just have to copy the files manually

# License

MIT License — Copyright (c) 2024 Fayaz Bin Salam. See [LICENSE](LICENSE) for the full text.

## Contributing

Contributions are warmly welcomed and greatly appreciated! Whether it's a bug fix, new feature, or improvement, your input helps make this project better for everyone.

Before submitting a pull request, please:

1. Create an issue describing the feature or bug fix you'd like to work on
2. Wait for discussion and approval to ensure alignment with project goals
3. Fork the repository and create your feature branch
4. Submit your pull request with a clear description of changes

This approach helps avoid duplicate efforts and ensures smooth collaboration. Thank you for considering contributing!

## Share

Sharing this repository with your friends is just one click away from here

[![facebook](https://user-images.githubusercontent.com/6418354/179013321-ac1d1452-0689-493f-9066-940cf2302b6e.png)](https://www.facebook.com/sharer/sharer.php?u=https://github.com/p32929/obsidotion/)
[![twitter](https://user-images.githubusercontent.com/6418354/179013351-7d8d6d1c-4ce2-46ab-bef8-4c4765a1b888.png)](https://twitter.com/intent/tweet?url=https://github.com/p32929/obsidotion/)
[![tumblr](https://user-images.githubusercontent.com/6418354/179013343-3111f55a-3b90-40c7-8487-9777348672b0.png)](https://www.tumblr.com/share?v=3&u=https://github.com/p32929/obsidotion/)
[![pocket](https://user-images.githubusercontent.com/6418354/179013334-b095c45f-becf-49f4-9ee1-5a731a9b1f85.png)](https://getpocket.com/save?url=https://github.com/p32929/obsidotion/)
[![pinterest](https://user-images.githubusercontent.com/6418354/179013331-44cd9206-11b1-4b65-becb-5863b61c828f.png)](https://pinterest.com/pin/create/button/?url=https://github.com/p32929/obsidotion/)
[![reddit](https://user-images.githubusercontent.com/6418354/179013338-7416ae3f-73ba-4522-86e1-1374d7082d22.png)](https://www.reddit.com/submit?url=https://github.com/p32929/obsidotion/)
[![linkedin](https://user-images.githubusercontent.com/6418354/179013327-ca7b7102-1da8-4b1c-858f-1a6e5f21bd70.png)](https://www.linkedin.com/shareArticle?mini=true&url=https://github.com/p32929/obsidotion/)
[![whatsapp](https://user-images.githubusercontent.com/6418354/179013353-f477fa0b-3e6f-4138-a357-c9991b23ff88.png)](https://api.whatsapp.com/send?text=https://github.com/p32929/obsidotion/)

## Support

If you like my works and want to support me/my works, feel free to support:

[![buymeacoffee](https://www.buymeacoffee.com/assets/img/guidelines/download-assets-sm-1.svg)](https://www.buymeacoffee.com/p32929)

<!-- hire-block -->

---

## 💼 Using this at a company?

I do fixed-price delivery work on my own projects. One invoice, one date, no hourly billing:

| | |
|---|---|
| **White-label build** — this project rebranded, extended and deployed as yours | **$6,500** · 3 weeks |
| **Custom app from scratch** on my own stack, signed and auto-updating | **$12,500** · 6 weeks |
| **Production-hardening sprint** — 72 hours on this project, for your load and your security review | **$999** |
| **Ongoing capacity** — one project-week of my time reserved every month | **$9,000 / month** |

Full details → **[p32929.github.io/hire](https://p32929.github.io/hire/)** · Email **[fayazbinsalam@uberip.com](mailto:fayazbinsalam@uberip.com)** — scoping and quotes are free and I answer within one business day.
