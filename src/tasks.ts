import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { extractTasks, ITaskRef } from './yaml';

let cachedTasks: ITaskInfo[] | null = null;

export function invalidateTasksCache() {
	cachedTasks = null;
}

function exists(file: string): Promise<boolean> {
	return new Promise<boolean>((resolve, _reject) => {
		fs.exists(file, (value) => {
			resolve(value);
		});
	});
}

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

export async function getTasks(p: vscode.Uri) {
	const filePath = p.fsPath;
	if (!await exists(filePath)) {
		return;
	}

	const contents = fs.readFileSync(filePath, 'utf-8');

	return extractTasks(contents);
}

export interface ITaskInfo {
	task: ITaskRef;
	scope: string;
}

export async function provideTasksForFolder(p : vscode.Uri) {
	const emptyTasks: ITaskInfo[] = [];

	const folder = vscode.workspace.getWorkspaceFolder(p);
	if (!folder) {
		return emptyTasks;
	}
	const tasks = await getTasks(p);
	if (!tasks) {
		return emptyTasks;
	}
	return tasks.tasks.map(t => ({ task: t, scope: p.fsPath, }));
}

export async function detectTasks() {
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
					let tasks = await provideTasksForFolder(p);
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

export async function provideTasks() {
	if (!cachedTasks) {
		cachedTasks = await detectTasks();
	}
	return cachedTasks;
}

export async function getTaskfile() {
	const workspaceRoot = vscode.workspace.rootPath;
	if (!workspaceRoot) {
		return null;
	}
	let taskFile = path.join(workspaceRoot, 'Taskfile.yaml');
	if (await exists(taskFile)) {
		return taskFile;
	}
	taskFile = path.join(workspaceRoot, 'Taskfile.yml');
	if (await exists(taskFile)) {
		return taskFile;
	}
	return null;
}
