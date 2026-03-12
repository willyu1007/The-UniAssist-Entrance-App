import { PlatformError } from './platform-errors';

type CronField = {
  any: boolean;
  values: Set<number>;
};

type CronSchedule = {
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField;
};

type ZonedDateParts = {
  minute: number;
  hour: number;
  dayOfMonth: number;
  month: number;
  dayOfWeek: number;
};

const MONTH_ALIASES: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const DAY_OF_WEEK_ALIASES: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

const WEEKDAY_PART_ALIASES: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const zonedFormatterCache = new Map<string, Intl.DateTimeFormat>();

export function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

export function normalizeRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function getCronFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = zonedFormatterCache.get(timeZone);
  if (formatter) {
    return formatter;
  }
  formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    weekday: 'short',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  zonedFormatterCache.set(timeZone, formatter);
  return formatter;
}

function parseCronNumber(
  rawValue: string,
  min: number,
  max: number,
  fieldName: string,
  aliases?: Record<string, number>,
): number {
  const normalized = rawValue.trim().toLowerCase();
  const aliasValue = aliases?.[normalized];
  const numericValue = aliasValue ?? Number(normalized);
  if (!Number.isInteger(numericValue)) {
    throw new PlatformError(400, 'INVALID_SCHEDULE_CONFIG', `${fieldName} cron token is invalid`);
  }
  const next = fieldName === 'dayOfWeek' && numericValue === 7 ? 0 : numericValue;
  if (next < min || next > max) {
    throw new PlatformError(400, 'INVALID_SCHEDULE_CONFIG', `${fieldName} cron token is out of range`);
  }
  return next;
}

function expandCronPart(
  part: string,
  min: number,
  max: number,
  fieldName: string,
  aliases?: Record<string, number>,
): Set<number> {
  const [base, stepRaw] = part.split('/');
  const step = stepRaw === undefined ? 1 : Number(stepRaw);
  if (!Number.isInteger(step) || step <= 0) {
    throw new PlatformError(400, 'INVALID_SCHEDULE_CONFIG', `${fieldName} cron step is invalid`);
  }

  const values = new Set<number>();
  const startBase = base.trim();

  if (startBase === '*') {
    for (let value = min; value <= max; value += step) {
      values.add(fieldName === 'dayOfWeek' && value === 7 ? 0 : value);
    }
    return values;
  }

  const rangeParts = startBase.split('-');
  if (rangeParts.length === 2) {
    const rangeStart = parseCronNumber(rangeParts[0], min, max, fieldName, aliases);
    const rangeEnd = parseCronNumber(rangeParts[1], min, max, fieldName, aliases);
    if (rangeEnd < rangeStart) {
      throw new PlatformError(400, 'INVALID_SCHEDULE_CONFIG', `${fieldName} cron range is invalid`);
    }
    for (let value = rangeStart; value <= rangeEnd; value += step) {
      values.add(fieldName === 'dayOfWeek' && value === 7 ? 0 : value);
    }
    return values;
  }

  const single = parseCronNumber(startBase, min, max, fieldName, aliases);
  values.add(single);
  return values;
}

function parseCronField(
  expression: string,
  min: number,
  max: number,
  fieldName: string,
  aliases?: Record<string, number>,
): CronField {
  const normalized = expression.trim();
  if (normalized === '*') {
    return {
      any: true,
      values: new Set<number>(),
    };
  }
  const values = new Set<number>();
  for (const part of normalized.split(',')) {
    const expanded = expandCronPart(part, min, max, fieldName, aliases);
    for (const value of expanded) {
      values.add(value);
    }
  }
  if (values.size === 0) {
    throw new PlatformError(400, 'INVALID_SCHEDULE_CONFIG', `${fieldName} cron field is empty`);
  }
  return {
    any: false,
    values,
  };
}

function parseCronExpression(expression: string): CronSchedule {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new PlatformError(400, 'INVALID_SCHEDULE_CONFIG', 'cron schedule must have exactly 5 fields');
  }
  return {
    minute: parseCronField(fields[0], 0, 59, 'minute'),
    hour: parseCronField(fields[1], 0, 23, 'hour'),
    dayOfMonth: parseCronField(fields[2], 1, 31, 'dayOfMonth'),
    month: parseCronField(fields[3], 1, 12, 'month', MONTH_ALIASES),
    dayOfWeek: parseCronField(fields[4], 0, 7, 'dayOfWeek', DAY_OF_WEEK_ALIASES),
  };
}

function matchesCronField(field: CronField, value: number): boolean {
  return field.any || field.values.has(value);
}

