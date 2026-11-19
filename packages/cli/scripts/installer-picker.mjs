import { on } from 'node:events';
import { createInterface, emitKeypressEvents } from 'node:readline';
import { setImmediate as nextTurn } from 'node:timers/promises';

const canceled = Object.freeze({ kind: 'canceled' });
const rawUnavailable = Object.freeze({ kind: 'raw-unavailable' });
const picked = values => ({ kind: 'picked', values });
const valuesOf = state => state.items.map(({ value }) => value);
const isChecklist = state => state.mode === 'checklist';
const toggle = (values, value) => values.includes(value) ? values.filter(item => item !== value) : [...values, value];

/** Create a checklist or single-choice list. Set initial to ['cancel'] for confirmation. */
export const createPicker = ({ title, items, mode, initial = [] }) => ({
  kind: 'choosing',
  title,
  items,
  mode,
  cursor: mode === 'checklist' ? 0 : Math.max(0, items.findIndex(({ value }) => value === initial[0])),
  selected: items.filter(({ value }) => initial.includes(value)).map(({ value }) => value),
});

const rowsOf = state => isChecklist(state) ? [{ label: 'All' }, ...state.items] : state.items;
const move = (state, offset) => ({ ...state, cursor: (state.cursor + offset + rowsOf(state).length) % rowsOf(state).length });
const accept = state => isChecklist(state)
  ? state.selected.length === 0 ? state : picked(valuesOf(state).filter(value => state.selected.includes(value)))
  : state.items[state.cursor] === undefined ? state : picked([state.items[state.cursor].value]);
const space = state => isChecklist(state)
  ? { ...state, selected: state.cursor === 0 ? valuesOf(state) : toggle(state.selected, state.items[state.cursor - 1].value) }
  : state;

/** Apply one normalized key and leave the previous state intact. */
export const reducePicker = (state, key) => {
  if (state.kind !== 'choosing' || !state.items.length) return state;
  switch (key) {
    case 'up': return move(state, -1);
    case 'down': return move(state, 1);
    case 'space': return space(state);
    case 'a': return isChecklist(state) ? { ...state, selected: state.selected.length === state.items.length ? [] : valuesOf(state) } : state;
    case 'return':
    case 'enter': return accept(state);
    case 'cancel': return canceled;
    default: return state;
  }
};

const rowSelected = (state, row, index) => isChecklist(state)
  ? index === 0 ? state.selected.length === state.items.length : state.selected.includes(row.value)
  : index === state.cursor;
const marks = utf8 => utf8 ? ['☐ ', '☑ '] : ['[ ] ', '[x] '];
const instructions = state => isChecklist(state) ? 'Arrows move, Space selects, a toggles all, Enter confirms.' : 'Arrows move, Enter confirms.';
const fit = (output, text) => typeof output.columns === 'number' ? Array.from(text).slice(0, Math.max(1, output.columns - 1)).join('') : text;
const rawScreen = (state, output, utf8) => [
  state.title,
  ...rowsOf(state).map((row, index) => {
    const cursor = index === state.cursor ? '> ' : '  ';
    const mark = isChecklist(state) ? marks(utf8)[Number(rowSelected(state, row, index))] : '';
    return cursor + mark + row.label;
  }),
  instructions(state),
].map(line => fit(output, line)).join('\n') + '\n';

const rawKey = ([, key]) => key?.ctrl && ['c', 'd'].includes(key.name) ? 'cancel' : key?.name;
const take = async (events, state, update, render) => {
  const next = await events.next();
  if (next.done) return canceled;
  const result = update(state, next.value);
  if (result.kind !== 'choosing') return result;
  if (result !== state) render(result);
  return take(events, result, update, render);
};

const withCancellation = async (signals, enter) => {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signals.once('SIGINT', cancel);
  signals.once('SIGHUP', cancel);
  try {
    return await enter(controller.signal);
  } catch (error) {
    if (controller.signal.aborted && error.name === 'AbortError') return canceled;
    throw error;
  } finally {
    signals.off('SIGINT', cancel);
    signals.off('SIGHUP', cancel);
  }
};

