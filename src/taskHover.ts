import { HoverProvider, TextDocument, Position, CancellationToken, Hover, MarkdownString, Uri, Range, tasks } from 'vscode';
import { ITaskInfo, TaskfileExtensionContext } from './tasks';

export class TaskHoverProvider implements HoverProvider {
	private ctx: TaskfileExtensionContext;
	constructor(ctx: TaskfileExtensionContext) {
		this.ctx = ctx;
	}
	async provideHover(document: TextDocument, position: Position, _token: CancellationToken): Promise<Hover|undefined> {
		let hover: Hover | undefined = undefined;
		const docTasks = await this.ctx.resolver.getTasksForTaskfile(document.uri.fsPath);

		docTasks!.forEach((taskInfo) => {
			const taskRef = taskInfo.task;
			const range = new Range(taskRef.startLine, taskRef.startCol, taskRef.endLine, taskRef.endCol);
			if (range.contains(position)) {
				const contents = new MarkdownString();
				contents.isTrusted = true;
				if (!this.ctx.commands.isRunning(taskInfo)) {
					contents.appendMarkdown(this.createRunTaskMarkdown(taskInfo));
					contents.appendMarkdown(' | ')
					contents.appendMarkdown(this.createWatchTaskMarkdown(taskInfo));
				} else {
					contents.appendMarkdown('Task running | ')
					contents.appendMarkdown(this.createStopTaskMarkdown(taskInfo));
				}
				const range = new Range(
					taskInfo.task.startLine,
					taskInfo.task.startCol,
					taskInfo.task.endLine,
					taskInfo.task.endCol,
				);
				hover = new Hover(contents, range);
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