import type { EventJSON } from '$lib/calendar';
import type { DateRange, DaySchedule, RoomStatus, ScheduleRanges } from '$lib/types';
import {
	addDays,
	endOfDay,
	format,
	formatRelative,
	isAfter,
	isBefore,
	isEqual,
	max,
	min,
	startOfDay
} from 'date-fns';

const HOURS_CACHE_VERSION = 1;
export const HOURS_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type HoursCache = {
	version: number;
	cachedAt: number;
	events: EventJSON[];
};

function isEventJSON(value: unknown): value is EventJSON {
	if (value === null || typeof value !== 'object') return false;

	const event = value as Record<string, unknown>;
	return (
		typeof event.title === 'string' &&
		typeof event.start === 'string' &&
		!Number.isNaN(Date.parse(event.start)) &&
		typeof event.end === 'string' &&
		!Number.isNaN(Date.parse(event.end)) &&
		typeof event.allDay === 'boolean' &&
		typeof event.uid === 'string' &&
		typeof event.sequence === 'number'
	);
}

export function isEventJSONList(value: unknown): value is EventJSON[] {
	return Array.isArray(value) && value.every(isEventJSON);
}

export function encodeHoursCache(events: EventJSON[], cachedAt = Date.now()): string {
	return JSON.stringify({
		version: HOURS_CACHE_VERSION,
		cachedAt,
		events
	} satisfies HoursCache);
}

export function decodeHoursCache(
	value: string | null,
	now = Date.now(),
	maxAge = HOURS_CACHE_MAX_AGE_MS
): EventJSON[] | null {
	if (value === null) return null;

	try {
		const cache = JSON.parse(value) as Partial<HoursCache>;
		const age = now - (cache.cachedAt || 0);
		if (
			cache.version !== HOURS_CACHE_VERSION ||
			age < 0 ||
			age > maxAge ||
			!isEventJSONList(cache.events)
		) {
			return null;
		}

		return cache.events;
	} catch {
		return null;
	}
}

export function getDaySchedule(data: EventJSON[], now = new Date()): DaySchedule[] {
	const startTime = startOfDay(now);
	const endTime = addDays(startTime, 7);

	const ranges = Array<DateRange[]>(7);
	for (let i = 0; i < 7; i++) {
		ranges[i] = [];
	}

	return data
		.filter((event) => event.title.toLowerCase().includes('open'))
		.map(
			(event) =>
				({
					start: max([new Date(event.start), startTime]),
					end: min([new Date(event.end), endTime])
				} as DateRange)
		)
		.filter((range) => !isBefore(range.end, startTime) && !isAfter(range.start, endTime))
		.flatMap((range) => {
			let start = range.start;
			const results: DateRange[] = [];

			while (start.getDay() !== range.end.getDay()) {
				results.push({ start, end: endOfDay(start) });
				start = startOfDay(addDays(start, 1));
			}

			results.push({ start, end: range.end });
			return results;
		})
		.reduce((scheduleRanges, range) => {
			const offset = (range.start.getDay() - now.getDay() + 7) % 7;
			scheduleRanges[offset].push(range);
			return scheduleRanges;
		}, ranges)
		.map(
			(dayRanges, dayOffset) =>
				({
					ranges: mergeRanges(dayRanges),
					day: addDays(startTime, dayOffset)
				} as DaySchedule)
		);
}

function mergeRanges(ranges: DateRange[]): DateRange[] {
	const merged = ranges.sort((a, b) => (isBefore(a.start, b.start) ? -1 : 1));
	let index = 0;

	while (index < merged.length) {
		for (let i = index + 1; i < merged.length; i++) {
			if (
				isAfter(merged[index].end, merged[i].start) ||
				isEqual(merged[index].end, merged[i].start)
			) {
				if (isBefore(merged[index].end, merged[i].end)) {
					merged[index].end = merged[i].end;
				}
				merged.splice(i, 1);
				i--;
			}
		}
		index++;
	}

	return merged;
}

export function getRoomStatus(schedule: DaySchedule[], now = new Date()): RoomStatus {
	for (const day of schedule) {
		for (const range of day.ranges) {
			// Opening is inclusive and closing is exclusive: at exactly 5:00 PM,
			// a 9-to-5 range is closed.
			if (!isBefore(now, range.start) && isBefore(now, range.end)) {
				return {
					open: true,
					until: formatRelative(range.end, now)
				};
			}

			if (isBefore(now, range.start)) {
				return {
					open: false,
					until: formatRelative(range.start, now)
				};
			}
		}
	}

	return { open: false, until: '' };
}

export function getScheduleRanges(schedule: DaySchedule[]): ScheduleRanges[] {
	return schedule.map((day) => ({
		day: day.day,
		ranges:
			day.ranges.length === 0
				? ['Closed']
				: day.ranges.map(
						(range) => `${format(range.start, 'h:mm a')} - ${format(range.end, 'h:mm a')}`
				  )
	}));
}
