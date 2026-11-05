import { afterEach, describe, expect, it, vi } from 'vitest';

// Placeholder settings only. Nothing here reaches a real server: every
// fetch below is a mock.
vi.mock('$env/dynamic/private', () => ({
	env: {
		GOOGLE_CALENDAR_CACHE_TIME: '300000',
		GOOGLE_CALENDAR_LINK: 'http://calendar.test/hours.ics',
		PHOTOPRISM_ENDPOINT: 'http://photoprism.test',
		PHOTOPRISM_TOKEN: 'placeholder-token'
	}
}));

// In production Node loads rrule's CommonJS build, where `import RRULE from
// 'rrule'` works. Vitest resolves its ES module build instead, which has no
// default export. Give it the same shape production sees.
vi.mock('rrule', async () => {
	const rrule = await vi.importActual<Record<string, unknown>>('rrule');
	return { ...rrule, default: rrule };
});

const ICS = [
	'BEGIN:VCALENDAR',
	'VERSION:2.0',
	'PRODID:-//test//EN',
	'BEGIN:VEVENT',
	'UID:hours@example.com',
	'DTSTAMP:20261001T000000Z',
	'DTSTART:20261005T140000Z',
	'DTEND:20261005T220000Z',
	'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
	'SUMMARY:Makerspace Open',
	'END:VEVENT',
	'END:VCALENDAR',
	''
].join('\r\n');

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEvent = any;

async function outcome(run: () => Response | Promise<Response>) {
	try {
		const res = await run();
		return { status: res.status, body: await res.text() };
	} catch (e) {
		const err = e as { status?: number; body?: { message?: string }; message?: string };
		// A plain Error escaping a SvelteKit route becomes a 500.
		return { status: err.status ?? 500, body: err.body?.message ?? err.message ?? '' };
	}
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.resetModules();
});

describe('GET /api/calendar', () => {
	async function callCalendar(query: string) {
		const { GET } = await import('./calendar/+server');
		const fetch = vi.fn(async () => new Response(ICS));
		return outcome(() =>
			GET({ fetch, url: new URL(`http://localhost/api/calendar${query}`) } as AnyEvent)
		);
	}

	it('answers 400 with a clear message when called without dates', async () => {
		const result = await callCalendar('');
		expect(result).toEqual({ status: 400, body: 'No start date provided' });
	});

	it('still returns events for a normal request', async () => {
		const result = await callCalendar(
			'?start=2026-10-12T04:00:00.000Z&end=2026-10-19T04:00:00.000Z'
		);
		expect(result.status).toBe(200);
		const events = JSON.parse(result.body);
		expect(events.length).toBeGreaterThan(0);
		expect(events[0].title).toBe('Makerspace Open');
	});
});

describe('GET /api/images', () => {
	it('answers "PhotoPrism rejected the token" when PhotoPrism says 401', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => jsonResponse({ error: 'Unauthorized' }, 401))
		);
		// The route logs the PhotoPrism error; keep the test output quiet.
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const { GET } = await import('./images/+server');
		const result = await outcome(() => GET({} as AnyEvent));
		expect(result).toEqual({ status: 502, body: 'PhotoPrism rejected the token' });
	});
});
