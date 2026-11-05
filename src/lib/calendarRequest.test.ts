import { describe, expect, it } from 'vitest';
import { getRequestedRange } from '$lib/calendarRequest';

function calendarURL(query: string): URL {
	return new URL(`http://localhost/api/calendar${query}`);
}

function thrownBy(fn: () => unknown): unknown {
	try {
		fn();
	} catch (e) {
		return e;
	}
	throw new Error('expected an error to be thrown');
}

describe('getRequestedRange', () => {
	it('returns the requested dates', () => {
		const range = getRequestedRange(
			calendarURL('?start=2026-10-16T04:00:00.000Z&end=2026-10-23T04:00:00.000Z')
		);
		expect(range.start.toISOString()).toBe('2026-10-16T04:00:00.000Z');
		expect(range.end.toISOString()).toBe('2026-10-23T04:00:00.000Z');
	});

	it('throws a 400 when no dates are given, instead of falling through to a 500', () => {
		expect(thrownBy(() => getRequestedRange(calendarURL('')))).toMatchObject({
			status: 400,
			body: { message: 'No start date provided' }
		});
	});

	it('throws a 400 when the end date is missing', () => {
		expect(
			thrownBy(() => getRequestedRange(calendarURL('?start=2026-10-16T04:00:00.000Z')))
		).toMatchObject({ status: 400, body: { message: 'No end date provided' } });
	});

	it('throws a 400 for a date that cannot be read', () => {
		expect(
			thrownBy(() => getRequestedRange(calendarURL('?start=tuesday&end=2026-10-23T04:00:00.000Z')))
		).toMatchObject({ status: 400, body: { message: 'Invalid start date: tuesday' } });
	});

	it('throws a 400 when the end is before the start', () => {
		expect(
			thrownBy(() =>
				getRequestedRange(
					calendarURL('?start=2026-10-23T04:00:00.000Z&end=2026-10-16T04:00:00.000Z')
				)
			)
		).toMatchObject({ status: 400 });
	});
});
