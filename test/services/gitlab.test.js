import { describe, it, expect, vi, beforeEach } from 'vitest';
import moment from 'moment';

const mockShowCurrentUser = vi.hoisted(() => vi.fn());
const mockAllEvents = vi.hoisted(() => vi.fn());

vi.mock('@gitbeaker/rest', () => ({
    Gitlab: vi.fn(function () {
        return {
            Users: {
                showCurrentUser: mockShowCurrentUser,
                allEvents: mockAllEvents,
            },
        };
    }),
}));

import { Gitlab } from '@gitbeaker/rest';
import fetch from '../../src/services/gitlab.js';

const user = { id: 42, name: 'Test User', email: 'test@example.com' };

describe('gitlab service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockShowCurrentUser.mockResolvedValue(user);
        mockAllEvents.mockResolvedValue([]);
    });

    it('passes token and baseUrl as host to Gitlab client', async () => {
        for await (const _ of fetch({ token: 'glpat_abc', baseUrl: 'https://gitlab.example.com' })) { /* noop */ }

        expect(Gitlab).toHaveBeenCalledWith({ token: 'glpat_abc', host: 'https://gitlab.example.com' });
    });

    it('fetches current user on init', async () => {
        for await (const _ of fetch({ token: 'tok' })) { /* noop */ }

        expect(mockShowCurrentUser).toHaveBeenCalled();
    });

    it('queries all 8 enabled event types', async () => {
        for await (const _ of fetch({ token: 'tok' })) { /* noop */ }

        const types = mockAllEvents.mock.calls.map((c) => c[1].action);
        expect(types).toEqual(['closed', 'commented', 'created', 'destroyed', 'merged', 'pushed', 'reopened', 'updated']);
    });

    it('yields actions for each event', async () => {
        mockAllEvents.mockImplementation(async (id, opts) => {
            if (opts.action === 'pushed') {
                return [
                    { id: 101, created_at: '2024-03-01T10:00:00Z' },
                    { id: 102, created_at: '2024-03-02T10:00:00Z' },
                ];
            }
            return [];
        });

        const actions = [];
        for await (const action of fetch({ token: 'tok' })) actions.push(action);

        expect(actions).toHaveLength(2);
    });

    it('action has correct shape', async () => {
        mockAllEvents.mockImplementation(async (id, opts) => {
            if (opts.action === 'created') return [{ id: 55, created_at: '2024-05-10T08:00:00Z' }];
            return [];
        });

        const actions = [];
        for await (const action of fetch({ token: 'tok' })) actions.push(action);

        expect(actions[0]).toMatchObject({
            id: '55',
            name: 'Test User',
            email: 'test@example.com',
            author: 'Test User <test@example.com>',
        });
        expect(moment.isMoment(actions[0].timestamp)).toBe(true);
    });

    it('action id is the string form of event.id', async () => {
        mockAllEvents.mockImplementation(async (id, opts) => {
            if (opts.action === 'merged') return [{ id: 9999, created_at: '2024-01-01T00:00:00Z' }];
            return [];
        });

        const actions = [];
        for await (const action of fetch({ token: 'tok' })) actions.push(action);

        expect(actions[0].id).toBe('9999');
    });

    it('sorts actions ascending by timestamp', async () => {
        mockAllEvents.mockImplementation(async (id, opts) => {
            if (opts.action === 'pushed') {
                return [
                    { id: 1, created_at: '2024-03-05T00:00:00Z' },
                    { id: 2, created_at: '2024-01-01T00:00:00Z' },
                ];
            }
            return [];
        });

        const actions = [];
        for await (const action of fetch({ token: 'tok' })) actions.push(action);

        expect(actions[0].id).toBe('2');
        expect(actions[1].id).toBe('1');
    });

    it('passes args.from as after param formatted YYYY-MM-DD', async () => {
        for await (const _ of fetch({ token: 'tok', from: '2024-06-15T12:00:00Z' })) { /* noop */ }

        for (const [, opts] of mockAllEvents.mock.calls) {
            expect(opts.after).toBe('2024-06-15');
        }
    });

    it('does not set after param when args.from is absent', async () => {
        for await (const _ of fetch({ token: 'tok' })) { /* noop */ }

        for (const [, opts] of mockAllEvents.mock.calls) {
            expect(opts.after).toBeUndefined();
        }
    });

    it('passes user.id to allEvents', async () => {
        for await (const _ of fetch({ token: 'tok' })) { /* noop */ }

        for (const [userId] of mockAllEvents.mock.calls) {
            expect(userId).toBe(42);
        }
    });
});
