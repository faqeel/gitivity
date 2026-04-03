const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Start a spinner on stderr for a task.
 *
 * @param {string} text
 *      the label to display next to the spinner.
 * @returns {{ update: (text: string) => void, done: () => void }}
 *      call update() to change the label, done() to stop and print a checkmark.
 */
export function spin(text) {
    let i = 0;
    let label = text;
    const interval = setInterval(function () {
        process.stderr.write(`\r${frames[i++ % frames.length]} ${label}`);
    }, 80);
    return {
        update(newText) {
            label = newText;
        },
        done() {
            clearInterval(interval);
            process.stderr.write(`\r✓ ${label}\n`);
        },
    };
}
