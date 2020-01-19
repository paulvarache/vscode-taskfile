import { HoverProvider, TextDocument, Position, CancellationToken, Hover, MarkdownString, Uri, Range, tasks } from 'vscode';
import { provideTasks, ITaskInfo } from './tasks';
import { isRunning } from './commands';

const cachedTasksMap: Map<Uri, ITaskInfo[]> = new Map();

export class TaskHoverProvider implements HoverProvider {
	async provideHover(document: TextDocument, position: Position, _token: CancellationToken): Promise<Hover|undefined> {
		let hover: Hover | undefined = undefined;
		let docTasks = cachedTasksMap.get(document.uri);
		if (!docTasks) {
			const tasks = await provideTasks();
			docTasks = tasks.filter(i => i.scope === document.uri.fsPath);
			cachedTasksMap.set(document.uri, docTasks);
		}

		docTasks!.forEach((taskInfo) => {
			const taskRef = taskInfo.task;
			const range = new Range(taskRef.startLine, taskRef.startCol, taskRef.endLine, taskRef.endCol);
			if (range.contains(position)) {
				const contents = new MarkdownString();
				contents.isTrusted = true;
				if (!isRunning(taskInfo)) {
					contents.appendMarkdown(this.createRunTaskMarkdown(taskInfo));
					contents.appendMarkdown(' | ')
					contents.appendMarkdown(this.createWatchTaskMarkdown(taskInfo));
				} else {
					contents.appendMarkdown('Task running | ')
					contents.appendMarkdown(this.createStopTaskMarkdown(taskInfo));
				}
				hover = new Hover(contents);
			}
		});
		
		return hover;
	}

	private createRunTaskMarkdown(task: ITaskInfo) {
		return this.createMarkdownLink(
			'Run task',
			'taskfile.run',
			task,
			'Run this task',
		);
	}

	private createWatchTaskMarkdown(task: ITaskInfo) {
		return this.createMarkdownLink(
			'Watch task',
			'taskfile.watch',
			task,
			'Watch this task',
		);
	}

	private createStopTaskMarkdown(task: ITaskInfo) {
		return this.createMarkdownLink(
			'Stop task',
			'taskfile.stop',
			task,
			'Stop this running task',
		);
	}

	private createMarkdownLink(label : string, cmd: string, args: any, tooltip: string, separator?: string) {
		const encodedArgs = encodeURIComponent(JSON.stringify(args));
		let prefix = '';
		if (separator) {
			prefix += ` ${separator} `;
		}
		return `${prefix}[${label}](command:${cmd}?${encodedArgs} "${tooltip}")`;
	}
}