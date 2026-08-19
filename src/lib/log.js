const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

function emit(level, prefix, args) {
  if (LEVELS[level] < threshold) return;
  const stamp = new Date().toISOString().slice(11, 19);
  const stream = level === 'error' || level === 'warn' ? console.error : console.log;
  stream(`${stamp} ${prefix}`, ...args);
}

export const log = {
  debug: (...a) => emit('debug', '·', a),
  info: (...a) => emit('info', '›', a),
  ok: (...a) => emit('info', '✓', a),
  warn: (...a) => emit('warn', '!', a),
  error: (...a) => emit('error', '✗', a),
  step: (...a) => emit('info', '\n──', a),
};
