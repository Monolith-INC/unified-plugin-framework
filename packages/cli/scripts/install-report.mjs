const controlCharacters = /\p{Cc}/gu;
const ansiSequences = /\u001b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\))/gu;
const clean = (value) => String(value ?? '').replace(ansiSequences, '').replace(controlCharacters, '').trim();
const HOST_LABELS = Object.freeze({ codex: 'Codex', claude: 'Claude Code' });
const LOGIN_COMMANDS = Object.freeze({ codex: 'codex login', claude: 'claude auth login' });
const labelHost = (host) => HOST_LABELS[host] ?? clean(host);
const reports = (value) => {
  const scoped = [
    ...(value.project?.steps ?? []),
    ...(value.hosts ?? []).flatMap(({ host, tooling }) => (tooling?.steps ?? []).map((step) => ({ ...step, host }))),
  ];
  return scoped.length > 0 ? scoped : value.tooling?.steps ?? [];
};
const exitFor = (steps, strict) => {
  const classes = steps.filter((step) => step.status !== 'ready').map((step) => step.failure?.class ?? 'stop');
  const exitCode = classes.some((value) => value === 'stop' || value === 'preserve') ? 1
    : classes.some((value) => value === 'hand-off' || value === 'user-action') ? 2 : 0;
  return strict && exitCode === 2 ? 1 : exitCode;
};
const detailsFor = (step) => {
  const host = labelHost(step.host);
  const failure = step.failure ?? {};
  const subject = step.host === undefined ? clean(step.step) : `${host}: ${clean(step.step)}`;
  const description = clean(failure.message);
  const recovery = clean(failure.recovery);
  const command = failure.code === 'host-sign-in-needed' ? LOGIN_COMMANDS[step.host] : undefined;
  return [
    `- ${subject}${description ? `: ${description}` : ''}`,
    ...(command === undefined ? [] : [`  Sign in with: ${command}`]),
    ...(recovery === '' ? [] : [`  Next: ${recovery}`]),
  ];
};

/** Turn the structured bootstrap JSON into a safe final message and class-derived process status. */
export const finishInstall = (stdout, { strict = false } = {}) => {
  const parsed = (() => { try { return JSON.parse(stdout); } catch { return null; } })();
  return parsed?.ok === true && parsed.value !== null && typeof parsed.value === 'object'
    ? finishValue(parsed.value, strict)
    : parsed?.ok === false && parsed.error !== null && typeof parsed.error === 'object'
      ? finishFailure(parsed.error, strict)
      : { message: 'Setup stopped because the installer returned an unreadable result.', exitCode: 1 };
};

const finishFailure = (failure, strict) => {
  const pendingUserAction = failure.class === 'hand-off' || failure.class === 'user-action';
  return {
    message: [clean(failure.message) || 'Setup could not complete.', clean(failure.recovery)].filter(Boolean).join('\n'),
    exitCode: pendingUserAction && !strict ? 2 : 1,
  };
};

const finishValue = (value, strict) => {
  const steps = reports(value);
  const hosts = [...new Set((value.hosts ?? []).map(({ host }) => host).concat(value.host ? [value.host] : []))];
  const lines = [
    value.status === 'ready' ? 'Setup is ready.' : 'Setup report',
    ...(hosts.length === 0 ? [] : [`Hosts: ${hosts.map(labelHost).join(', ')}`]),
    ...steps.filter((step) => step.status !== 'ready').flatMap(detailsFor),
    ...((value.backups ?? []).length === 0 ? [] : [`Backups saved: ${(value.backups ?? []).map(clean).join(', ')}`]),
    ...((value.handoffs ?? []).length === 0 ? [] : ['Next session: Use the project-bootstrap skill to finish setup']),
  ];
  return { message: lines.join('\n'), exitCode: exitFor(steps, strict) };
};
