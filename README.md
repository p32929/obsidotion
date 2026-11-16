# obsidotion

Sync your Obsidian notes with a Notion database. Upload your notes to Notion with one click, and pull the changes you make in Notion back into Obsidian. Works on desktop and mobile.

# Screenshots
### From Windows
![Screenshot (77)](https://github.com/p32929/obsidotion/assets/6418354/95243ab8-58a4-4359-a72e-7d501c14f822)

### From Android
![Screenshot_20240525-161914_Obsidian](https://github.com/p32929/obsidotion/assets/6418354/7639a491-ce9c-4986-a7df-64d8f636f2df)

# Set up Notion

You do this once. It gives the plugin a key to your Notion and a database to put your notes in.

1. Open [notion.so/my-integrations](https://www.notion.so/my-integrations) and click **New integration**.
2. Give it a name (for example `Obsidian`), pick your workspace, and save.
3. Copy the **Internal Integration Secret**. It starts with `ntn_` or `secret_`. This is your **token**.
4. In Notion, create a new page and choose **Table** to make a database. Keep its first column, **Name**: that is where note titles go.
5. On the database page, click **•••** (top right), then **Connections**, then add the integration you made in step 2. Without this, the plugin cannot see the database.
6. Copy the database link (**•••**, then **Copy link**). The **database ID** is the 32 characters before the `?`. For example, in `https://www.notion.so/myname/8f3a1c2b9d4e4f6a8b7c6d5e4f3a2b1c?v=1234` the ID is `8f3a1c2b9d4e4f6a8b7c6d5e4f3a2b1c`.

# Install the plugin

1. Open the [latest release](https://github.com/p32929/obsidotion/releases/latest) and download `obsidotion-plugin.zip`.
2. In your vault, open the folder `.obsidian/plugins` (show hidden files if you cannot see `.obsidian`). Make a new folder in it called `obsidotion`.
3. Unzip the file and put `main.js`, `manifest.json` and `styles.css` inside that `obsidotion` folder.
4. Open Obsidian, go to **Settings**, then **Community plugins**, and turn on **obsidotion**. (If Obsidian asks, turn off Restricted mode first.)
5. Open the plugin's settings and paste your **token** and **database ID**.

# Use it

1. **Upload:** click the **cloud with an up arrow** in the left ribbon (or run "Upload to Notion" from the command palette). Each note becomes a page in your database. The next time, only notes you changed, added or renamed are uploaded.
2. **Pull:** click the **cloud with a down arrow** (or run "Pull from Notion"). Notes whose page you changed in Notion get the Notion version, and new pages you made in Notion are added as notes (in a `Notion` folder, or back in their old folder if obsidotion uploaded them before). It asks you once before it changes anything.
3. The plugin adds a few lines to the top of each synced note (`notionID`, `link`, `lastSync`, `filePath`, `contentHash`, `notionHash`). Leave them there: that is how it remembers which page belongs to which note. Your own frontmatter, like tags, stays as it is.
4. When you delete a note and upload again, its Notion page is archived (you can restore it from Notion's Trash).
5. It never archives pages it did not make or pull itself, so other pages in the database are safe. If a note cannot be read during an upload, nothing is archived that time.

# Good to know

1. Sync only happens when you click Upload or Pull. Nothing runs in the background.
2. Pull replaces the text of a note with the Notion version. If you changed the same note in both places, the last action wins, so upload or pull right after you finish editing.
3. Supported: headings, paragraphs, bold, italic, code, strikethrough, links, bullet lists (also nested), numbered lists, checkboxes, quotes, code blocks, tables and images with a web link. Horizontal lines (`---`) and Obsidian-only things like `[[wiki links]]` and embeds are sent as plain text or left out.
4. Notion allows about 3 requests a second, so the first upload of a big vault takes a while. Long notes are sent in parts, so there is no size limit you need to think about.
5. Notes synced with version 1.0 keep working. The first pull after updating only records the current state of each page and does not change the text of your existing notes.

# Build it yourself

1. Clone this repo and run `npm install`.
2. Run `npm run build` to make `main.js`, or `npm run dev` to rebuild on every change.
3. Run `npm test` to run the tests (they use a fake Notion, no account needed).
4. Optional: create a `.env` file with `OBSIDIAN_VAULT_PATH=/path/to/vault/.obsidian/plugins` and `PLUGIN_ID=obsidotion`, and every build is copied into your vault.

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

**Sponsor a mention** — $499 one-time: your name + link in this section for 3 months. **$1,200 one-time:** featured placement at the top of this section, plus a pinned mention on [my X profile](https://x.com/p32929), for 3 months. Email **[fayazdevinbox@uberip.com](mailto:fayazdevinbox@uberip.com)** for an invoice.

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

Full details → **[p32929.github.io/hire](https://p32929.github.io/hire/)** · Email **[fayazdevinbox@uberip.com](mailto:fayazdevinbox@uberip.com)** — scoping and quotes are free and I answer within one business day.