function getZonedDateParts(timestamp: number, timeZone: string): ZonedDateParts {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = getCronFormatter(timeZone).formatToParts(new Date(timestamp));
  } catch (error) {
    throw new PlatformError(
      400,
      'INVALID_SCHEDULE_CONFIG',
      error instanceof Error ? error.message : 'invalid schedule timezone',
    );
  }

  const partMap = new Map<string, string>();
  for (const part of parts) {
    if (part.type !== 'literal') {
      partMap.set(part.type, part.value);
    }
  }

  const weekday = WEEKDAY_PART_ALIASES[partMap.get('weekday') || ''];
  const minute = Number(partMap.get('minute'));
  const hour = Number(partMap.get('hour'));
  const dayOfMonth = Number(partMap.get('day'));
  const month = Number(partMap.get('month'));

  if (
    weekday === undefined
    || !Number.isInteger(minute)
    || !Number.isInteger(hour)
    || !Number.isInteger(dayOfMonth)
    || !Number.isInteger(month)
  ) {
    throw new PlatformError(500, 'SCHEDULE_TIMEZONE_FORMAT_ERROR', 'failed to interpret zoned schedule parts');
  }

  return {
    minute,
    hour,
    dayOfMonth,
    month,
    dayOfWeek: weekday,
  };
}

function matchesCronSchedule(schedule: CronSchedule, parts: ZonedDateParts): boolean {
  if (!matchesCronField(schedule.minute, parts.minute)) {
    return false;
  }
  if (!matchesCronField(schedule.hour, parts.hour)) {
    return false;
  }
  if (!matchesCronField(schedule.month, parts.month)) {
    return false;
  }

  const domMatches = matchesCronField(schedule.dayOfMonth, parts.dayOfMonth);
  const dowMatches = matchesCronField(schedule.dayOfWeek, parts.dayOfWeek);

  if (schedule.dayOfMonth.any && schedule.dayOfWeek.any) {
    return true;
  }
  if (schedule.dayOfMonth.any) {
    return dowMatches;
  }
  if (schedule.dayOfWeek.any) {
    return domMatches;
  }
  return domMatches || dowMatches;
}

function computeNextCronTriggerAt(expression: string, timeZone: string, fromTimestamp: number): number {
  const schedule = parseCronExpression(expression);
  const startMinute = Math.floor(fromTimestamp / 60_000) * 60_000;
  const maxLookaheadMinutes = 366 * 5 * 24 * 60;

  for (let offset = 1; offset <= maxLookaheadMinutes; offset += 1) {
    const candidate = startMinute + offset * 60_000;
    if (matchesCronSchedule(schedule, getZonedDateParts(candidate, timeZone))) {
      return candidate;
    }
  }

  throw new PlatformError(400, 'INVALID_SCHEDULE_CONFIG', 'cron schedule did not resolve within the supported lookahead window');
}

export function computeNextScheduleTriggerAt(configJson: Record<string, unknown>, fromTimestamp: number): number {
  const cron = normalizeString(configJson.cron);
  const hasInterval = configJson.intervalMs !== undefined && configJson.intervalMs !== null;
  if (cron && hasInterval) {
    throw new PlatformError(400, 'INVALID_SCHEDULE_CONFIG', 'schedule trigger must specify either cron or intervalMs, not both');
  }
  if (cron) {
    const timeZone = normalizeString(configJson.timezone);
    if (!timeZone) {
      throw new PlatformError(400, 'INVALID_SCHEDULE_CONFIG', 'cron schedule requires timezone');
    }
    return computeNextCronTriggerAt(cron, timeZone, fromTimestamp);
  }

  const intervalMs = Number(configJson.intervalMs);
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new PlatformError(400, 'INVALID_SCHEDULE_CONFIG', 'schedule trigger requires positive intervalMs or a valid cron expression');
  }
  return fromTimestamp + Math.floor(intervalMs);
}

export function getWebhookReplayWindowMs(configJson: Record<string, unknown>): number {
  const replayWindowMs = Number(configJson.replayWindowMs);
  return Number.isFinite(replayWindowMs) && replayWindowMs > 0
    ? Math.floor(replayWindowMs)
    : 300_000;
}

export function getWebhookSignatureHeader(configJson: Record<string, unknown>): string {
  return normalizeString(configJson.signatureHeader) || 'x-uniassist-signature';
}

export function getWebhookTimestampHeader(configJson: Record<string, unknown>): string {
  return normalizeString(configJson.timestampHeader) || 'x-uniassist-timestamp';
}

export function getWebhookDedupeHeader(configJson: Record<string, unknown>): string {
  return normalizeString(configJson.dedupeHeader) || 'x-uniassist-delivery-id';
}
