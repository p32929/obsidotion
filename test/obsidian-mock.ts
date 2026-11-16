// A tiny stand-in for the parts of the Obsidian API the plugin uses.

type Handler = (req: { url: string; method: string; body?: string; headers: any }) => Promise<any>;
let handler: Handler = async () => { throw new Error('No request handler set'); };
export function setRequestHandler(h: Handler) { handler = h; }
export async function requestUrl(req: any) { return handler(req); }

export const notices: string[] = [];
export class Notice { constructor(message?: string) { notices.push(String(message)); } }

export function normalizePath(path: string) {
	return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
}

export class TAbstractFile { constructor(public path: string) {} }
export class TFolder extends TAbstractFile {}
export class TFile extends TAbstractFile {
	get name() { return this.path.split('/').pop()!; }
	get basename() { return this.name.replace(/\.[^.]+$/, ''); }
	get extension() { return this.name.split('.').pop()!; }
}
export class Vault {}
export class App {}

class FakeEl {
	children: FakeEl[] = [];
	onclick: (() => void) | null = null;
	constructor(public text = '') {}
	createEl(_tag: string, opts: any = {}) { const el = new FakeEl(opts.text || ''); this.children.push(el); return el; }
	createDiv(opts: any = {}) { return this.createEl('div', opts); }
	empty() { this.children = []; }
	setText(text: string) { this.text = text; }
}

export class Modal {
	contentEl = new FakeEl();
	constructor(public app: any) {}
	open() { (this as any).onOpen?.(); }
	close() { (this as any).onClose?.(); }
}

export class Plugin {
	data: any;
	ribbons: { title: string; callback: () => any }[] = [];
	constructor(public app: any, public manifest: any) {}
	async loadData() { return this.data; }
	async saveData(data: any) { this.data = JSON.parse(JSON.stringify(data)); }
	addRibbonIcon(_icon: string, title: string, callback: () => any) { this.ribbons.push({ title, callback }); }
	addCommand(_command: any) {}
	addSettingTab(_tab: any) {}
}

export class PluginSettingTab { containerEl = new FakeEl(); constructor(public app: any, public plugin: any) {} }

export class Setting {
	constructor(_el: any) {}
	setName() { return this; }
	setDesc() { return this; }
	addText() { return this; }
}
