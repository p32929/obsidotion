import { markdownToBlocks } from '@tryfabric/martian';
import { NotionBlock } from '../types';
import { Logger } from '../utils/logger';

export class MarkdownConverter {
	private logger: Logger;

	constructor(logger: Logger) {
		this.logger = logger;
	}

	/**
	 * Convert markdown content to Notion blocks
	 */
	markdownToNotionBlocks(markdown: string): any[] {
		try {
			this.logger.debug('Converting markdown to blocks, content preview:', markdown.substring(0, 200) + '...');
			const blocks = markdownToBlocks(markdown);
			this.logger.debug('Converted markdown to blocks', { 
				blockCount: blocks.length,
				firstFewBlockTypes: blocks.slice(0, 3).map(b => b.type)
			});
			
			// Log the first block in detail for debugging
			if (blocks.length > 0) {
				this.logger.debug('First block details:', JSON.stringify(blocks[0], null, 2));
			}
			
			return blocks;
		} catch (error) {
			this.logger.error('Failed to convert markdown to blocks', error);
			// Fallback: create a simple paragraph block
			const fallbackBlock = {
				object: 'block',
				type: 'paragraph',
				paragraph: {
					rich_text: [{
						type: 'text',
						text: { content: markdown }
					}]
				}
			};
			this.logger.debug('Using fallback block:', fallbackBlock);
			return [fallbackBlock];
		}
	}

	/**
	 * Convert Notion blocks to markdown content
	 */
	async notionBlocksToMarkdown(blocks: NotionBlock[], indentLevel: number = 0, numbering: number[] = []): Promise<string> {
		let markdown = '';
		
		for (const block of blocks) {
			markdown += await this.blockToMarkdown(block, indentLevel, numbering);
		}
		
		return markdown;
	}

	private async blockToMarkdown(block: NotionBlock, indentLevel: number = 0, numbering: number[] = []): Promise<string> {
		const indent = '    '.repeat(indentLevel);
		let markdown = '';
		const nextIndentLevel = indentLevel + 1;

		try {
			switch (block.type) {
				case 'paragraph':
					markdown += indent + this.extractRichText(block.paragraph?.rich_text) + '\n';
					break;

				case 'heading_1':
					markdown += `# ${this.extractRichText(block.heading_1?.rich_text)}\n`;
					break;

				case 'heading_2':
					markdown += `## ${this.extractRichText(block.heading_2?.rich_text)}\n`;
					break;

				case 'heading_3':
					markdown += `### ${this.extractRichText(block.heading_3?.rich_text)}\n`;
					break;

				case 'bulleted_list_item':
					markdown += `${indent}- ${this.extractRichText(block.bulleted_list_item?.rich_text)}\n`;
					if (block.has_children) {
						// Note: In a real implementation, you'd need to fetch child blocks
						// This is a placeholder for child block handling
						this.logger.debug('Block has children that need to be fetched', { blockId: block.id });
					}
					break;

				case 'numbered_list_item':
					const currentNumber = numbering[indentLevel] || 1;
					markdown += `${indent}${currentNumber}. ${this.extractRichText(block.numbered_list_item?.rich_text)}\n`;
					numbering[indentLevel] = currentNumber + 1;
					if (block.has_children) {
						this.logger.debug('Numbered list block has children that need to be fetched', { blockId: block.id });
					}
					break;

				case 'code':
					const language = block.code?.language || '';
					const codeContent = this.extractRichText(block.code?.rich_text);
					markdown += `\`\`\`${language}\n${codeContent}\n\`\`\`\n`;
					break;

				case 'quote':
					markdown += `> ${this.extractRichText(block.quote?.rich_text)}\n`;
					break;

				case 'divider':
					markdown += '---\n';
					break;

				case 'table':
					markdown += this.convertTableToMarkdown(block) + '\n';
					break;

				case 'image':
					const imageUrl = block.image?.file?.url || block.image?.external?.url;
					const caption = this.extractRichText(block.image?.caption);
					if (imageUrl) {
						markdown += `![${caption}](${imageUrl})\n`;
					}
					break;

				case 'to_do':
					const checked = block.to_do?.checked ? '[x]' : '[ ]';
					markdown += `${indent}- ${checked} ${this.extractRichText(block.to_do?.rich_text)}\n`;
					break;

				default:
					this.logger.warn(`Unhandled block type: ${block.type}`, block);
					// Fallback: try to extract any rich text content
					const fallbackText = this.extractAnyRichText(block);
					if (fallbackText) {
						markdown += `${indent}${fallbackText}\n`;
					}
			}
		} catch (error) {
			this.logger.error(`Error converting block to markdown`, { blockType: block.type, error });
			markdown += `${indent}[Error converting block of type: ${block.type}]\n`;
		}

		return markdown;
	}

	private extractRichText(richTextArray?: any[]): string {
		if (!richTextArray || !Array.isArray(richTextArray)) {
			return '';
		}

		return richTextArray.map(item => {
			let text = item.text?.content || '';
			
			// Apply formatting
			if (item.annotations?.bold) text = `**${text}**`;
			if (item.annotations?.italic) text = `*${text}*`;
			if (item.annotations?.code) text = `\`${text}\``;
			if (item.annotations?.strikethrough) text = `~~${text}~~`;
			
			// Handle links
			if (item.text?.link?.url) {
				text = `[${text}](${item.text.link.url})`;
			}
			
			return text;
		}).join('');
	}

	private extractAnyRichText(block: any): string {
		// Try to find rich text in any property of the block
		for (const [key, value] of Object.entries(block)) {
			if (value && typeof value === 'object' && (value as any).rich_text) {
				return this.extractRichText((value as any).rich_text);
			}
		}
		return '';
	}

	private convertTableToMarkdown(block: any): string {
		try {
			if (!block.table) return '';

			// This is a simplified table conversion
			// In practice, you'd need to fetch table row children
			this.logger.debug('Table block detected, but full table conversion requires child block fetching');
			return '| Table content needs to be fetched from child blocks |\n|---|\n';
		} catch (error) {
			this.logger.error('Error converting table to markdown', error);
			return '[Table conversion error]\n';
		}
	}

	/**
	 * Extract frontmatter and content from markdown
	 */
	parseMarkdownWithFrontmatter(markdown: string): { frontmatter: any; content: string } {
		const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
		const match = markdown.match(frontmatterRegex);

		if (match) {
			try {
				// Simple YAML parsing - in production you'd use a proper YAML parser
				const frontmatter = this.parseSimpleYaml(match[1]);
				return { frontmatter, content: match[2] };
			} catch (error) {
				this.logger.warn('Failed to parse frontmatter, treating as regular markdown', error);
			}
		}

		return { frontmatter: {}, content: markdown };
	}

	private parseSimpleYaml(yamlString: string): any {
		const result: any = {};
		const lines = yamlString.split('\n');

		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed && trimmed.includes(':')) {
				const [key, ...valueParts] = trimmed.split(':');
				const value = valueParts.join(':').trim();
				
				// Handle arrays (simple case)
				if (value.startsWith('[') && value.endsWith(']')) {
					result[key.trim()] = value.slice(1, -1).split(',').map(v => v.trim().replace(/['"]/g, ''));
				} else {
					result[key.trim()] = value.replace(/['"]/g, '');
				}
			}
		}

		return result;
	}
} 