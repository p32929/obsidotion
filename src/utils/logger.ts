import { Notice } from 'obsidian';

export class Logger {
	private prefix: string;
	private loggingEnabled: boolean;

	constructor(prefix: string) {
		this.prefix = prefix;
		// Check environment variable to disable logging completely
		this.loggingEnabled = process.env.DISABLE_LOGS !== 'true';
	}

	private log(level: string, message: string, data?: any) {
		if (!this.loggingEnabled) return;
		
		const timestamp = new Date().toISOString();
		const dataStr = data ? ` | ${JSON.stringify(data, null, 2)}` : '';
		const logMessage = `[${timestamp}] [${this.prefix}] [${level}] ${message}${dataStr}`;
		
		console.log(logMessage);
	}

	debug(message: string, data?: any) {
		this.log('DEBUG', message, data);
	}

	info(message: string, data?: any) {
		this.log('INFO', message, data);
	}

	warn(message: string, data?: any) {
		this.log('WARN', message, data);
	}

	error(message: string, data?: any) {
		this.log('ERROR', message, data);
		// Only show error notices to user
		new Notice(`❌ ${message}`, 5000);
	}

	success(message: string, data?: any) {
		this.log('INFO', `✅ ${message}`, data);
		// Show success notices to user
		new Notice(`✅ ${message}`, 3000);
	}
} 