//
// console.log = function () { };

// 
import {
	App,
	Editor,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	addIcon,
} from 'obsidian';
import { Upload2Notion } from './Upload2Notion';
import { DownloadFromNotion } from './DownloadFromNotion';

interface PluginSettings {
	notionAPI: string;
	databaseID: string;
	proxy: string;
	allowTags: boolean;
}

const DEFAULT_SETTINGS: PluginSettings = {
	notionAPI: '',
	databaseID: '',
	proxy: '',
	allowTags: false,
};

export default class ObsidianSyncNotionPlugin extends Plugin {
	settings: PluginSettings;
	syncModal: Modal | null = null;

	async onload() {
		await this.loadSettings();

		this.addRibbonIcon('upload-cloud', 'Upload to Notion', async () => {
			this.showSyncModal();
			await this.uploadAllNotes();
			this.closeSyncModal();
		});

		this.addRibbonIcon('download-cloud', 'Download from Notion', async () => {
			this.showSyncModal();
			await this.downloadAllNotes();
			this.closeSyncModal();
		});

		this.addSettingTab(new SettingTab(this.app, this));
	}

	onunload() { }

	async uploadAllNotes() {
		const { notionAPI, databaseID, allowTags } = this.settings;
		if (!notionAPI || !databaseID) {
			new Notice('Please set up the Notion API and Database ID in the settings tab.');
			return;
		}

		const upload = new Upload2Notion(this);
		const files = this.app.vault.getMarkdownFiles();
		await Promise.all(files.map(file => upload.syncMarkdownToNotion(file, allowTags)));
	}

	async downloadAllNotes() {
		const { notionAPI, databaseID } = this.settings;
		if (!notionAPI || !databaseID) {
			new Notice('Please set up the Notion API and Database ID in the settings tab.');
			return;
		}

		const download = new DownloadFromNotion(this);
		await download.syncAllNotes();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	showSyncModal() {
		this.syncModal = new Modal(this.app);
		this.syncModal.titleEl.setText('Sync in progress');
		this.syncModal.contentEl.setText('Please wait while the sync is in progress. This dialog will close automatically.');
		this.syncModal.modalEl.classList.add('sync-modal');
		this.syncModal.open();
	}

	closeSyncModal() {
		if (this.syncModal) {
			this.syncModal.close();
			this.syncModal = null;
		}
	}
}

class SettingTab extends PluginSettingTab {
	plugin: ObsidianSyncNotionPlugin;

	constructor(app: App, plugin: ObsidianSyncNotionPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Notion API token')
			.setDesc('Enter your Notion API token')
			.addText(text => text
				.setPlaceholder('Enter your Notion API token')
				.setValue(this.plugin.settings.notionAPI)
				.onChange(async (value) => {
					this.plugin.settings.notionAPI = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Database ID')
			.setDesc('Enter your database ID')
			.addText(text => text
				.setPlaceholder('Enter your database ID')
				.setValue(this.plugin.settings.databaseID)
				.onChange(async (value) => {
					this.plugin.settings.databaseID = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Convert tags')
			.setDesc('Transfer the Obsidian tags to the Notion table.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.allowTags)
				.onChange(async (value) => {
					this.plugin.settings.allowTags = value;
					await this.plugin.saveSettings();
				}));
	}
}
