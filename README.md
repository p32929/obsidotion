# obsidotion

Sync your Obsidian notes with a Notion database. Upload your notes to Notion with one click, and pull the changes you make in Notion back into Obsidian. Works on desktop and mobile.

**Safe with the rest of your Notion.** obsidotion only updates or archives pages it created or pulled itself, so pages you made in Notion are never touched. Your note properties, like tags, are kept as they are.

## Screenshots
### From Windows
![Screenshot (77)](https://github.com/p32929/obsidotion/assets/6418354/95243ab8-58a4-4359-a72e-7d501c14f822)

### From Android
![Screenshot_20240525-161914_Obsidian](https://github.com/p32929/obsidotion/assets/6418354/7639a491-ce9c-4986-a7df-64d8f636f2df)

## Set up Notion

You do this once. It gives the plugin a key to your Notion and a database to put your notes in.

1. Open [notion.so/my-integrations](https://www.notion.so/my-integrations) and click **New integration**.
2. Give it a name (for example `Obsidian`), pick your workspace, and save.
3. Copy the **Internal Integration Secret**. It starts with `ntn_` or `secret_`. This is your **token**.
4. In Notion, create a new page and choose **Table** to make a database. Keep its first column, **Name**: that is where note titles go.
5. On the database page, click **•••** (top right), then **Connections**, then add the integration you made in step 2. Without this, the plugin cannot see the database.
6. Copy the database link (**•••**, then **Copy link**). The **database ID** is the 32 characters before the `?`. For example, in `https://www.notion.so/myname/8f3a1c2b9d4e4f6a8b7c6d5e4f3a2b1c?v=1234` the ID is `8f3a1c2b9d4e4f6a8b7c6d5e4f3a2b1c`.

## Install the plugin

1. Open the [latest release](https://github.com/p32929/obsidotion/releases/latest) and download `obsidotion-plugin.zip`.
2. In your vault, open the folder `.obsidian/plugins` (show hidden files if you cannot see `.obsidian`). Make a new folder in it called `obsidotion`.
3. Unzip the file and put `main.js`, `manifest.json` and `styles.css` inside that `obsidotion` folder.
4. Open Obsidian, go to **Settings**, then **Community plugins**, and turn on **obsidotion**. (If Obsidian asks, turn off Restricted mode first.)
5. Open the plugin's settings and paste your **token** and **database ID**.

## Use it

1. **Upload:** click the **cloud with an up arrow** in the left ribbon (or run "Upload to Notion" from the command palette). Each note becomes a page in your database. The next time, only notes you changed, added or renamed are uploaded.
2. **Pull:** click the **cloud with a down arrow** (or run "Pull from Notion"). Notes whose page you changed in Notion get the Notion version, and new pages you made in Notion are added as notes (in a `Notion` folder, or back in their old folder if obsidotion uploaded them before). It asks you once before it changes anything.
3. The plugin adds a few lines to the top of each synced note (`notionID`, `link`, `lastSync`, `filePath`, `contentHash`, `notionHash`). Leave them there: that is how it remembers which page belongs to which note. Your own frontmatter, like tags, stays as it is.
4. When you delete a note and upload again, its Notion page is archived (you can restore it from Notion's Trash).
5. It never archives pages it did not make or pull itself, so other pages in the database are safe. If a note cannot be read during an upload, nothing is archived that time.

## Good to know

1. Sync only happens when you click Upload or Pull. Nothing runs in the background.
2. Pull replaces the text of a note with the Notion version. If you changed the same note in both places, the last action wins, so upload or pull right after you finish editing.
3. Supported: headings, paragraphs, bold, italic, code, strikethrough, links, bullet lists (also nested), numbered lists, checkboxes, quotes, code blocks, tables and images with a web link. Horizontal lines (`---`) and Obsidian-only things like `[[wiki links]]` and embeds are sent as plain text or left out.
4. Notion allows about 3 requests a second, so the first upload of a big vault takes a while. Long notes are sent in parts, so there is no size limit you need to think about.
5. Notes synced with version 1.0 keep working. The first pull after updating only records the current state of each page and does not change the text of your existing notes.

## Build it yourself

1. Clone this repo and run `npm install`.
2. Run `npm run build` to make `main.js`, or `npm run dev` to rebuild on every change.
3. Run `npm test` to run the tests (they use a fake Notion, no account needed).
4. Optional: create a `.env` file with `OBSIDIAN_VAULT_PATH=/path/to/vault/.obsidian/plugins` and `PLUGIN_ID=obsidotion`, and every build is copied into your vault.

## License

MIT License — Copyright (c) 2024 Fayaz Bin Salam. See [LICENSE](LICENSE) for the full text.

## Contributing

Contributions are very welcome, thank you! Before you start on a pull request, please open an issue and tell me what you would like to add or change. That way we can agree on it first, and your time is not wasted on something that might not fit. Thanks for helping make obsidotion better.

## You might also like

<p><a href="https://openstore.pfay.workers.dev/cards/p32929/0?n=4&amp;repo=obsidotion"><picture><source media="(prefers-color-scheme: dark)" srcset="https://openstore.pfay.workers.dev/cards/p32929/0.svg?n=4&amp;repo=obsidotion&amp;theme=dark"><img src="https://openstore.pfay.workers.dev/cards/p32929/0.svg?n=4&amp;repo=obsidotion&amp;theme=light" width="50%" align="top" alt="More apps by p32929 on OpenStore (1)"></picture></a><a href="https://openstore.pfay.workers.dev/cards/p32929/1?n=4&amp;repo=obsidotion"><picture><source media="(prefers-color-scheme: dark)" srcset="https://openstore.pfay.workers.dev/cards/p32929/1.svg?n=4&amp;repo=obsidotion&amp;theme=dark"><img src="https://openstore.pfay.workers.dev/cards/p32929/1.svg?n=4&amp;repo=obsidotion&amp;theme=light" width="50%" align="top" alt="More apps by p32929 on OpenStore (2)"></picture></a><br><a href="https://openstore.pfay.workers.dev/cards/p32929/2?n=4&amp;repo=obsidotion"><picture><source media="(prefers-color-scheme: dark)" srcset="https://openstore.pfay.workers.dev/cards/p32929/2.svg?n=4&amp;repo=obsidotion&amp;theme=dark"><img src="https://openstore.pfay.workers.dev/cards/p32929/2.svg?n=4&amp;repo=obsidotion&amp;theme=light" width="50%" align="top" alt="More apps by p32929 on OpenStore (3)"></picture></a><a href="https://openstore.pfay.workers.dev/cards/p32929/3?n=4&amp;repo=obsidotion"><picture><source media="(prefers-color-scheme: dark)" srcset="https://openstore.pfay.workers.dev/cards/p32929/3.svg?n=4&amp;repo=obsidotion&amp;theme=dark"><img src="https://openstore.pfay.workers.dev/cards/p32929/3.svg?n=4&amp;repo=obsidotion&amp;theme=light" width="50%" align="top" alt="More apps by p32929 on OpenStore (4)"></picture></a></p>

<p><a href="https://p32929.github.io/share/?repo=obsidotion"><picture><source media="(prefers-color-scheme: dark)" srcset="https://p32929.github.io/readme/footer-share-dark.svg"><img src="https://p32929.github.io/readme/footer-share-light.svg" width="50%" align="top" alt="Share this project with your friends in one click"></picture></a><a href="https://p32929.github.io/support/"><picture><source media="(prefers-color-scheme: dark)" srcset="https://p32929.github.io/readme/footer-support-dark.svg"><img src="https://p32929.github.io/readme/footer-support-light.svg" width="50%" align="top" alt="If you like my work and want to support me, feel free to support"></picture></a><br><a href="https://openstore.pfay.workers.dev/add"><picture><source media="(prefers-color-scheme: dark)" srcset="https://p32929.github.io/readme/footer-join-dark.svg"><img src="https://p32929.github.io/readme/footer-join-light.svg" width="100%" align="top" alt="Put your own apps on OpenStore: free, your listing lives in your own repo"></picture></a></p>
