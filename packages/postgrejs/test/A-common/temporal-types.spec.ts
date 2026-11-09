import { expect } from 'expect';
import { DateType } from '../../src/data-types/date-type.js';
import { TimeType } from '../../src/data-types/time-type.js';
import { TimestampType } from '../../src/data-types/timestamp-type.js';
import { TimestamptzType } from '../../src/data-types/timestamptz-type.js';

const d = new Date(Date.UTC(2024, 5, 15, 10, 30, 0));

describe('DateType', () => {
  it('should encode via formatDate() for the text/literal path', () => {
    expect(DateType.encodeText!(d, { utcDates: true })).toStrictEqual(
      '2024-06-15',
    );
  });
});

describe('TimeType', () => {
  it('should encode via formatTime() for the text/literal path', () => {
    expect(TimeType.encodeText!(d, { utcDates: true })).toStrictEqual(
      '10:30:00.000',
    );
  });
});

describe('TimestampType', () => {
  it('should encode via formatTimestamp() for the text/literal path', () => {
    expect(TimestampType.encodeText!(d, { utcDates: true })).toStrictEqual(
      '2024-06-15 10:30:00.000',
    );
  });
});

describe('TimestamptzType', () => {
  it('should encode via formatTimestamptz() for the text/literal path', () => {
    expect(TimestamptzType.encodeText!(d, {})).toMatch(/^2024-06-15 10:30:00/);
  });
});
