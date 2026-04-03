import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mirrorer from '../../src/command/mirror.js';

const mockLog = vi.hoisted(() => vi.fn());
const mockGitInstance = vi.hoisted(() => ({ log: mockLog }));

vi.mock('simple-git', () => ({
    default: vi.fn(function () {
        return mockGitInstance;
    }),
}));

vi.mock('../../src/command/export.js', () => ({
    default: {
        command: 'export <service> <token>',
        describe: 'export',
        builder: vi.fn((a) => a),
        handler: vi.fn().mockResolvedValue(undefined),
    },
}));

vi.mock('../../src/command/import.js', () => ({
    default: {
        command: 'import <target>',
        describe: 'import',
        builder: vi.fn((a) => a),
        handler: vi.fn().mockResolvedValue(undefined),
    },
}));

import exporter from '../../src/command/export.js';
import importer from '../../src/command/import.js';

describe('mirror command', () => {
    let chdir;
    let exit;

    beforeEach(() => {
        vi.clearAllMocks();
        chdir = vi.spyOn(process, 'chdir').mockImplementation(() => {});
        exit = vi.spyOn(process, 'exit').mockImplementation(() => {});
        exporter.handler.mockResolvedValue(undefined);
        importer.handler.mockResolvedValue(undefined);
    });

    afterEach(() => {
        chdir.mockRestore();
        exit.mockRestore();
    });

    it('has correct command and describe', () => {
        expect(mirrorer.command).toContain('mirror');
        expect(mirrorer.describe).toBeTruthy();
    });

    it('builder delegates to export and import builders', () => {
        const args = {
            positional: vi.fn().mockReturnThis(),
            option: vi.fn().mockReturnThis(),
            alias: vi.fn().mockReturnThis(),
            require: vi.fn().mockReturnThis(),
        };
        mirrorer.builder(args);
        expect(exporter.builder).toHaveBeenCalled();
        expect(importer.builder).toHaveBeenCalled();
    });

    it('chdirs to target and calls both handlers', async () => {
        mockLog.mockRejectedValue(new Error('no repo'));

        await mirrorer.handler({ target: '/tmp/repo', branch: 'main' });

        expect(chdir).toHaveBeenCalledWith('/tmp/repo');
        expect(importer.handler).toHaveBeenCalled();
        expect(exporter.handler).toHaveBeenCalled();
    });

    it('auto-detects from using last commit date', async () => {
        mockLog.mockResolvedValue({ latest: { date: '2024-06-01T00:00:00.000Z' } });

        let capturedArgs;
        importer.handler.mockImplementation((args) => {
            capturedArgs = args;
            return Promise.resolve();
        });

        await mirrorer.handler({ target: '/tmp/repo', branch: 'main' });

        expect(capturedArgs.from).toBeTruthy();
    });

    it('does not override args.from if already provided', async () => {
        mockLog.mockResolvedValue({ latest: { date: '2024-01-01T00:00:00.000Z' } });
        const explicitFrom = '2023-01-01';

        let capturedArgs;
        importer.handler.mockImplementation((args) => {
            capturedArgs = args;
            return Promise.resolve();
        });

        await mirrorer.handler({ target: '/tmp/repo', branch: 'main', from: explicitFrom });

        expect(capturedArgs.from).toBe(explicitFrom);
    });

    it('handles no existing repo (catch branch) — from stays undefined', async () => {
        mockLog.mockRejectedValue(new Error('not a git repo'));

        let capturedArgs;
        importer.handler.mockImplementation((args) => {
            capturedArgs = args;
            return Promise.resolve();
        });

        await mirrorer.handler({ target: '/tmp/repo', branch: 'main' });

        expect(capturedArgs.from).toBeUndefined();
    });

    it('sets args.stream to a PassThrough before calling handlers', async () => {
        mockLog.mockRejectedValue(new Error('no repo'));
        const { PassThrough } = await import('stream');

        let capturedArgs;
        importer.handler.mockImplementation((args) => {
            capturedArgs = args;
            return Promise.resolve();
        });

        await mirrorer.handler({ target: '/tmp/repo', branch: 'main' });

        expect(capturedArgs.stream).toBeInstanceOf(PassThrough);
    });

    it('calls process.exit after completion', async () => {
        mockLog.mockRejectedValue(new Error('no repo'));

        await mirrorer.handler({ target: '/tmp/repo', branch: 'main' });

        expect(exit).toHaveBeenCalled();
    });

    it('sets args.git to the new Git instance', async () => {
        mockLog.mockRejectedValue(new Error('no repo'));

        let capturedArgs;
        importer.handler.mockImplementation((args) => {
            capturedArgs = args;
            return Promise.resolve();
        });

        await mirrorer.handler({ target: '/tmp/repo', branch: 'main' });

        expect(capturedArgs.git).toBe(mockGitInstance);
    });
});
