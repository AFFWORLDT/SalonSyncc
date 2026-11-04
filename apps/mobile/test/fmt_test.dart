import 'package:flutter_test/flutter_test.dart';
import 'package:salonkit/core/format/fmt.dart';
import 'package:salonkit/models/settings.dart';

import 'support/me_fixture.dart';

SalonSettings s(String cur, int minor, [String locale = 'en-AE']) =>
    SalonSettings.fromJson({...fx('me_barber.json')['settings'] as Map<String, dynamic>, 'currency': cur, 'currency_minor': minor, 'locale': locale});

void main() {
  final aed = Fmt(s('AED', 100));

  test('money: whole values have no decimals, others all of them', () {
    expect(aed.money(2500), 'AED 25');
    expect(aed.money(2550), 'AED 25.50');
    expect(aed.money(123456700), 'AED 1,234,567');
    expect(aed.money(-500), 'AED -5');
  });

  test('fmt 3 decimals', () {
    final bhd = Fmt(s('BHD', 1000));
    expect(bhd.money(12345), 'BHD 12.345');
    expect(bhd.fromInput('12.345'), 12345);
    expect(bhd.fromInput('12.3456'), isNull);
  });

  test('zero-decimal currency groups', () => expect(Fmt(s('JPY', 1)).money(1200), 'JPY 1,200'));

  test('unknown locale falls back', () => expect(Fmt(s('AED', 100, 'xx-YY')).money(2550), 'AED 25.50'));

  test('fromInput: major text to minor units, invalid → null', () {
    expect(aed.fromInput('25.5'), 2550);
    expect(aed.fromInput(' 25 '), 2500);
    expect(aed.fromInput('25.555'), isNull);
    expect(aed.fromInput('0'), isNull);
    expect(aed.fromInput(''), isNull);
    expect(aed.fromInput('abc'), isNull);
    expect(aed.fromInput('1000001'), isNull);
  });

  test('toInput: minor units back to a field value', () {
    expect(aed.toInput(2550), '25.5');
    expect(aed.toInput(2500), '25');
  });

  test('num: bare number, dash for zero when asked', () {
    expect(aed.num(2550), '25.5');
    expect(aed.num(0, dash: true), '–');
  });

  test('day labels', () {
    expect(aed.dayLabel('2026-10-21'), 'Wed 21 Oct');
    expect(aed.dateLabel('2026-10-21'), '21 Oct 2026');
    expect(aed.monthLabel('2026-10'), 'October 2026');
  });

  test('phone label for local numbers', () {
    expect(aed.phone('0501234567'), '050 123 4567');
    expect(aed.phone('+971501234567'), '+971501234567');
  });

  test('me.fmt is cached per /api/me answer', () {
    final me = meWith(barber: true);
    expect(identical(me.fmt, me.fmt), isTrue);
    expect(me.fmt.money(2500), 'AED 25');
  });

  test('settings parse from /api/me', () {
    final st = s('AED', 100);
    expect(st.currency, 'AED');
    expect(st.displayName, 'supersalon');
    expect(st.quickAmounts, [15, 20, 25, 30, 35, 50]);
    expect(st.phoneCountry, '971');
    expect(st.vatEnabled, isFalse);
    expect(st.waReady, isFalse);
    expect(st.thankYouText, contains('{link}'));
  });
}
