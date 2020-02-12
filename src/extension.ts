import * as vscode from 'vscode';
import { TaskfileTaskProvider } from './taskfileTaskProvider';
import { hasTaskfile, TaskfileExtensionContext } from './tasks';
import { TaskfileTreeDataProvider } from './taskfileTreeDataProvider';
import { TaskHoverProvider } from './taskHover';
import { registerLanguageClient } from './languageClient';

let treeDataProvider: TaskfileTreeDataProvider|null = null;

export async function activate(_context: vscode.ExtensionContext): Promise<void> {
	let [workspaceRoot] = vscode.workspace.workspaceFolders!;
	if (!workspaceRoot) {
		return;
	}

	const cl = await registerLanguageClient(_context);

	const ctx = new TaskfileExtensionContext(cl);

	registerTaskProvider(ctx, _context);
	registerExplorer(ctx, _context);

	vscode.languages.registerHoverProvider({ language: 'yaml', scheme: 'file', pattern: '**/Taskfile.{yml,yaml}' }, new TaskHoverProvider(ctx));

	vscode.commands.registerCommand('taskfile.refresh', () => ctx.refresh(true));
	vscode.commands.registerCommand('taskfile.open', (info) => ctx.commands.open(info));
	vscode.commands.registerCommand('taskfile.run', (info) => ctx.commands.run(_context, info));
	vscode.commands.registerCommand('taskfile.watch', (info) => ctx.commands.run(_context, info, true));
	vscode.commands.registerCommand('taskfile.stop', (info) => ctx.commands.stop(info));
	vscode.commands.registerCommand('taskfile.install', () => ctx.commands.install(_context));
	vscode.commands.registerCommand('taskfile.lsp.restart', () => ctx.commands.restartLSP(_context));
	vscode.commands.registerCommand('taskfile.lsp.update', () => ctx.commands.updateLSP(_context));

	if (await hasTaskfile()) {
		vscode.commands.executeCommand('setContext', 'taskfile:showTasksExplorer', true);
	}

	// When a command succesfully runs, parts of the tree's UI might need to change
	_context.subscriptions.push(ctx.commands.onDidUpdateTaskState(() => {
		// Rebuild the tree without invalidating the state
		ctx.treeDataProvider?.refresh();
	}));
}

function registerTaskProvider(ctx: TaskfileExtensionContext, context : vscode.ExtensionContext) {
	if (vscode.workspace.workspaceFolders) {
		let workspaceWatcher = vscode.workspace.onDidChangeWorkspaceFolders(() => ctx.refresh(true));
		context.subscriptions.push(workspaceWatcher);

		let provider = new TaskfileTaskProvider(ctx, context.globalState);
		let disposable = vscode.workspace.registerTaskProvider(TaskfileTaskProvider.TaskfileType, provider);
		context.subscriptions.push(disposable);
		return disposable;
	}
}

function registerExplorer(ctx: TaskfileExtensionContext, context : vscode.ExtensionContext) {
	if (vscode.workspace.workspaceFolders) {
		let treeDataProvider = new TaskfileTreeDataProvider(ctx, context);
		context.subscriptions.push(treeDataProvider);
		const view = vscode.window.createTreeView('taskfile', { treeDataProvider: treeDataProvider, showCollapseAll: true });
		context.subscriptions.push(view);
		ctx.treeDataProvider = treeDataProvider;
	}
	return null;
}
