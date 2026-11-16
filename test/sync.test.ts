import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { notices } from 'obsidian';
import ObsidotionPlugin from '../src/main-new';
import { NotionAPIService } from '../src/services/notion-api';
import { MarkdownConverter } from '../src/services/markdown-converter';
import { Logger } from '../src/utils/logger';
import { FakeNotion, FakeVault } from './fakes';

process.env.DISABLE_LOGS = 'true';
NotionAPIService.rateLimitDelay = 0;

function frontmatterOf(text: string) {
	const match = text.match(/^---\n([\s\S]*?)\n---\n/);
	return match ? parse(match[1]) : {};
}

function bodyOf(text: string) {
	return text.replace(/^---\n[\s\S]*?\n---\n/, '');
}

async function setup(files: Record<string, string>) {
	const vault = new FakeVault(files);
	const notion = new FakeNotion('db1');
	const plugin = new ObsidotionPlugin({ vault } as any, {} as any);
	(plugin as any).data = { notionAPIToken: 'secret_test', databaseID: 'db1' };
	await plugin.onload();
	const confirm = vi.spyOn(plugin, 'confirmPull').mockResolvedValue(true);
	return { vault, notion, plugin, confirm };
}

describe('upload', () => {
	beforeEach(() => { notices.length = 0; });

	it('creates a Notion page for each note and writes the sync info into the frontmatter', async () => {
		const { vault, notion, plugin } = await setup({ 'Daily/Today.md': '# Hello\n\nFirst note.\n', 'Ideas.md': 'An idea\n' });
		await plugin.uploadCommand();

		expect(notion.pages.size).toBe(2);
		const fm = frontmatterOf(vault.files.get('Daily/Today.md')!);
		expect(notion.pages.get(fm.notionID)!.title).toBe('Daily/Today.md:Today');
		expect(fm.filePath).toBe('Daily/Today.md');
		expect(fm.contentHash).toBeTypeOf('string');
		expect(fm.notionHash).toBeTypeOf('string');
		expect(notion.text(fm.notionID)).toBe('Hello\nFirst note.');
		expect(bodyOf(vault.files.get('Daily/Today.md')!)).toBe('# Hello\n\nFirst note.\n');
		expect((plugin as any).data.ownedPageIds).toHaveLength(2);
	});

	it('uploads nothing the second time when nothing changed', async () => {
		const { notion, plugin } = await setup({ 'A.md': 'one\n', 'B.md': 'two\n' });
		await plugin.uploadCommand();
		notion.requests = [];
		await plugin.uploadCommand();
		expect(notion.writes()).toEqual([]);
	});

	it('updates the page after the note is edited', async () => {
		const { vault, notion, plugin } = await setup({ 'A.md': 'old text\n' });
		await plugin.uploadCommand();
		const text = vault.files.get('A.md')!;
		vault.files.set('A.md', text.replace('old text', 'new text'));
		await plugin.uploadCommand();

		const id = frontmatterOf(vault.files.get('A.md')!).notionID;
		expect(notion.pages.size).toBe(1);
		expect(notion.text(id)).toBe('new text');
	});

	it('updates the Notion title after the note is renamed', async () => {
		const { vault, notion, plugin } = await setup({ 'A.md': 'text\n' });
		await plugin.uploadCommand();
		vault.rename('A.md', 'Folder/B.md');
		await plugin.uploadCommand();

		const id = frontmatterOf(vault.files.get('Folder/B.md')!).notionID;
		expect(notion.pages.size).toBe(1);
		expect(notion.pages.get(id)!.title).toBe('Folder/B.md:B');
		expect(frontmatterOf(vault.files.get('Folder/B.md')!).filePath).toBe('Folder/B.md');
	});

	it('archives only its own page when a note is deleted, never pages made in Notion', async () => {
		const { vault, notion, plugin } = await setup({ 'Keep.md': 'keep\n', 'Gone.md': 'gone\n' });
		const foreign = notion.addPage('Made in Notion', [{ type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: 'hi' } }] } }]);
		await plugin.uploadCommand();
		const goneId = frontmatterOf(vault.files.get('Gone.md')!).notionID;
		const keepId = frontmatterOf(vault.files.get('Keep.md')!).notionID;

		vault.delete('Gone.md');
		await plugin.uploadCommand();

		expect(notion.pages.get(goneId)!.archived).toBe(true);
		expect(notion.pages.get(keepId)!.archived).toBe(false);
		expect(notion.pages.get(foreign)!.archived).toBe(false);
		expect((plugin as any).data.ownedPageIds).toEqual([keepId]);
	});

	it('archives nothing when a note cannot be read', async () => {
		const { vault, notion, plugin } = await setup({ 'A.md': 'a\n', 'B.md': 'b\n' });
		await plugin.uploadCommand();
		const bId = frontmatterOf(vault.files.get('B.md')!).notionID;

		vault.unreadable.add('B.md');
		await plugin.uploadCommand();

		expect(notion.pages.get(bId)!.archived).toBe(false);
		expect(notices.some(n => n.includes('nothing archived'))).toBe(true);
	});

	it('keeps tricky frontmatter values and comments intact', async () => {
		const note = [
			'---',
			'# my comment',
			'title: "Plan: part #2"',
			"quote: 'it''s \"fine\"'",
			'tags:',
			'  - work',
			'  - ideas',
			'summary: |',
			'  line one',
			'  line two',
			'---',
			'Body text',
			'',
		].join('\n');
		const { vault, plugin } = await setup({ 'Tricky.md': note });
		await plugin.uploadCommand();
		await plugin.uploadCommand();

		const text = vault.files.get('Tricky.md')!;
		const fm = frontmatterOf(text);
		expect(fm.title).toBe('Plan: part #2');
		expect(fm.quote).toBe('it\'s "fine"');
		expect(fm.tags).toEqual(['work', 'ideas']);
		expect(fm.summary).toBe('line one\nline two\n');
		expect(fm.notionID).toBeTruthy();
		expect(text).toContain('# my comment');
		expect(bodyOf(text)).toBe('Body text\n');
	});

	it('uploads a long note in pieces Notion accepts', async () => {
		const items = Array.from({ length: 150 }, (_, i) => `- item ${i}`).join('\n');
		const longParagraph = 'word '.repeat(1000).trim();
		const { vault, notion, plugin } = await setup({ 'Long.md': `${items}\n\n${longParagraph}\n` });
		await plugin.uploadCommand();

		const id = frontmatterOf(vault.files.get('Long.md')!).notionID;
		expect(id).toBeTruthy();
		const blocks = notion.blocks.get(id)!;
		expect(blocks).toHaveLength(151);
		expect(blocks[150].paragraph.rich_text.map((t: any) => t.text.content).join('')).toBe(longParagraph);
		for (const r of notion.requests) {
			expect((r.body?.children || []).length).toBeLessThanOrEqual(100);
		}
	});

	it('waits and retries when Notion says too many requests', async () => {
		const { vault, notion, plugin } = await setup({ 'A.md': 'a\n' });
		notion.rateLimitOnce = true;
		await plugin.uploadCommand();
		expect(frontmatterOf(vault.files.get('A.md')!).notionID).toBeTruthy();
	});
});

