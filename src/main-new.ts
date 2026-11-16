import { App, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

import { PluginSettings, DEFAULT_SETTINGS } from './types';
import { Logger } from './utils/logger';
import { Validator } from './utils/validator';
import { NotionAPIService } from './services/notion-api';
import { MarkdownConverter } from './services/markdown-converter';
import { PullPlan, Syncer } from './sync';

export default class ObsidotionPlugin extends Plugin {
	settings: PluginSettings;
	logger: Logger;
	private busy = false;

	async onload() {
		this.logger = new Logger('Obsidotion');
		await this.loadSettings();

		this.addSettingTab(new ObsidotionSettingTab(this.app, this));
		this.addRibbonIcon('cloud-upload', 'Upload to Notion', () => this.uploadCommand());
		this.addRibbonIcon('cloud-download', 'Pull from Notion', () => this.pullCommand());
		this.addCommand({ id: 'upload-to-notion', name: 'Upload to Notion', callback: () => this.uploadCommand() });
		this.addCommand({ id: 'pull-from-notion', name: 'Pull from Notion', callback: () => this.pullCommand() });
	}

	private syncer(): Syncer {
		const notion = new NotionAPIService(this.settings.notionAPIToken, this.logger);
		return new Syncer(this.app.vault, notion, new MarkdownConverter(this.logger), this.logger, this.settings, () => this.saveSettings());
	}

	/** Runs one sync job at a time, after checking the settings. */
	private async run(job: () => Promise<void>) {
		if (!Validator.validateSettings(this.settings).isValid) {
			new Notice('Obsidotion: add your Notion token and database ID in the plugin settings first');
			return;
		}
		if (this.busy) {
			new Notice('Obsidotion: a sync is already running');
			return;
		}
		this.busy = true;
		try {
			await job();
		} catch (error) {
			new Notice(`Obsidotion: ${error.message}`);
			this.logger.warn(error.message);
		} finally {
			this.busy = false;
		}
	}

	uploadCommand() {
		return this.run(async () => {
			new Notice('Uploading to Notion...');
			const result = await this.syncer().upload();
			const parts = [`${result.uploaded} uploaded`];
			if (result.archived) parts.push(`${result.archived} archived in Notion`);
			if (result.failed) parts.push(`${result.failed} failed`);
			if (result.skippedCleanup) parts.push('nothing archived because some notes could not be read');
			new Notice(`Obsidotion: ${parts.join(', ')}`);
		});
	}

	pullCommand() {
		return this.run(async () => {
			new Notice('Checking Notion for changes...');
			const syncer = this.syncer();
			const plan = await syncer.planPull();
			if (plan.updates.length + plan.creates.length > 0 && !(await this.confirmPull(plan))) {
				return;
			}
			const result = await syncer.applyPull(plan);
			if (result.updated + result.created + result.failed === 0) {
				new Notice('Obsidotion: everything is up to date');
				return;
			}
			const parts = [`${result.updated} updated`, `${result.created} new`];
			if (result.failed) parts.push(`${result.failed} failed`);
			new Notice(`Obsidotion: ${parts.join(', ')}`);
		});
	}

	/** Asks once before a pull changes anything. */
	confirmPull(plan: PullPlan): Promise<boolean> {
		return new Promise(resolve => new PullConfirmModal(this.app, plan, resolve).open());
	}

	async loadSettings() {
		const saved = (await this.loadData()) || {};
		this.settings = Object.assign({}, DEFAULT_SETTINGS, saved, { ownedPageIds: [...(saved.ownedPageIds || [])] });

		// Older versions saved the token as notionAPI.
		if (saved.notionAPI && !saved.notionAPIToken) {
			this.settings.notionAPIToken = saved.notionAPI;
			delete (this.settings as any).notionAPI;
			await this.saveSettings();
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class ObsidotionSettingTab extends PluginSettingTab {
	plugin: ObsidotionPlugin;

	constructor(app: App, plugin: ObsidotionPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Notion token')
			.setDesc('The secret of your Notion integration (starts with ntn_ or secret_).')
			.addText(text => text
				.setPlaceholder('ntn_...')
				.setValue(this.plugin.settings.notionAPIToken)
				.onChange(async (value) => {
					this.plugin.settings.notionAPIToken = value.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Database ID')
			.setDesc('The 32 characters in the database link, before the ?')
			.addText(text => text
				.setPlaceholder('a1b2c3d4e5f6...')
				.setValue(this.plugin.settings.databaseID)
				.onChange(async (value) => {
					this.plugin.settings.databaseID = value.trim();
					await this.plugin.saveSettings();
				}));
	}
}

class PullConfirmModal extends Modal {
	constructor(app: App, private plan: PullPlan, private resolve: (value: boolean) => void) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		const { updates, creates } = this.plan;
		contentEl.createEl('h2', { text: 'Pull from Notion?' });
		if (updates.length) {
			contentEl.createEl('p', { text: `${updates.length} note(s) changed in Notion. Their text here will be replaced with the Notion version.` });
		}
		if (creates.length) {
			contentEl.createEl('p', { text: `${creates.length} new page(s) in Notion will be added as notes.` });
		}

		const buttons = contentEl.createDiv({ cls: 'modal-button-container' });
		buttons.createEl('button', { text: 'Cancel' }).onclick = () => this.close();
		const pull = buttons.createEl('button', { text: 'Pull', cls: 'mod-warning' });
		pull.onclick = () => {
			this.resolve(true);
			this.resolve = () => {};
			this.close();
		};
	}

	onClose(): void {
		this.resolve(false);
		this.contentEl.empty();
	}
}
