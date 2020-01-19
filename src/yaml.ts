export interface ITaskRef {
	value: string;
	startLine: number;
	startCol: number;
	endLine: number;
	endCol: number;
}

export function extractTasks(buffer : string) {
	let line = 0;
	let col = 0;
	let index = 0;

	let indentSize = 0;

	let currentToken = '';

	let isInTasks = false;
	let isInVars = false;
	let skipToNextLine = false;
	let found = false;

	const tasks = [];
	const vars = [];

	while (!found) {
		let c = buffer[index];
		if (c === undefined) {
			// Reached the end
			found = true;
		} else if (skipToNextLine && c !== '\n') {
			// Not caring about the rest of the line
			index++;
		} else if (c === ' ') {
			// Space detected, count the indent size
			indentSize++;
			index++;
			col++;
		} else if (c === '\n') {
			// End of line
			line++;
			// Reset column number
			col = 0;
			// Reset token
			currentToken = '';
			// Reset identation
			indentSize = 0;
			skipToNextLine = false;
			index++;
		} else if (c === ':') {
			if (isInTasks && indentSize === 2) {
				tasks.push({
					value: currentToken,
					startLine: line,
					startCol: col - currentToken.length,
					endLine: line,
					endCol: col,
				 });
			} else if (isInVars && indentSize === 2) {
				vars.push({
					value: currentToken,
					startLine: line,
					startCol: col - currentToken.length,
					endLine: line,
					endCol: col,
				 });
			} else if (!isInTasks && currentToken.trim() === 'tasks') {
				isInTasks = true;
			} else if (!isInVars && currentToken.trim() === 'vars') {
				isInVars = true;
			}
			skipToNextLine = true;
			currentToken = '';
			index++;
			col++;
		} else {
			currentToken += c;
			index++;
			col++;
		}
	}

	return { tasks, vars };
}