describe('pull', () => {
	it('changes nothing right after an upload, and does not ask', async () => {
		const md = '# Title\n\nSome **bold** and *italic* text with a [link](https://example.com).\n\n- one\n- two\n    - nested\n\n1. first\n2. second\n\n- [ ] todo\n- [x] done\n\n> a quote\n\n```js\nconst x = 1;\n```\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n';
		const { vault, plugin, confirm } = await setup({ 'Rich.md': md });
		await plugin.uploadCommand();
		const before = vault.files.get('Rich.md');
		await plugin.pullCommand();

		expect(confirm).not.toHaveBeenCalled();
		expect(bodyOf(vault.files.get('Rich.md')!)).toBe(bodyOf(before!));
	});

	it('brings in changes made in Notion, keeps the frontmatter, and asks once', async () => {
		const { vault, notion, plugin, confirm } = await setup({ 'A.md': '---\ntags:\n  - x\n---\nold\n' });
		await plugin.uploadCommand();
		const id = frontmatterOf(vault.files.get('A.md')!).notionID;
		notion.setBlocks(id, [{ type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: 'edited in Notion' } }] } }]);

		await plugin.pullCommand();

		expect(confirm).toHaveBeenCalledTimes(1);
		const text = vault.files.get('A.md')!;
		expect(bodyOf(text)).toBe('edited in Notion\n');
		expect(frontmatterOf(text).tags).toEqual(['x']);
		expect(frontmatterOf(text).notionID).toBe(id);

		// Pulling again finds nothing new, and the pulled text is not uploaded back as a change.
		confirm.mockClear();
		await plugin.pullCommand();
		expect(confirm).not.toHaveBeenCalled();
		notion.requests = [];
		await plugin.uploadCommand();
		expect(notion.writes()).toEqual([]);
	});

	it('changes nothing when the pull is cancelled', async () => {
		const { vault, notion, plugin, confirm } = await setup({ 'A.md': 'old\n' });
		await plugin.uploadCommand();
		const id = frontmatterOf(vault.files.get('A.md')!).notionID;
		notion.setBlocks(id, [{ type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: 'new' } }] } }]);
		confirm.mockResolvedValue(false);

		await plugin.pullCommand();
		expect(bodyOf(vault.files.get('A.md')!)).toBe('old\n');
	});

	it('adds notes for new Notion pages', async () => {
		const { vault, notion, plugin } = await setup({});
		const paragraph = (text: string) => ({ type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: text } }] } });
		const ownPath = notion.addPage('Projects/2026/Plan.md:Plan', [paragraph('the plan')]);
		const plain = notion.addPage('Shopping: list', [paragraph('milk')]);

		await plugin.pullCommand();

		expect(bodyOf(vault.files.get('Projects/2026/Plan.md')!)).toBe('the plan\n');
		expect(frontmatterOf(vault.files.get('Projects/2026/Plan.md')!).notionID).toBe(ownPath);
		expect([...vault.folders]).toEqual(['Projects', 'Projects/2026', 'Notion']);
		expect(bodyOf(vault.files.get('Notion/Shopping_ list.md')!)).toBe('milk\n');
		expect(frontmatterOf(vault.files.get('Notion/Shopping_ list.md')!).notionID).toBe(plain);

		// The new notes are now in sync: an upload changes nothing.
		notion.requests = [];
		await plugin.uploadCommand();
		expect(notion.writes()).toEqual([]);
	});

	it('does not bring back a page whose note was deleted here', async () => {
		const { vault, notion, plugin } = await setup({ 'A.md': 'a\n' });
		await plugin.uploadCommand();
		vault.delete('A.md');
		await plugin.pullCommand();
		expect(vault.files.size).toBe(0);
		expect(notion.pages.size).toBe(1);
	});

	it('does not overwrite notes synced by an older version (no notionHash yet)', async () => {
		const { vault, notion, plugin, confirm } = await setup({});
		const id = notion.addPage('A.md:A', [{ type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: 'notion text' } }] } }]);
		vault.files.set('A.md', `---\nnotionID: ${id}\ncontentHash: -123\nfilePath: A.md\n---\nlocal text\n`);

		await plugin.pullCommand();

		expect(confirm).not.toHaveBeenCalled();
		expect(bodyOf(vault.files.get('A.md')!)).toBe('local text\n');
		expect(frontmatterOf(vault.files.get('A.md')!).notionHash).toBeTypeOf('string');
	});
});

