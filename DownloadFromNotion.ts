import { Notice, requestUrl, TFile, Vault, normalizePath } from 'obsidian';
import * as yaml from 'yaml';
import ObsidianSyncNotionPlugin from './main';

export class DownloadFromNotion {
  plugin: ObsidianSyncNotionPlugin;

  constructor(plugin: ObsidianSyncNotionPlugin) {
    this.plugin = plugin;
  }

  async syncAllNotes() {
    const response = await requestUrl({
      url: `https://api.notion.com/v1/databases/${this.plugin.settings.databaseID}/query`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.plugin.settings.notionAPI}`,
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({}),
    });

    const results = response.json.results;
    if (results) {
      await Promise.all(results.map(page => this.downloadPage(page)));
    }
  }

  async downloadPage(page: any) {
    const properties = page.properties;
    const titleProperty = properties.Name;

    if (!titleProperty || !titleProperty.title || !titleProperty.title.length || !titleProperty.title[0].text) {
      // new Notice(`Page ${page.id} does not have a valid title. Skipping...`);
      return;
    }

    const fullTitle = titleProperty.title[0].text.content;
    const separatorIndex = fullTitle.lastIndexOf(':');
    if (separatorIndex === -1) {
      // new Notice(`Invalid title format: ${fullTitle}. Skipping...`);
      return;
    }

    const filePath = fullTitle.substring(0, separatorIndex);
    const title = fullTitle.substring(separatorIndex + 1);

    const blocksResponse = await requestUrl({
      url: `https://api.notion.com/v1/blocks/${page.id}/children?page_size=100`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.plugin.settings.notionAPI}`,
        'Notion-Version': '2022-06-28',
      },
    });

    const blocks = blocksResponse.json.results;
    console.log('Fetched blocks:', blocks);  // Debugging

    const markdown = this.blocksToMarkdown(blocks);
    console.log('Converted markdown:', markdown);  // Debugging

    const normalizedFilePath = normalizePath(filePath);
    const dirPath = normalizedFilePath.substring(0, normalizedFilePath.lastIndexOf('/'));

    if (!(await this.plugin.app.vault.adapter.exists(dirPath))) {
      await this.plugin.app.vault.adapter.mkdir(dirPath);
    }

    const existingFile = this.plugin.app.vault.getAbstractFileByPath(normalizedFilePath);

    const frontmatter = {
      notionID: page.id,
      link: `https://www.notion.so/${page.id.replace(/-/g, '')}`,
      ...(properties.Tags && properties.Tags.multi_select ? { tags: properties.Tags.multi_select.map((tag: any) => tag.name) } : {})
    };
    const yamlContent = `---\n${yaml.stringify(frontmatter)}\n---\n${markdown}`;

    if (existingFile && existingFile instanceof TFile) {
      await this.plugin.app.vault.modify(existingFile, yamlContent);
      new Notice(`Updated file: ${normalizedFilePath}`);
    } else {
      await this.plugin.app.vault.create(normalizedFilePath, yamlContent);
      new Notice(`Created file: ${normalizedFilePath}`);
    }
  }

  blocksToMarkdown(blocks: any[]): string {
    return blocks.map(block => this.blockToMarkdown(block)).join('\n');
  }

  blockToMarkdown(block: any): string {
    switch (block.type) {
      case 'paragraph':
        return block.paragraph?.rich_text?.map((text: any) => text.text.content).join('') || '';
      case 'heading_1':
        return `# ${block.heading_1?.rich_text?.map((text: any) => text.text.content).join('') || ''}`;
      case 'heading_2':
        return `## ${block.heading_2?.rich_text?.map((text: any) => text.text.content).join('') || ''}`;
      case 'heading_3':
        return `### ${block.heading_3?.rich_text?.map((text: any) => text.text.content).join('') || ''}`;
      case 'bulleted_list_item':
        return `- ${block.bulleted_list_item?.rich_text?.map((text: any) => text.text.content).join('') || ''}`;
      case 'numbered_list_item':
        return `1. ${block.numbered_list_item?.rich_text?.map((text: any) => text.text.content).join('') || ''}`;
      default:
        console.log('Unhandled block type:', block.type, block);  // Debugging
        return '';
    }
  }
}
