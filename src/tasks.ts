import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient';
import { Commands } from './commands';
import { TaskfileTreeDataProvider } from './taskfileTreeDataProvider';
import { registerLanguageClient } from './languageClient';

export async function hasTaskfile(): Promise<boolean> {
	const folders = vscode.workspace.workspaceFolders;
	if (!folders) {
		return false;
	}

	try {
		for (const folder of folders) {
			let relativePattern = new vscode.RelativePattern(folder, '**/Taskfile.{yml,yaml}');
			let paths = await vscode.workspace.findFiles(relativePattern);
			if (paths.length > 0) {
				return true;
			}
		}
		return false;
	} catch (e) {
		return Promise.reject(e);
	}
}

export interface ITaskInfo {
	task: ITaskRef;
	scope: string;
}

export interface ITaskRef {
	value: string;
	startLine: number;
	startCol: number;
	endLine: number;
	endCol: number;
}

export class TaskfileResolver {
	languageClient: LanguageClient;
	cachedTasks: ITaskInfo[] | null = null;
	constructor(lc: LanguageClient) {
		this.languageClient = lc;
	}
	invalidateCache() {
		this.cachedTasks = null;
	}
	updateCache(taskfile: ITaskfileInfo) {
		if (!this.cachedTasks) {
			this.cachedTasks = [];
		}
		// Remove all tasks in the taskfile from the cache
		this.cachedTasks = this.cachedTasks.filter(ct => ct.scope != taskfile.scope);
		// Add the new tasks
		this.cachedTasks = this.cachedTasks.concat(taskfile.tasks);
	}
	async getTasksForTaskfile(fsPath: string): Promise<ITaskInfo[]> {
		await this.languageClient.onReady();
		return await this.languageClient.sendRequest("extension/getTasks", { fsPath });
	}
	async provideTasks() {
		if (!this.cachedTasks) {
			this.cachedTasks = await this.detectTasks();
		}
		return this.cachedTasks;
	}
	async detectTasks() {
		const emptyTasks: ITaskInfo[] = [];
		const allTasks: ITaskInfo[] = [];
		const folders = vscode.workspace.workspaceFolders;
		const visitedFiles = new Set<string>();
		if (!folders) {
			return emptyTasks;
		}
	
		try {
			for (const folder of folders) {
				let relativePattern = new vscode.RelativePattern(folder, '**/Taskfile.{yml,yaml}');
				let paths = await vscode.workspace.findFiles(relativePattern);
				for (const p of paths) {
					if (!visitedFiles.has(p.fsPath)) {
						let tasks = await this.provideTasksForFolder(p);
						visitedFiles.add(p.fsPath);
						allTasks.push(...tasks);
					}
				}
			}
			return allTasks;
		} catch (e) {
			return Promise.reject(e);
		}
	}
	async provideTasksForFolder(p : vscode.Uri) {
		const emptyTasks: ITaskInfo[] = [];
	
		const folder = vscode.workspace.getWorkspaceFolder(p);
		if (!folder) {
			return emptyTasks;
		}
		const tasks = await this.getTasksForTaskfile(p.fsPath);
		return tasks || emptyTasks;
	}
}

export class TaskfileExtensionContext {
	languageClient: LanguageClient
	resolver: TaskfileResolver;
	commands: Commands;
	lcDisposable: vscode.Disposable;
	treeDataProvider: TaskfileTreeDataProvider|null = null;
	constructor(lc: LanguageClient) {
		this.languageClient = lc;
		this.lcDisposable = this.languageClient.start();
		this.subscribeNotifications();
		this.resolver = new TaskfileResolver(lc);
		this.commands = new Commands(this);
	}
	async refresh(force = false) {
		if (force) {
			await this.resolver.invalidateCache();
		}
		if (this.treeDataProvider) {
			this.treeDataProvider.refresh();
		}
	}
	async restartLanguageClient(ctx: vscode.ExtensionContext) {
		if (!this.languageClient.needsStart()) {
			await this.languageClient.stop();
		}
		this.lcDisposable.dispose();
		this.languageClient = await registerLanguageClient(ctx);
		this.resolver.languageClient = this.languageClient;
		this.lcDisposable = this.languageClient.start();
		await this.subscribeNotifications();
	}

	subscribeNotifications() {
		return this.languageClient.onReady()
			.then(() => {
				this.languageClient.onNotification("extension/onTaskfileUpdate", (params: ITaskfileInfo) => {
					if (!params) {
						return;
					}
					this.resolver.updateCache(params);
					this.refresh();
				});
			});
	}
}

interface ITaskfileInfo {
	scope: string;
	tasks: ITaskInfo[];
}