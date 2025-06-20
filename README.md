# obsidotion
A simple obsidian plugin that syncs from/to obsidian/notion. Works on all platforms

# Screenshots
### From windows
![Screenshot (77)](https://github.com/p32929/obsidotion/assets/6418354/95243ab8-58a4-4359-a72e-7d501c14f822)

### From Android
![Screenshot_20240525-161914_Obsidian](https://github.com/p32929/obsidotion/assets/6418354/7639a491-ce9c-4986-a7df-64d8f636f2df)

# How to use
1. Star the repo :P
2. Install the plugin
3. Follow this instruction: https://github.com/EasyChris/obsidian-to-notion/?tab=readme-ov-file#how-to-use

After that you can:
1. Upload the whole vault to notion ( replaces remote data if already exists )
2. Download the whole notion database to obsidian ( replaces local file if already exists )

# How to install manually
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

# Share
Sharing this repository with your friends is just one click away from here

[![facebook](https://user-images.githubusercontent.com/6418354/179013321-ac1d1452-0689-493f-9066-940cf2302b6e.png)](https://www.facebook.com/sharer/sharer.php?u=https://github.com/p32929/obsidotion/)
[![twitter](https://user-images.githubusercontent.com/6418354/179013351-7d8d6d1c-4ce2-46ab-bef8-4c4765a1b888.png)](https://twitter.com/intent/tweet?url=https://github.com/p32929/obsidotion/)
[![tumblr](https://user-images.githubusercontent.com/6418354/179013343-3111f55a-3b90-40c7-8487-9777348672b0.png)](https://www.tumblr.com/share?v=3&u=https://github.com/p32929/obsidotion/)
[![pocket](https://user-images.githubusercontent.com/6418354/179013334-b095c45f-becf-49f4-9ee1-5a731a9b1f85.png)](https://getpocket.com/save?url=https://github.com/p32929/obsidotion/)
[![pinterest](https://user-images.githubusercontent.com/6418354/179013331-44cd9206-11b1-4b65-becb-5863b61c828f.png)](https://pinterest.com/pin/create/button/?url=https://github.com/p32929/obsidotion/)
[![reddit](https://user-images.githubusercontent.com/6418354/179013338-7416ae3f-73ba-4522-86e1-1374d7082d22.png)](https://www.reddit.com/submit?url=https://github.com/p32929/obsidotion/)
[![linkedin](https://user-images.githubusercontent.com/6418354/179013327-ca7b7102-1da8-4b1c-858f-1a6e5f21bd70.png)](https://www.linkedin.com/shareArticle?mini=true&url=https://github.com/p32929/obsidotion/)
[![whatsapp](https://user-images.githubusercontent.com/6418354/179013353-f477fa0b-3e6f-4138-a357-c9991b23ff88.png)](https://api.whatsapp.com/send?text=https://github.com/p32929/obsidotion/)


# Support
If you like my works and want to support me/my works, feel free to support:

[![buymeacoffee](https://www.buymeacoffee.com/assets/img/guidelines/download-assets-sm-1.svg)](https://www.buymeacoffee.com/p32929)

# Contribution
If you want to contribute to this project, please open an issue first and explain how you'd like to contribute

# License
```
MIT License

Copyright (c) 2024 Fayaz Bin Salam

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

```

