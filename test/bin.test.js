import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const bin = resolve(fileURLToPath(import.meta.url), '../../bin/gitivity');

describe('bin/gitivity', () => {
    it('prints help and exits 0 with --help', () => {
        const result = spawnSync(process.execPath, [bin, '--help'], { encoding: 'utf8' });
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('export');
        expect(result.stdout).toContain('import');
        expect(result.stdout).toContain('mirror');
    });

    it('exits non-zero when no command provided', () => {
        const result = spawnSync(process.execPath, [bin], { encoding: 'utf8' });
        expect(result.status).not.toBe(0);
    });
});
