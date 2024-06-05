import { Notice, requestUrl, TFile, Vault, normalizePath, stringifyYaml } from 'obsidian';
import ObsidianSyncNotionPlugin from './main';
import markdownTable from 'markdown-table';

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
      return;
    }

    const fullTitle = titleProperty.title[0].text.content;
    const separatorIndex = fullTitle.lastIndexOf(':');
    if (separatorIndex === -1) {
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

    const markdown = await this.blocksToMarkdown(blocks);

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
    const yamlContent = `---\n${stringifyYaml(frontmatter)}\n---\n${markdown}`;

    if (existingFile && existingFile instanceof TFile) {
      await this.plugin.app.vault.modify(existingFile, yamlContent);
      new Notice(`Updated file: ${normalizedFilePath}`);
    } else {
      await this.plugin.app.vault.create(normalizedFilePath, yamlContent);
      new Notice(`Created file: ${normalizedFilePath}`);
    }
  }

  async blocksToMarkdown(blocks: any[], indentLevel: number = 0, numbering: number[] = []): Promise<string> {
    let markdown = '';
    for (const block of blocks) {
      markdown += await this.blockToMarkdown(block, indentLevel, numbering);
    }
    return markdown;
  }

  async blockToMarkdown(block: any, indentLevel: number = 0, numbering: number[] = []): Promise<string> {
    const indent = '    '.repeat(indentLevel);
    let markdown = '';
    const nextIndentLevel = indentLevel + 1;

    switch (block.type) {
      case 'paragraph':
        markdown += indent + (block.paragraph?.rich_text?.map((text: any) => text.text.content).join('') || '') + '\n';
        break;
      case 'heading_1':
        markdown += `# ${block.heading_1?.rich_text?.map((text: any) => text.text.content).join('') || ''}\n`;
        break;
      case 'heading_2':
        markdown += `## ${block.heading_2?.rich_text?.map((text: any) => text.text.content).join('') || ''}\n`;
        break;
      case 'heading_3':
        markdown += `### ${block.heading_3?.rich_text?.map((text: any) => text.text.content).join('') || ''}\n`;
        break;
      case 'bulleted_list_item':
        markdown += `${indent}- ${block.bulleted_list_item?.rich_text?.map((text: any) => text.text.content).join('') || ''}\n`;
        if (block.has_children) {
          const childBlocks = await this.getBlockChildren(block.id);
          markdown += await this.blocksToMarkdown(childBlocks, nextIndentLevel, numbering);
        }
        break;
      case 'numbered_list_item':
        const currentNumber = numbering[indentLevel] || 1;
        markdown += `${indent}${currentNumber}. ${block.numbered_list_item?.rich_text?.map((text: any) => text.text.content).join('') || ''}\n`;
        numbering[indentLevel] = currentNumber + 1;
        if (block.has_children) {
          const childBlocks = await this.getBlockChildren(block.id);
          markdown += await this.blocksToMarkdown(childBlocks, nextIndentLevel, numbering);
        }
        break;
      case 'table':
        markdown += this.convertTable(block) + '\n';
        break;
      default:
        console.log('Unhandled block type:', block.type, block);
    }

    return markdown;
  }

  async getBlockChildren(blockId: string): Promise<any[]> {
    let allChildren: any[] = [];
    let cursor: string | undefined = undefined;

    do {
      const response = await requestUrl({
        url: `https://api.notion.com/v1/blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.plugin.settings.notionAPI}`,
          'Notion-Version': '2022-06-28',
        },
      });

      const data = response.json;
      allChildren = allChildren.concat(data.results);
      cursor = data.next_cursor ?? undefined;
    } while (cursor);

    return allChildren;
  }

  convertTable(block: any): string {
    if (!block.table || !block.table.table_width || !block.table.rows) {
      return '';
    }

    const headers = block.table.has_column_header ? block.table.rows[0].cells.map((cell: any) => cell.map((text: any) => text.text.content).join('')) : [];
    const rows = block.table.has_column_header ? block.table.rows.slice(1).map((row: any) => row.cells.map((cell: any) => cell.map((text: any) => text.text.content).join(''))) : block.table.rows.map((row: any) => row.cells.map((cell: any) => cell.map((text: any) => text.text.content).join('')));

    return markdownTable([headers, ...rows]);
  }
}