const readKeys = async (state, input, output, signal, utf8) => {
  // Resume without a keypress consumer so input queued before this prompt cannot select a row.
  input.resume();
  await nextTurn();
  if (signal.aborted || input.readableEnded || input.destroyed) return canceled;
  emitKeypressEvents(input);
  const events = on(input, 'keypress', { signal, close: ['end', 'close'] });
  const redraw = next => output.write(`\x1b[${rowsOf(next).length + 2}A\x1b[0J${rawScreen(next, output, utf8)}`);
  try {
    output.write(rawScreen(state, output, utf8));
    return await take(events, state, (previous, event) => reducePicker(previous, rawKey(event)), redraw);
  } finally {
    await events.return();
  }
};

const rawPicker = async (state, { input, output, signals }, signal, utf8) => {
  const previousRaw = input.isRaw === true;
  const restore = () => input.setRawMode(previousRaw);
  try {
    input.setRawMode(true);
  } catch {
    if (input.isRaw !== previousRaw) restore();
    return rawUnavailable;
  }
  signals.once('exit', restore);
  try {
    return await readKeys(state, input, output, signal, utf8);
  } finally {
    signals.off('exit', restore);
    input.pause();
    restore();
  }
};

const numberLabel = (state, row, index) => `${index + 1}. ${row.label}${rowSelected(state, row, index) ? ' (selected)' : ''}`;
const numberedScreen = state => [state.title, ...rowsOf(state).map((row, index) => numberLabel(state, row, index)),
  isChecklist(state) ? 'Enter one or more numbers separated by commas.' : 'Enter a number or press Enter for the selected option.',
].join('\n') + '\n';
const numberChoice = (state, [answer]) => {
  const text = answer.trim();
  const slots = text.split(',').map(part => part.trim()).map(part => /^\d+$/.test(part) ? Number(part) - 1 : -1);
  if (text.includes('\x03') || text.includes('\x04')) return canceled;
  if (!text) return accept(state);
  if (slots.some(index => index < 0 || index >= rowsOf(state).length)) return state;
  if (!isChecklist(state)) return slots.length === 1 ? picked([state.items[slots[0]].value]) : state;
  return picked(slots.includes(0) ? valuesOf(state) : valuesOf(state).filter((_, index) => slots.includes(index + 1)));
};
const numberedPicker = async (state, { input, output }, signal) => {
  if (signal.aborted) return canceled;
  const lines = createInterface({ input, terminal: false });
  const events = on(lines, 'line', { signal, close: ['close'] });
  try {
    output.write(numberedScreen(state));
    return await take(events, state, (previous, line) => {
      const result = numberChoice(previous, line);
      if (result === previous) output.write('Choose a number from the list.\n');
      return result;
    }, () => undefined);
  } finally {
    await events.return();
    lines.close();
  }
};

const rawCapable = (state, { input, output }, term) => term !== 'dumb'
  && input.isTTY && output.isTTY && typeof input.setRawMode === 'function'
  && (typeof output.columns !== 'number' || rowsOf(state).every(({ label }) => label.length + 7 <= output.columns));

/** Give this picker exclusive input access for one prompt and restore the previous owner afterward. */
export const pick = async (options, {
  input, output, signals = process, suspendReadline = () => () => undefined, locale = process.env.LC_ALL || process.env.LC_CTYPE || process.env.LANG,
  term = process.env.TERM,
}) => {
  const state = createPicker(options);
  if (!state.items.length || input.readableEnded || input.destroyed) return canceled;
  const resumeReadline = suspendReadline();
  try {
    const terminal = { input, output, signals };
    return await withCancellation(signals, async signal => {
      const result = rawCapable(state, terminal, term)
        ? await rawPicker(state, terminal, signal, /utf-?8/i.test(locale ?? '')) : rawUnavailable;
      return result === rawUnavailable ? numberedPicker(state, terminal, signal) : result;
    });
  } finally {
    resumeReadline();
  }
};
