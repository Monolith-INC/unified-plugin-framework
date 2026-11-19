import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { test } from 'node:test';
import { createPicker, pick, reducePicker } from '../scripts/installer-picker.mjs';

const items = [{ value: 'codex', label: 'Codex' }, { value: 'claude', label: 'Claude Code' }];
const checklist = { title: 'Choose hosts', items, mode: 'checklist' };
const confirmation = {
  title: 'Continue?',
  mode: 'single',
  items: [{ value: 'install', label: 'Install' }, { value: 'cancel', label: 'Cancel' }],
  initial: ['cancel'],
};
const press = (state, ...keys) => keys.reduce(reducePicker, state);

test('checklist requires one choice and supports the All row and a toggle', () => {
  const start = createPicker(checklist);
  assert.deepEqual(press(start, 'return'), start);
  assert.deepEqual(press(start, 'space', 'return'), { kind: 'picked', values: ['codex', 'claude'] });
  assert.deepEqual(press(start, 'a', 'a', 'return'), start);
  const preselected = createPicker({ ...checklist, initial: ['claude'] });
  assert.deepEqual(press(preselected, 'down', 'space', 'return'), { kind: 'picked', values: ['codex', 'claude'] });
  assert.deepEqual(press(preselected, 'return'), { kind: 'picked', values: ['claude'] });
});

test('confirmation starts on Cancel and requires navigation to accept', () => {
  const start = createPicker(confirmation);
  assert.deepEqual(press(start, 'return'), { kind: 'picked', values: ['cancel'] });
  assert.deepEqual(press(start, 'up', 'return'), { kind: 'picked', values: ['install'] });
});

const terminal = ({ tty = true, raw = false } = {}) => {
  const input = new PassThrough();
  const modes = [];
  Object.assign(input, {
    isTTY: tty,
    isRaw: raw,
    setRawMode: value => { input.isRaw = value; modes.push(value); return input; },
  });
  const display = new EventEmitter();
  const output = new Writable({
    write(chunk, encoding, done) { display.emit('render', chunk.toString()); done(); },
  });
  Object.assign(output, { isTTY: tty, columns: 80 });
  return { input, output, display, modes, signals: new EventEmitter(), term: 'xterm' };
};

test('raw picker drops queued acceptance keys, restores the previous mode, and hands readline back', async () => {
  const io = terminal({ raw: true });
  const handoffs = [];
  io.input.write('\x1b[A\r');
  io.display.once('render', text => {
    assert.match(text, /> Cancel/);
    setImmediate(() => io.input.write('\r'));
  });
  const result = await pick(confirmation, {
    ...io,
    suspendReadline: () => {
      handoffs.push('closed');
      return () => handoffs.push('reopened');
    },
  });
  assert.deepEqual(result, { kind: 'picked', values: ['cancel'] });
  assert.deepEqual(io.modes, [true, true]);
  assert.deepEqual(handoffs, ['closed', 'reopened']);
});

[
  ['Ctrl-C', io => io.input.write('\x03')],
  ['Ctrl-D', io => io.input.write('\x04')],
  ['EOF', io => io.input.end()],
  ['close', io => io.input.destroy()],
  ['SIGHUP', io => io.signals.emit('SIGHUP')],
].forEach(([name, cancel]) => test(`${name} cancels and restores the terminal`, async () => {
  const io = terminal();
  io.display.once('render', () => setImmediate(() => cancel(io)));
  assert.deepEqual(await pick(checklist, io), { kind: 'canceled' });
  assert.deepEqual(io.modes, [true, false]);
  assert.equal(io.signals.listenerCount('SIGHUP'), 0);
}));

test('numbered fallback accepts multiple valid rows without raw mode', async () => {
  const io = terminal({ tty: false });
  io.display.once('render', text => {
    assert.match(text, /1\. All.*2\. Codex.*3\. Claude Code/s);
    setImmediate(() => io.input.write('9\n2, 3\n'));
  });
  assert.deepEqual(await pick(checklist, io), { kind: 'picked', values: ['codex', 'claude'] });
  assert.deepEqual(io.modes, []);
});

test('numbered fallback does not infer acceptance from EOF', async () => {
  const io = terminal({ tty: false });
  io.display.once('render', () => setImmediate(() => io.input.end()));
  assert.deepEqual(await pick(confirmation, io), { kind: 'canceled' });
});

test('dumb terminals and terminals that reject raw mode still offer numbered choices', async () => {
  const chooseCancel = async io => {
    io.display.once('render', text => {
      assert.match(text, /2\. Cancel \(selected\)/);
      setImmediate(() => io.input.write('\n'));
    });
    assert.deepEqual(await pick(confirmation, io), { kind: 'picked', values: ['cancel'] });
  };
  const dumb = terminal();
  await chooseCancel({ ...dumb, term: 'dumb' });
  assert.deepEqual(dumb.modes, []);
  const unavailable = terminal();
  unavailable.input.setRawMode = () => { throw new Error('Raw input unavailable'); };
  await chooseCancel(unavailable);
});
