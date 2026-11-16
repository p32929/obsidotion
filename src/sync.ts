import { TFile, Vault, normalizePath } from 'obsidian';
import { Document } from 'yaml';
import { NotionPage, PluginSettings } from './types';
import { Logger } from './utils/logger';
import { Validator } from './utils/validator';
import { NotionAPIService } from './services/notion-api';
import { MarkdownConverter } from './services/markdown-converter';

/** Folder for notes pulled from Notion pages that were not made by this plugin. */
export const PULL_FOLDER = 'Notion';

interface Note {
	file: TFile;
	frontmatter: any;
	doc: Document;
	content: string;
}

export interface PullPlan {
	/** Synced notes whose Notion page changed since the last sync. */
	updates: { note: Note; markdown: string }[];
	/** Notion pages that have no note in this vault yet. */
	creates: { page: NotionPage; path: string }[];
	/** Notes synced by an older version: remember Notion's current content without touching the note. */
	baselines: { note: Note; markdown: string }[];
}

export interface UploadResult {
	uploaded: number;
	failed: number;
	archived: number;
	skippedCleanup: boolean;
}

/** Small, stable 32-bit hash, enough to notice that text changed. */
export function contentHash(content: string): string {
	let hash = 0;
	for (let i = 0; i < content.length; i++) {
		hash = ((hash << 5) - hash + content.charCodeAt(i)) | 0;
	}
	return hash.toString();
}

export class Syncer {
	constructor(
		private vault: Vault,
		private notion: NotionAPIService,
		private converter: MarkdownConverter,
		private logger: Logger,
		private settings: PluginSettings,
		private save: () => Promise<void>,
	) {}

	/** Read every markdown note. Notes that cannot be read are counted, never guessed at. */
	private async readNotes(): Promise<{ notes: Note[]; readErrors: number }> {
		const notes: Note[] = [];
		let readErrors = 0;
		for (const file of this.vault.getMarkdownFiles()) {
			try {
				const text = await this.vault.read(file);
				const { frontmatter, content, doc } = this.converter.parseMarkdownWithFrontmatter(text);
				notes.push({ file, frontmatter, content, doc });
			} catch (error) {
				readErrors++;
				this.logger.warn(`Could not read ${file.path}: ${error.message}`);
			}
		}
		return { notes, readErrors };
	}

	private notionIdOf(note: Note): string | undefined {
		const id = note.frontmatter?.notionID;
		return id ? String(id) : undefined;
	}

	private own(id: string) {
		if (!this.settings.ownedPageIds.includes(id)) this.settings.ownedPageIds.push(id);
	}

	/** Title used in Notion: the note's path, then its name. Pull uses it to put the note back in place. */
	static titleFor(file: TFile): string {
		return `${file.path}:${file.basename}`;
	}

	private async writeNote(note: Note, notionId: string, content: string, notionMarkdown: string) {
		const text = this.converter.buildNote(note.doc, {
			notionID: notionId,
			link: `https://www.notion.so/${notionId.replace(/-/g, '')}`,
			lastSync: new Date().toISOString(),
			filePath: note.file.path,
			contentHash: contentHash(content),
			notionHash: contentHash(notionMarkdown),
		}, content);
		await this.vault.modify(note.file, text);
	}

	/** What the page looks like in Notion now, as markdown. */
	private async notionMarkdown(pageId: string): Promise<string> {
		return this.converter.notionBlocksToMarkdown(await this.notion.getPageBlocks(pageId));
	}

	async upload(): Promise<UploadResult> {
		const { notes, readErrors } = await this.readNotes();
		const result: UploadResult = { uploaded: 0, failed: 0, archived: 0, skippedCleanup: false };

		// Pages linked from a note were made by this plugin (also covers notes synced by older versions).
		for (const note of notes) {
			const id = this.notionIdOf(note);
			if (id) this.own(id);
		}

		// Archive pages of notes deleted from this vault. Only pages this plugin made, and only
		// when every note could be read, so a read error can never make a page look deleted.
		if (readErrors > 0) {
			result.skippedCleanup = true;
			this.logger.warn('Some notes could not be read, so no Notion pages were archived this time');
		} else {
			const linked = new Set(notes.map(n => this.notionIdOf(n)).filter(Boolean));
			for (const id of [...this.settings.ownedPageIds]) {
				if (linked.has(id)) continue;
				try {
					await this.notion.deletePage(id);
					result.archived++;
				} catch (error) {
					this.logger.warn(`Could not archive Notion page ${id}: ${error.message}`);
				}
				// Forget it either way: it was archived, or it no longer exists.
				this.settings.ownedPageIds = this.settings.ownedPageIds.filter(owned => owned !== id);
			}
		}

		for (const note of notes) {
			const id = this.notionIdOf(note);
			const changed = !id ||
				String(note.frontmatter.contentHash) !== contentHash(note.content) ||
				note.frontmatter.filePath !== note.file.path;
			if (!changed) continue;

			try {
				const blocks = this.converter.markdownToNotionBlocks(note.content);
				const title = Syncer.titleFor(note.file);
				let pageId: string;
				if (id) {
					await this.notion.updatePage(id, title);
					await this.notion.clearPageBlocks(id);
					await this.notion.appendBlocks(id, blocks);
					pageId = id;
				} else {
					pageId = await this.notion.createPage(this.settings.databaseID, title, blocks);
				}
				this.own(pageId);
				await this.writeNote(note, pageId, note.content, await this.notionMarkdown(pageId));
				result.uploaded++;
			} catch (error) {
				result.failed++;
				this.logger.warn(`Failed to upload ${note.file.path}: ${error.message}`);
			}
		}

		await this.save();
		return result;
	}