describe('markdown converter', () => {
	const converter = new MarkdownConverter(new Logger('test'));

	it('turns Notion blocks back into the same markdown', () => {
		const md = [
			'# H1',
			'',
			'## H2',
			'',
			'### H3',
			'',
			'Plain **bold** *italic* `code` ~~strike~~ [link](https://example.com)',
			'',
			'- a',
			'- b',
			'    - b1',
			'',
			'1. one',
			'2. two',
			'',
			'- [ ] open',
			'- [x] done',
			'',
			'> quoted',
			'> two lines',
			'',
			'```python',
			'print("hi")',
			'```',
			'',
			'| x | y |',
			'| --- | --- |',
			'| 1 | 2 |',
			'',
		].join('\n');
		expect(converter.notionBlocksToMarkdown(converter.markdownToNotionBlocks(md))).toBe(md);
	});

	it('restarts numbering for a second numbered list', () => {
		const md = '1. a\n2. b\n\ntext\n\n1. c\n';
		expect(converter.notionBlocksToMarkdown(converter.markdownToNotionBlocks(md))).toBe(md);
	});

	it('reads notes without frontmatter, and empty frontmatter', () => {
		expect(converter.parseMarkdownWithFrontmatter('just text\n').content).toBe('just text\n');
		const empty = converter.parseMarkdownWithFrontmatter('---\n---\nbody\n');
		expect(empty.content).toBe('body\n');
		expect(converter.buildNote(empty.doc, { a: 'b' }, 'body\n')).toBe('---\na: b\n---\nbody\n');
	});
});
