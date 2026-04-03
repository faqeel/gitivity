import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spin } from '../../src/util/spinner.js';

describe('spinner', () => {
    let stderrWrite;

    beforeEach(() => {
        vi.useFakeTimers();
        stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.useRealTimers();
        stderrWrite.mockRestore();
    });

    it('writes frame and label to stderr on interval tick', () => {
        spin('loading');
        vi.advanceTimersByTime(80);
        expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining('loading'));
    });

    it('uses braille frames in output', () => {
        spin('task');
        vi.advanceTimersByTime(80);
        const call = stderrWrite.mock.calls[0][0];
        expect(call).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
    });

    it('update changes the label on next tick', () => {
        const spinner = spin('before');
        spinner.update('after');
        vi.advanceTimersByTime(80);
        expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining('after'));
        expect(stderrWrite).not.toHaveBeenCalledWith(expect.stringContaining('before'));
    });

    it('done writes checkmark line with current label', () => {
        const spinner = spin('my task');
        spinner.done();
        expect(stderrWrite).toHaveBeenCalledWith('\r✓ my task\n');
    });

    it('done after update uses updated label', () => {
        const spinner = spin('original');
        spinner.update('final');
        spinner.done();
        expect(stderrWrite).toHaveBeenCalledWith('\r✓ final\n');
    });

    it('done stops the interval', () => {
        const spinner = spin('task');
        spinner.done();
        stderrWrite.mockClear();
        vi.advanceTimersByTime(500);
        expect(stderrWrite).not.toHaveBeenCalled();
    });
});
