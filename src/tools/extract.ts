import * as unzip from 'unzipper';
import { Readable } from 'stream';
import { x } from 'tar';

export function unZip(reader: Readable, dest: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const writer = unzip.Extract({ path: dest });
		reader.pipe(writer)
			.on('close', resolve)
			.on('error', reject);
	});
}

export function unTar(reader: Readable, dest: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const writer = x({ C: dest })
		reader.pipe(writer)
			.on('close', resolve)
			.on('error', reject);
	});
}
