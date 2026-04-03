import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Readable } from 'stream';
import importer from '../../src/command/import.js';

function makeStream(...lines) {
    return Readable.from(lines.map((l) => JSON.stringify(l) + '\n').join(''));
}

const mockCommit = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const mockInit = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const mockLog = vi.hoisted(() => vi.fn());
const mockSpinUpdate = vi.hoisted(() => vi.fn());
const mockSpinDone = vi.hoisted(() => vi.fn());
const mockSpin = vi.hoisted(() => vi.fn(() => ({ update: mockSpinUpdate, done: mockSpinDone })));

vi.mock('mkdirp', () => ({ mkdirp: vi.fn().mockResolvedValue(undefined) }));

vi.mock('simple-git', () => ({
    default: vi.fn(function () {
        return { init: mockInit, log: mockLog, commit: mockCommit };
    }),
}));

vi.mock('../../src/util/spinner.js', () => ({ spin: mockSpin }));

describe('import command', () => {
    let chdir;

    beforeEach(() => {
        vi.clearAllMocks();
        mockCommit.mockResolvedValue({});
        mockInit.mockResolvedValue({});
        chdir = vi.spyOn(process, 'chdir').mockImplementation(() => {});
    });

    afterEach(() => {
        chdir.mockRestore();
    });

    it('has correct command and describe', () => {
        const cmd = Array.isArray(importer.command) ? importer.command[0] : importer.command;
        expect(cmd).toContain('import');
        expect(importer.describe).toBeTruthy();
    });

    it('builder registers target, author, and branch options', () => {
        const args = {
            positional: vi.fn().mockReturnThis(),
            option: vi.fn().mockReturnThis(),
        };
        importer.builder(args);
        expect(args.positional).toHaveBeenCalledWith('target', expect.any(Object));
        expect(args.option).toHaveBeenCalledWith('author', expect.any(Object));
        expect(args.option).toHaveBeenCalledWith('branch', expect.any(Object));
    });

    it('creates target directory and chdirs into it', async () => {
        const { mkdirp } = await import('mkdirp');
        mockLog.mockRejectedValue(new Error('no commits'));

        await importer.handler({ target: '/tmp/repo', branch: 'main', stream: makeStream() });

        expect(mkdirp).toHaveBeenCalledWith('/tmp/repo');
        expect(chdir).toHaveBeenCalledWith('/tmp/repo');
    });

    it('inits git repo with the specified branch', async () => {
        mockLog.mockRejectedValue(new Error('no commits'));

        await importer.handler({ target: '/tmp/repo', branch: 'trunk', stream: makeStream() });

        expect(mockInit).toHaveBeenCalledWith(false, ['-b', 'trunk']);
    });

    it('creates a commit for each action in the stream', async () => {
        mockLog.mockRejectedValue(new Error('no commits'));
        const actions = [
            { id: 'abc', author: 'Alice <a@b.com>', timestamp: '2024-01-01T00:00:00.000Z' },
            { id: 'def', author: 'Alice <a@b.com>', timestamp: '2024-01-02T00:00:00.000Z' },
        ];

        await importer.handler({ target: '/tmp/repo', branch: 'main', stream: makeStream(...actions) });

        expect(mockCommit).toHaveBeenCalledTimes(2);
        expect(mockCommit).toHaveBeenCalledWith('abc', ['--allow-empty', '--date', '2024-01-01T00:00:00.000Z', '--author', 'Alice <a@b.com>']);
        expect(mockCommit).toHaveBeenCalledWith('def', ['--allow-empty', '--date', '2024-01-02T00:00:00.000Z', '--author', 'Alice <a@b.com>']);
    });

    it('uses args.author override instead of action author', async () => {
        mockLog.mockRejectedValue(new Error('no commits'));
        const action = { id: 'xyz', author: 'Original <orig@example.com>', timestamp: '2024-01-01T00:00:00.000Z' };

        await importer.handler({ target: '/tmp/repo', branch: 'main', author: 'Override <over@example.com>', stream: makeStream(action) });

        expect(mockCommit).toHaveBeenCalledWith('xyz', ['--allow-empty', '--date', '2024-01-01T00:00:00.000Z', '--author', 'Override <over@example.com>']);
    });

    it('deduplicates actions already in git log', async () => {
        mockLog.mockResolvedValue({ all: [{ message: 'existing-id' }] });
        const actions = [
            { id: 'existing-id', author: 'Alice <a@b.com>', timestamp: '2024-01-01T00:00:00.000Z' },
            { id: 'new-id', author: 'Alice <a@b.com>', timestamp: '2024-01-02T00:00:00.000Z' },
        ];

        await importer.handler({ target: '/tmp/repo', branch: 'main', stream: makeStream(...actions) });

        expect(mockCommit).toHaveBeenCalledTimes(1);
        expect(mockCommit).toHaveBeenCalledWith('new-id', expect.any(Array));
    });

    it('handles empty stream without committing', async () => {
        mockLog.mockRejectedValue(new Error('no commits'));

        await importer.handler({ target: '/tmp/repo', branch: 'main', stream: makeStream() });

        expect(mockCommit).not.toHaveBeenCalled();
    });

    it('handles no existing commits (catch branch) gracefully', async () => {
        mockLog.mockRejectedValue(new Error('no repo'));
        const action = { id: 'first', author: 'Alice <a@b.com>', timestamp: '2024-01-01T00:00:00.000Z' };

        await importer.handler({ target: '/tmp/repo', branch: 'main', stream: makeStream(action) });

        expect(mockCommit).toHaveBeenCalledTimes(1);
    });

    it('falls back to process.stdin when args.stream is not provided', async () => {
        mockLog.mockRejectedValue(new Error('no commits'));
        const fakeStdin = Readable.from([]);
        const orig = Object.getOwnPropertyDescriptor(process, 'stdin');
        Object.defineProperty(process, 'stdin', { value: fakeStdin, configurable: true, writable: true });

        await importer.handler({ target: '/tmp/repo', branch: 'main' });

        if (orig) Object.defineProperty(process, 'stdin', orig);
        expect(mockCommit).not.toHaveBeenCalled();
    });

    it('uses args.git if provided instead of creating new Git instance', async () => {
        mockLog.mockRejectedValue(new Error('no commits'));

        await importer.handler({ target: '/tmp/repo', branch: 'main', stream: makeStream(), git: { init: mockInit, log: mockLog, commit: mockCommit } });

        expect(mockInit).toHaveBeenCalled();
    });

    it('calls spin on first commit', async () => {
        mockLog.mockRejectedValue(new Error('no commits'));
        const action = { id: 'a', author: 'Alice <a@b.com>', timestamp: '2024-01-01T00:00:00.000Z' };

        await importer.handler({ target: '/tmp/repo', branch: 'main', stream: makeStream(action) });

        expect(mockSpin).toHaveBeenCalledWith('1 commit imported');
    });

    it('updates spinner count for subsequent commits', async () => {
        mockLog.mockRejectedValue(new Error('no commits'));
        const actions = [
            { id: 'a', author: 'Alice <a@b.com>', timestamp: '2024-01-01T00:00:00.000Z' },
            { id: 'b', author: 'Alice <a@b.com>', timestamp: '2024-01-02T00:00:00.000Z' },
        ];

        await importer.handler({ target: '/tmp/repo', branch: 'main', stream: makeStream(...actions) });

        expect(mockSpinUpdate).toHaveBeenCalledWith('2 commits imported');
    });

    it('calls spinner.done after all commits', async () => {
        mockLog.mockRejectedValue(new Error('no commits'));
        const action = { id: 'a', author: 'Alice <a@b.com>', timestamp: '2024-01-01T00:00:00.000Z' };

        await importer.handler({ target: '/tmp/repo', branch: 'main', stream: makeStream(action) });

        expect(mockSpinDone).toHaveBeenCalledTimes(1);
    });

    it('writes "0 commits imported" to stderr when nothing imported', async () => {
        mockLog.mockRejectedValue(new Error('no commits'));
        const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => {});

        await importer.handler({ target: '/tmp/repo', branch: 'main', stream: makeStream() });

        expect(stderrWrite).toHaveBeenCalledWith('✓ 0 commits imported\n');
        stderrWrite.mockRestore();
    });
});
