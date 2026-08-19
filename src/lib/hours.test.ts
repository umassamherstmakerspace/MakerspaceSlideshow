import { describe, expect, it } from 'vitest';
import type { EventJSON } from '$lib/calendar';
import type { DaySchedule } from '$lib/types';
import {
	decodeHoursCache,
	encodeHoursCache,
	getRoomStatus,
	HOURS_CACHE_MAX_AGE_MS,
	isEventJSONList
} from '$lib/hours';

function localDate(hour: number, minute = 0): Date {
	return new Date(2026, 7, 19, hour, minute, 0, 0);
}

function workdaySchedule(): DaySchedule[] {
	return [
		{
			day: localDate(0),
			ranges: [{ start: localDate(9), end: localDate(17) }]
		}
	];
}

const event: EventJSON = {
	title: 'Makerspace Open Hours',
	start: '2026-08-19T13:00:00.000Z',
	end: '2026-08-19T21:00:00.000Z',
	allDay: false,
	uid: 'hours@example.com',
	sequence: 1
};

describe('getRoomStatus', () => {
	it('changes from closed to open at the opening boundary without a calendar refresh', () => {
		expect(getRoomStatus(workdaySchedule(), localDate(8, 59)).open).toBe(false);
		expect(getRoomStatus(workdaySchedule(), localDate(9)).open).toBe(true);
	});

	it('changes from open to closed at the closing boundary', () => {
		expect(getRoomStatus(workdaySchedule(), localDate(16, 59)).open).toBe(true);
		expect(getRoomStatus(workdaySchedule(), localDate(17)).open).toBe(false);
	});
});

describe('hours cache', () => {
	it('restores a fresh, valid schedule', () => {
		const now = Date.now();
		expect(decodeHoursCache(encodeHoursCache([event], now), now)).toEqual([event]);
	});

	it('rejects stale, malformed, and future-dated schedules', () => {
		const now = Date.now();
		expect(
			decodeHoursCache(encodeHoursCache([event], now - HOURS_CACHE_MAX_AGE_MS - 1), now)
		).toBeNull();
		expect(decodeHoursCache('{not json', now)).toBeNull();
		expect(decodeHoursCache(encodeHoursCache([event], now + 1), now)).toBeNull();
	});

	it('rejects invalid calendar responses before they replace known hours', () => {
		expect(isEventJSONList({ message: 'Internal Error' })).toBe(false);
		expect(isEventJSONList([{ ...event, end: 'not a date' }])).toBe(false);
	});
});
