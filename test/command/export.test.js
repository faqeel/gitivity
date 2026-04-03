import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'stream';
import exporter from '../../src/command/export.js';

// fake async generator helper
async function* makeGen(items) {
    yield* items;
}

vi.mock('../../src/services/github.js', () => ({
    default: vi.fn(),
}));
vi.mock('../../src/services/gitlab.js', () => ({
    default: vi.fn(),
}));

import github from '../../src/services/github.js';
import gitlab from '../../src/services/gitlab.js';

describe('export command', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('has correct command and describe', () => {
        expect(exporter.command).toBe('export <service> <token>');
        expect(exporter.describe).toBeTruthy();
    });

    it('builder registers service, token, from, and base-url options', () => {
        const args = {
            positional: vi.fn().mockReturnThis(),
            option: vi.fn().mockReturnThis(),
            alias: vi.fn().mockReturnThis(),
            require: vi.fn().mockReturnThis(),
        };
        exporter.builder(args);
        expect(args.positional).toHaveBeenCalledWith('service', expect.any(Object));
        expect(args.positional).toHaveBeenCalledWith('token', expect.any(Object));
        expect(args.option).toHaveBeenCalledWith('from', expect.any(Object));
        expect(args.option).toHaveBeenCalledWith('base-url', expect.any(Object));
    });

    it('writes JSONL to stream for github service', async () => {
        const actions = [
            { id: '1', name: 'Alice', email: 'a@b.com', author: 'Alice <a@b.com>', timestamp: '2024-01-01T00:00:00.000Z' },
            { id: '2', name: 'Alice', email: 'a@b.com', author: 'Alice <a@b.com>', timestamp: '2024-01-02T00:00:00.000Z' },
        ];
        github.mockReturnValue(makeGen(actions));

        const stream = new PassThrough();
        const chunks = [];
        stream.on('data', (d) => chunks.push(d));

        await exporter.handler({ service: 'github', token: 'tok', stream });

        const output = chunks.join('');
        const lines = output.trim().split('\n');
        expect(lines).toHaveLength(2);
        expect(JSON.parse(lines[0])).toEqual(actions[0]);
        expect(JSON.parse(lines[1])).toEqual(actions[1]);
    });

    it('writes JSONL to stream for gitlab service', async () => {
        const actions = [
            { id: '99', name: 'Bob', email: 'b@c.com', author: 'Bob <b@c.com>', timestamp: '2024-03-01T00:00:00.000Z' },
        ];
        gitlab.mockReturnValue(makeGen(actions));

        const stream = new PassThrough();
        const chunks = [];
        stream.on('data', (d) => chunks.push(d));

        await exporter.handler({ service: 'gitlab', token: 'tok', stream });

        const output = chunks.join('');
        expect(JSON.parse(output.trim())).toEqual(actions[0]);
    });

    it('passes args to the service', async () => {
        github.mockReturnValue(makeGen([]));
        const stream = new PassThrough();
        const args = { service: 'github', token: 'mytoken', baseUrl: 'https://ghe.example.com', stream };

        await exporter.handler(args);

        expect(github).toHaveBeenCalledWith(args);
    });

    it('falls back to process.stdout when no stream provided', async () => {
        github.mockReturnValue(makeGen([]));
        const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

        await exporter.handler({ service: 'github', token: 'tok' });

        write.mockRestore();
    });
});
