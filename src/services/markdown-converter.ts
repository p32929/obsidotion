import { markdownToBlocks } from '@tryfabric/martian';
import { Document, parseDocument } from 'yaml';
import { NotionBlock } from '../types';
import { Logger } from '../utils/logger';

const LIST_TYPES = ['bulleted_list_item', 'numbered_list_item', 'to_do'];

export class MarkdownConverter {
	private logger: Logger;

	constructor(logger: Logger) {
		this.logger = logger;
	}

	/**
	 * Convert markdown content to Notion blocks.
	 * Long text is split into pieces of at most 2000 characters (Notion's limit).
	 */
	markdownToNotionBlocks(markdown: string): any[] {
		try {
			return markdownToBlocks(markdown, { notionLimits: { truncate: true } });
		} catch (error) {
			this.logger.error('Failed to convert markdown to blocks', error);
			// Fallback: plain paragraphs, each piece within Notion's 2000 character limit.
			const pieces = markdown.match(/[\s\S]{1,2000}/g) || [];
			return pieces.map(piece => ({
				object: 'block',
				type: 'paragraph',
				paragraph: { rich_text: [{ type: 'text', text: { content: piece } }] },
			}));
		}
	}

	/**
	 * Convert Notion blocks to markdown content.
	 * Nested blocks are read from block.children (filled in by NotionAPIService.getPageBlocks)
	 * or from block[type].children (the shape markdownToNotionBlocks produces).
	 */
	notionBlocksToMarkdown(blocks: NotionBlock[]): string {
		const markdown = this.renderBlocks(blocks, 0);
		return markdown ? markdown + '\n' : '';
	}

	private renderBlocks(blocks: NotionBlock[], depth: number): string {
		let out = '';
		let previousType = '';
		let number = 0;

		for (const block of blocks) {
			number = block.type === 'numbered_list_item' && previousType === 'numbered_list_item' ? number + 1 : 1;
			const markdown = this.blockToMarkdown(block, depth, number);
			if (!markdown) continue;

			// List items stay together; everything else is separated by an empty line.
			const tight = LIST_TYPES.includes(block.type) && block.type === previousType;
			out += out ? (tight ? '\n' : '\n\n') + markdown : markdown;
			previousType = block.type;
		}

		return out;
	}

	private childrenOf(block: NotionBlock): NotionBlock[] {
		return block.children || block[block.type]?.children || [];
	}

	private blockToMarkdown(block: NotionBlock, depth: number, number: number): string {
		const indent = '    '.repeat(depth);
		const data = block[block.type] || {};
		const text = this.extractRichText(data.rich_text);
		const children = this.childrenOf(block);
		const nested = children.length ? '\n' + this.renderBlocks(children, depth + 1) : '';

		switch (block.type) {
			case 'paragraph':
				return indent + text + nested;
			case 'heading_1':
				return `# ${text}`;
			case 'heading_2':
				return `## ${text}`;
			case 'heading_3':
				return `### ${text}`;
			case 'bulleted_list_item':
				return `${indent}- ${text}${nested}`;
			case 'numbered_list_item':
				return `${indent}${number}. ${text}${nested}`;
			case 'to_do':
				return `${indent}- [${data.checked ? 'x' : ' '}] ${text}${nested}`;
			case 'code': {
				const language = data.language && data.language !== 'plain text' ? data.language : '';
				const code = (data.rich_text || []).map((t: any) => t.text?.content ?? t.plain_text ?? '').join('');
				return '```' + language + '\n' + code + '\n```';
			}
			case 'quote': {
				// Text can be in the quote itself (Notion) or in paragraphs inside it (markdownToNotionBlocks).
				const quoted = [text, children.length ? this.renderBlocks(children, 0) : ''].filter(Boolean).join('\n\n');
				return quoted.split('\n').map(line => (line ? `> ${line}` : '>')).join('\n');
			}
			case 'divider':
				return '---';
			case 'table':
				return this.tableToMarkdown(children);
			case 'image': {
				const url = data.file?.url || data.external?.url;
				return url ? `![${this.extractRichText(data.caption)}](${url})` : '';
			}
			default: {
				this.logger.warn(`Unhandled block type: ${block.type}`);
				return text ? indent + text + nested : nested.trim();
			}
		}
	}

	private tableToMarkdown(rows: NotionBlock[]): string {
		const cells = rows
			.filter(row => row.type === 'table_row')
			.map(row => (row.table_row?.cells || []).map((cell: any[]) => this.extractRichText(cell).replace(/\|/g, '\\|')));
		if (!cells.length) return '';
		const line = (row: string[]) => `| ${row.join(' | ')} |`;
		const header = line(cells[0]);
		const separator = line(cells[0].map(() => '---'));
		return [header, separator, ...cells.slice(1).map(line)].join('\n');
	}

	private extractRichText(richTextArray?: any[]): string {
		if (!Array.isArray(richTextArray)) {
			return '';
		}

		return richTextArray.map(item => {
			let text = item.text?.content ?? item.plain_text ?? '';
			if (!text) return '';

			if (item.annotations?.code) text = `\`${text}\``;
			if (item.annotations?.bold) text = `**${text}**`;
			if (item.annotations?.italic) text = `*${text}*`;
			if (item.annotations?.strikethrough) text = `~~${text}~~`;

			const url = item.text?.link?.url || item.href;
			if (url) text = `[${text}](${url})`;

			return text;
		}).join('');
	}

	/**
	 * Split a note into its frontmatter and body.
	 * The frontmatter is a YAML Document, so comments and order survive when it is written back.
	 */
	parseMarkdownWithFrontmatter(markdown: string): { frontmatter: any; content: string; doc: Document } {
		const match = markdown.match(/^---\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)([\s\S]*)$/);

		if (match) {
			const doc = parseDocument(match[1] ?? '');
			const frontmatter = doc.toJS() ?? {};
			if (doc.errors.length === 0 && typeof frontmatter === 'object' && !Array.isArray(frontmatter)) {
				if (!doc.contents) doc.contents = doc.createNode({}) as any;
				return { frontmatter, content: match[2], doc };
			}
			this.logger.warn('Could not read the frontmatter, treating the note as plain markdown');
		}

		return { frontmatter: {}, content: markdown, doc: new Document({}) };
	}

	/** Put frontmatter values (written by this plugin) and the body back together. */
	buildNote(doc: Document, values: Record<string, string>, content: string): string {
		for (const [key, value] of Object.entries(values)) {
			doc.set(key, value);
		}
		return `---\n${String(doc)}---\n${content}`;
	}
}
