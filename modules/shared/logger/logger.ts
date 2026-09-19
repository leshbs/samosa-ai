const LEVELS = ['debug', 'info', 'warn', 'error'] as const
export type LogLevel = (typeof LEVELS)[number]

export type LogContext = Record<string, string | number | boolean | null | undefined>

const MIN_LEVEL: LogLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug'

/**
 * Structured JSON logs, correlated by requestId. Never log response text,
 * respondent metadata, or anything else user-submitted — it is PII by default.
 */
function write(level: LogLevel, message: string, context: LogContext = {}): void {
  if (LEVELS.indexOf(level) < LEVELS.indexOf(MIN_LEVEL)) return

  const line = JSON.stringify({
    level,
    message,
    time: new Date().toISOString(),
    ...context,
  })

  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const logger = {
  debug: (message: string, context?: LogContext) => write('debug', message, context),
  info: (message: string, context?: LogContext) => write('info', message, context),
  warn: (message: string, context?: LogContext) => write('warn', message, context),
  error: (message: string, context?: LogContext) => write('error', message, context),
  /** Returns a logger that stamps every line with the same correlation fields. */
  child: (base: LogContext) => ({
    debug: (m: string, c?: LogContext) => write('debug', m, { ...base, ...c }),
    info: (m: string, c?: LogContext) => write('info', m, { ...base, ...c }),
    warn: (m: string, c?: LogContext) => write('warn', m, { ...base, ...c }),
    error: (m: string, c?: LogContext) => write('error', m, { ...base, ...c }),
  }),
}
