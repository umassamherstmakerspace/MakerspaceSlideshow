import { error } from '@sveltejs/kit';

export interface RequestedRange {
	start: Date;
	end: Date;
}

function parseDateParam(url: URL, name: 'start' | 'end'): Date {
	const value = url.searchParams.get(name);
	// SvelteKit 1 error() only builds the error; it must be thrown. Without
	// the throw, a dateless call fell through to new Date('') and came back
	// as a 500 "Invalid date".
	if (!value) throw error(400, `No ${name} date provided`);

	const date = new Date(value);
	if (Number.isNaN(date.getTime())) throw error(400, `Invalid ${name} date: ${value}`);

	return date;
}

export function getRequestedRange(url: URL): RequestedRange {
	const start = parseDateParam(url, 'start');
	const end = parseDateParam(url, 'end');

	if (end.getTime() < start.getTime()) throw error(400, 'End date is before start date');

	return { start, end };
}
