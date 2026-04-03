import { describe, it, expect, vi, beforeEach } from 'vitest';
import moment from 'moment';

const mockGraphql = vi.hoisted(() => vi.fn());
const mockSpinUpdate = vi.hoisted(() => vi.fn());
const mockSpinDone = vi.hoisted(() => vi.fn());
const mockSpin = vi.hoisted(() => vi.fn(() => ({ update: mockSpinUpdate, done: mockSpinDone })));

vi.mock('@octokit/rest', () => ({
    Octokit: vi.fn(function () {
        return { graphql: mockGraphql };
    }),
}));

vi.mock('../../src/util/spinner.js', () => ({ spin: mockSpin }));

import { Octokit } from '@octokit/rest';
import fetch from '../../src/services/github.js';

function makeCalendarResponse(days) {
    return {
        user: {
            contributionsCollection: {
                contributionCalendar: {
                    weeks: [{ contributionDays: days }],
                },
            },
        },
    };
}

const thisYear = new Date().getFullYear();
const viewer = {
    viewer: {
        name: 'Test User',
        email: 'test@example.com',
        login: 'testuser',
        createdAt: `${thisYear}-01-01T00:00:00.000Z`,
    },
};

describe('github service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('passes token and baseUrl to Octokit', async () => {
        mockGraphql.mockResolvedValueOnce(viewer).mockResolvedValue(makeCalendarResponse([]));

        for await (const _ of fetch({ token: 'ghp_abc', baseUrl: 'https://ghe.example.com' })) { /* noop */ }

        expect(Octokit).toHaveBeenCalledWith({ auth: 'ghp_abc', baseUrl: 'https://ghe.example.com' });
    });

    it('queries viewer metadata first', async () => {
        mockGraphql.mockResolvedValueOnce(viewer).mockResolvedValue(makeCalendarResponse([]));

        for await (const _ of fetch({ token: 'tok' })) { /* noop */ }

        expect(mockGraphql.mock.calls[0][0]).toContain('viewer');
    });

    it('yields one action per contribution per day', async () => {
        mockGraphql.mockResolvedValueOnce(viewer).mockResolvedValue(
            makeCalendarResponse([{ date: `${thisYear}-03-10`, contributionCount: 3 }]),
        );

        const actions = [];
        for await (const action of fetch({ token: 'tok' })) actions.push(action);

        expect(actions).toHaveLength(3);
    });

    it('action ids are unique within a day (appends 1-based index)', async () => {
        mockGraphql.mockResolvedValueOnce(viewer).mockResolvedValue(
            makeCalendarResponse([{ date: `${thisYear}-03-10`, contributionCount: 2 }]),
        );

        const actions = [];
        for await (const action of fetch({ token: 'tok' })) actions.push(action);

        const date = moment.utc(`${thisYear}-03-10`);
        expect(actions[0].id).toBe(`${date.valueOf()}1`);
        expect(actions[1].id).toBe(`${date.valueOf()}2`);
    });

    it('action has correct shape with moment timestamp', async () => {
        mockGraphql.mockResolvedValueOnce(viewer).mockResolvedValue(
            makeCalendarResponse([{ date: `${thisYear}-05-01`, contributionCount: 1 }]),
        );

        const actions = [];
        for await (const action of fetch({ token: 'tok' })) actions.push(action);

        expect(actions[0]).toMatchObject({
            name: 'Test User',
            email: 'test@example.com',
            author: 'Test User <test@example.com>',
        });
        expect(moment.isMoment(actions[0].timestamp)).toBe(true);
    });

    it('zero-contribution days produce no actions', async () => {
        mockGraphql.mockResolvedValueOnce(viewer).mockResolvedValue(
            makeCalendarResponse([
                { date: `${thisYear}-03-10`, contributionCount: 0 },
                { date: `${thisYear}-03-11`, contributionCount: 0 },
            ]),
        );

        const actions = [];
        for await (const action of fetch({ token: 'tok' })) actions.push(action);

        expect(actions).toHaveLength(0);
    });

    it('iterates one graphql call per year from createdAt to now', async () => {
        const createdYear = thisYear - 2;
        const multiYearViewer = {
            viewer: { ...viewer.viewer, createdAt: `${createdYear}-01-01T00:00:00.000Z` },
        };

        mockGraphql.mockResolvedValueOnce(multiYearViewer).mockResolvedValue(makeCalendarResponse([]));

        for await (const _ of fetch({ token: 'tok' })) { /* noop */ }

        const expectedYears = thisYear - createdYear + 1;
        expect(mockGraphql).toHaveBeenCalledTimes(1 + expectedYears);
    });

    it('calls spin once per year with year label', async () => {
        mockGraphql.mockResolvedValueOnce(viewer).mockResolvedValue(makeCalendarResponse([]));

        for await (const _ of fetch({ token: 'tok' })) { /* noop */ }

        expect(mockSpin).toHaveBeenCalledWith(expect.stringContaining(`${thisYear} activity`));
        expect(mockSpin).toHaveBeenCalledTimes(1);
    });

    it('updates spinner with contribution count after fetching year', async () => {
        mockGraphql
            .mockResolvedValueOnce(viewer)
            .mockResolvedValue(
                makeCalendarResponse([{ date: `${thisYear}-03-10`, contributionCount: 5 }]),
            );

        for await (const _ of fetch({ token: 'tok' })) { /* noop */ }

        expect(mockSpinUpdate).toHaveBeenCalledWith(expect.stringContaining('5 contributions'));
    });

    it('calls spinner.done once per year', async () => {
        const createdYear = thisYear - 1;
        const multiYearViewer = {
            viewer: { ...viewer.viewer, createdAt: `${createdYear}-01-01T00:00:00.000Z` },
        };
        mockGraphql.mockResolvedValueOnce(multiYearViewer).mockResolvedValue(makeCalendarResponse([]));

        for await (const _ of fetch({ token: 'tok' })) { /* noop */ }

        expect(mockSpinDone).toHaveBeenCalledTimes(2);
    });
});
