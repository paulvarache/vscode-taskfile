import * as vscode from 'vscode';
import { TaskfileTaskProvider } from './taskfileTaskProvider';
import { hasTaskfile } from './tasks';
import { TaskfileTreeDataProvider } from './taskfileTreeDataProvider';
import { TaskHoverProvider } from './taskHover';
import * as commands from './commands';

let treeDataProvider: TaskfileTreeDataProvider|null = null;

export async function activate(_context: vscode.ExtensionContext): Promise<void> {
	let [workspaceRoot] = vscode.workspace.workspaceFolders!;
	if (!workspaceRoot) {
		return;
	}

	registerTaskProvider(_context);
	treeDataProvider = registerExplorer(_context);

	vscode.languages.registerHoverProvider({ language: 'yaml', scheme: 'file', pattern: '**/Taskfile.{yml,yaml}' }, new TaskHoverProvider());

	vscode.commands.registerCommand('taskfile.refresh', () => commands.refresh(treeDataProvider));
	vscode.commands.registerCommand('taskfile.open', (info) => commands.open(info));
	vscode.commands.registerCommand('taskfile.run', (info) => commands.run(_context, info));
	vscode.commands.registerCommand('taskfile.watch', (info) => commands.run(_context, info, true));
	vscode.commands.registerCommand('taskfile.stop', (info) => commands.stop(info));
	vscode.commands.registerCommand('taskfile.install', () => commands.install(_context));

	if (await hasTaskfile()) {
		vscode.commands.executeCommand('setContext', 'taskfile:showTasksExplorer', true);
	}

	// When a command succesfully runs, parts of the tree's UI might need to change
	_context.subscriptions.push(commands.onDidUpdateTaskState(() => {
		// Rebuild the tree without invalidating the state
		treeDataProvider?.refresh();
	}));
}

export function refreshTasks() {
	commands.refresh(treeDataProvider);
}

function registerTaskProvider(context : vscode.ExtensionContext) {
	if (vscode.workspace.workspaceFolders) {
		let watcher = vscode.workspace.createFileSystemWatcher('**/Taskfile.{yml,yaml}');
		watcher.onDidChange(() => refreshTasks());
		watcher.onDidDelete(() => refreshTasks());
		watcher.onDidCreate(() => refreshTasks());
		context.subscriptions.push(watcher);

		let workspaceWatcher = vscode.workspace.onDidChangeWorkspaceFolders(() => refreshTasks());
		context.subscriptions.push(workspaceWatcher);

		let provider = new TaskfileTaskProvider(context.globalState);
		let disposable = vscode.workspace.registerTaskProvider(TaskfileTaskProvider.TaskfileType, provider);
		context.subscriptions.push(disposable);
		return disposable;
	}
}

function registerExplorer(context : vscode.ExtensionContext) {
	if (vscode.workspace.workspaceFolders) {
		let treeDataProvider = new TaskfileTreeDataProvider(context);
		context.subscriptions.push(treeDataProvider);
		const view = vscode.window.createTreeView('taskfile', { treeDataProvider: treeDataProvider, showCollapseAll: true });
		context.subscriptions.push(view);
		return treeDataProvider;
	}
	return null;
}
