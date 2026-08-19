import { expect } from 'chai';
import { parseDateTime } from '../../../src/utils/date';

describe('parseDateTime', function () {
  it('parses UTC date/times with milliseconds', function () {
    expect(parseDateTime('2020-01-02T21:55:44.123Z')).to.equal(
      Date.UTC(2020, 0, 2, 21, 55, 44, 123),
    );
  });

  it('parses date/times without milliseconds, seconds, or with offsets', function () {
    expect(parseDateTime('2020-01-02T21:55:44Z')).to.equal(
      Date.UTC(2020, 0, 2, 21, 55, 44),
    );
    expect(parseDateTime('2020-01-02T21:55Z')).to.equal(
      Date.UTC(2020, 0, 2, 21, 55),
    );
    expect(parseDateTime('2020-01-02T21:55:44.123+01:00')).to.equal(
      Date.UTC(2020, 0, 2, 20, 55, 44, 123),
    );
    expect(parseDateTime('2020-01-02T21:55:44-05:00')).to.equal(
      Date.UTC(2020, 0, 3, 2, 55, 44),
    );
    expect(parseDateTime('2020-01-02T21:55:44+09:30')).to.equal(
      Date.UTC(2020, 0, 2, 12, 25, 44),
    );
  });

  it('treats date/times without a timezone as UTC', function () {
    expect(parseDateTime('2020-01-02T21:55:44.123')).to.equal(
      Date.UTC(2020, 0, 2, 21, 55, 44, 123),
    );
    expect(parseDateTime('2020-01-02T21:55:44')).to.equal(
      Date.UTC(2020, 0, 2, 21, 55, 44),
    );
    // Six fractional digits take the Date.parse fallback and stay UTC
    expect(parseDateTime('2020-01-02T21:55:44.123456')).to.equal(
      Date.UTC(2020, 0, 2, 21, 55, 44, 123),
    );
  });

  it('parses dates on both sides of a date change', function () {
    // Exercises the memoized date prefix and its rollover
    expect(parseDateTime('2020-01-02T23:59:59.999Z')).to.equal(
      Date.UTC(2020, 0, 2, 23, 59, 59, 999),
    );
    expect(parseDateTime('2020-01-03T00:00:00.000Z')).to.equal(
      Date.UTC(2020, 0, 3, 0, 0, 0, 0),
    );
    expect(parseDateTime('2020-01-02T23:59:59.999Z')).to.equal(
      Date.UTC(2020, 0, 2, 23, 59, 59, 999),
    );
  });

  it('parses leap days and defers invalid days to Date.parse', function () {
    expect(parseDateTime('2020-02-29T00:00:00Z')).to.equal(
      Date.UTC(2020, 1, 29),
    );
    expect(parseDateTime('2000-02-29T00:00:00Z')).to.equal(
      Date.UTC(2000, 1, 29),
    );
    // Engines disagree on days that do not exist in their month (NaN in
    // some, rollover in others), so these follow the platform's Date.parse
    [
      '2021-02-29T00:00:00Z',
      '1900-02-29T00:00:00Z',
      '2021-04-31T00:00:00Z',
    ].forEach((value) => {
      expect(Object.is(parseDateTime(value), Date.parse(value)), value).to.be
        .true;
    });
  });

  it('returns NaN for out-of-range and malformed values', function () {
    expect(parseDateTime('2025-13-32T25:61:61.000Z')).to.be.NaN;
    expect(parseDateTime('2020-01-02T24:00:00.000Z')).to.equal(
      Date.UTC(2020, 0, 3, 0, 0, 0, 0),
    );
    expect(parseDateTime('2020-01-02T21:60:00Z')).to.be.NaN;
    expect(parseDateTime('2020-01-02T21:55:60Z')).to.be.NaN;
    expect(parseDateTime('2020-01-02T21:55:44.123Z junk')).to.be.NaN;
    expect(parseDateTime('garbage')).to.be.NaN;
    expect(parseDateTime('')).to.be.NaN;
  });

  it('tolerates undefined like Date.parse', function () {
    expect(parseDateTime(undefined as any)).to.be.NaN;
  });

  it('matches Date.parse for zoned values', function () {
    [
      '2020-01-02T21:55:44.123Z',
      '2020-01-02T21:55:44Z',
      '2020-01-02T21:55Z',
      '2020-01-02T21:55:44.123+01:00',
      '2020-01-02T21:55:44-05:00',
      '2018-09-28T16:50:26Z',
      '0001-01-01T00:00:00Z',
      '9999-12-31T23:59:59.999Z',
      '1969-12-31T23:59:59.999Z',
    ].forEach((value) => {
      expect(parseDateTime(value), value).to.equal(Date.parse(value));
    });
  });
});