	/** Work out what a pull would change, without changing anything. */
	async planPull(): Promise<PullPlan> {
		const { notes } = await this.readNotes();
		const plan: PullPlan = { updates: [], creates: [], baselines: [] };
		const linked = new Set<string>();

		for (const note of notes) {
			const id = this.notionIdOf(note);
			if (!id) continue;
			linked.add(id);
			try {
				const markdown = await this.notionMarkdown(id);
				const hash = contentHash(markdown);
				if (note.frontmatter.notionHash === undefined) {
					plan.baselines.push({ note, markdown });
				} else if (String(note.frontmatter.notionHash) !== hash && contentHash(note.content) !== hash) {
					plan.updates.push({ note, markdown });
				}
			} catch (error) {
				this.logger.warn(`Could not check ${note.file.path}: ${error.message}`);
			}
		}

		// New pages in the database. Pages this plugin owns but that have no note were deleted
		// here and wait to be archived on the next upload, so they are not brought back.
		const taken = new Set(notes.map(n => n.file.path));
		for (const page of await this.notion.queryDatabase(this.settings.databaseID)) {
			if (page.archived || linked.has(page.id) || this.settings.ownedPageIds.includes(page.id)) continue;
			const path = this.pathForPage(page, taken);
			taken.add(path);
			plan.creates.push({ page, path });
		}

		return plan;
	}

	/** Where a new note for a Notion page goes: its original path if the title has one, else the Notion folder. */
	private pathForPage(page: NotionPage, taken: Set<string>): string {
		const title = NotionAPIService.getPageTitle(page).trim();
		const separator = title.lastIndexOf(':');
		const original = separator > 0 ? normalizePath(title.slice(0, separator)) : '';
		if (original && Validator.validateFilePath(original) && !taken.has(original)) {
			return original;
		}

		const name = Validator.sanitizeFileName(title) || 'Untitled';
		let path = `${PULL_FOLDER}/${name}.md`;
		for (let i = 2; taken.has(path); i++) path = `${PULL_FOLDER}/${name} ${i}.md`;
		return path;
	}

	async applyPull(plan: PullPlan): Promise<{ updated: number; created: number; failed: number }> {
		const result = { updated: 0, created: 0, failed: 0 };

		for (const { note, markdown } of plan.baselines) {
			await this.writeNote(note, this.notionIdOf(note)!, note.content, markdown)
				.catch(error => this.logger.warn(`Could not update ${note.file.path}: ${error.message}`));
		}

		for (const { note, markdown } of plan.updates) {
			try {
				await this.writeNote(note, this.notionIdOf(note)!, markdown, markdown);
				result.updated++;
			} catch (error) {
				result.failed++;
				this.logger.warn(`Could not update ${note.file.path}: ${error.message}`);
			}
		}

		for (const { page, path } of plan.creates) {
			try {
				const markdown = await this.notionMarkdown(page.id);
				// Make each missing folder on the way, outermost first.
				const parts = path.split('/').slice(0, -1);
				for (let i = 1; i <= parts.length; i++) {
					const folder = parts.slice(0, i).join('/');
					if (!this.vault.getAbstractFileByPath(folder)) await this.vault.createFolder(folder);
				}
				const file = await this.vault.create(path, markdown);
				await this.writeNote({ file, frontmatter: {}, doc: new Document({}), content: markdown }, page.id, markdown, markdown);
				this.own(page.id);
				result.created++;
			} catch (error) {
				result.failed++;
				this.logger.warn(`Could not create a note for Notion page ${page.id}: ${error.message}`);
			}
		}

		await this.save();
		return result;
	}
}
