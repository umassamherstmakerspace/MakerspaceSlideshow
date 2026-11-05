import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { CalendarSet } from '$lib/calendar';
import { getRequestedRange } from '$lib/calendarRequest';
import { Cached } from '$lib/cache';
import { error } from '@sveltejs/kit';

let calendar: Cached<CalendarSet> | undefined = undefined;

export const GET: RequestHandler = async ({ fetch, url }) => {
	// Check the request before the calendar setup, so a bad request is a 400
	// even when the server is misconfigured.
	const { start, end } = getRequestedRange(url);

	if (!calendar) {
		const cacheTime = Number.parseInt(env.GOOGLE_CALENDAR_CACHE_TIME || '');
		if (!Number.isInteger(cacheTime)) throw error(500, 'Invalid cache time');

		const calendarURL = env.GOOGLE_CALENDAR_LINK;
		if (!calendarURL) throw error(500, 'No calendar URL provided');

		calendar = new Cached<CalendarSet>(async () => {
			const calendarData = await fetch(calendarURL).then((res) => res.text());
			return CalendarSet.cleanAndParse(calendarData);
		}, cacheTime);
	}

	let cal;

	try {
		cal = await calendar.get();
	} catch (e) {
		calendar = undefined;
		console.error(e);
		throw error(500, {
			message: 'Internal Service Error'
		});
	}

	return new Response(JSON.stringify(cal.between(start, end)), {
		headers: {
			'content-type': 'application/json;charset=UTF-8'
		}
	});
};
