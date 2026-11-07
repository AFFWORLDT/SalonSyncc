import 'dart:math' as math;

import 'package:intl/intl.dart';
import 'package:timezone/data/latest_10y.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import '../../models/me.dart';
import '../../models/settings.dart';

/// Money and date text for one salon, matching the web (apps/web/src/lib/format.ts). Money arrives as integer minor
/// units; `currencyMinor` (1 / 100 / 1000) sets the decimals. Days are the server's YYYY-MM-DD.
class Fmt {
  Fmt(SalonSettings s)
      : currency = s.currency,
        minor = s.currencyMinor,
        digits = math.max(0, (math.log(s.currencyMinor) / math.ln10).round()),
        _tz = _location(s.timezone) {
    final loc = _locale(s.locale);
    _whole = NumberFormat.decimalPattern(loc)
      ..minimumFractionDigits = 0
      ..maximumFractionDigits = digits;
    _frac = NumberFormat.decimalPattern(loc)
      ..minimumFractionDigits = digits
      ..maximumFractionDigits = digits;
  }

  final String currency;
  final int minor, digits;
  late final NumberFormat _whole, _frac;

  /// The salon's time zone, so times read the same as on the web and the bill link (null: the phone's own).
  final tz.Location? _tz;

  static bool _tzReady = false;
  static tz.Location? _location(String name) {
    if (!_tzReady) {
      tzdata.initializeTimeZones();
      _tzReady = true;
    }
    try {
      return tz.getLocation(name);
    } catch (_) {
      return null;
    }
  }

  DateTime _at(int ms) => _tz == null ? DateTime.fromMillisecondsSinceEpoch(ms) : tz.TZDateTime.fromMillisecondsSinceEpoch(_tz, ms);

  static const maxMajor = 1000000;

  static String _locale(String l) {
    final tag = l.replaceAll('-', '_');
    return Intl.verifiedLocale(tag, NumberFormat.localeExists, onFailure: (_) => 'en_GB')!;
  }

  /// 2500 → "AED 25", 2550 → "AED 25.50".
  String money(int minorUnits) {
    final body = minorUnits % minor == 0 ? _whole.format(minorUnits ~/ minor) : _frac.format(minorUnits / minor);
    return currency.isEmpty ? body : '$currency $body';
  }

  /// Bare number for dense rows: 2550 → "25.5"; 0 → "–" when [dash].
  String num(int minorUnits, {bool dash = false}) => dash && minorUnits == 0 ? '–' : _whole.format(minorUnits / minor);

  /// A field value from minor units: 2550 → "25.5".
  String toInput(int minorUnits) {
    final v = minorUnits / minor;
    return v == v.roundToDouble() ? v.round().toString() : v.toString();
  }

  /// Typed major units → minor units; null when not a positive amount within the currency's decimals and the API's cap.
  int? fromInput(String text) {
    final t = text.trim();
    if (!RegExp(r'^\d+(\.\d+)?$').hasMatch(t)) return null;
    final dot = t.indexOf('.');
    if (dot >= 0 && t.length - dot - 1 > digits) return null;
    final v = double.parse(t);
    if (v <= 0 || v > maxMajor) return null;
    return (v * minor).round();
  }

  static DateTime _day(String ymd) => DateTime.parse('${ymd}T00:00:00');

  /// "Wed 21 Oct".
  String dayLabel(String ymd) => DateFormat('EEE d MMM', 'en_US').format(_day(ymd));

  /// "21 Oct 2026".
  String dateLabel(String ymd) => DateFormat('d MMM y', 'en_US').format(_day(ymd));

  /// "October 2026" from "2026-10".
  String monthLabel(String ym) => DateFormat('MMMM y', 'en_US').format(_day('$ym-01'));

  /// "14:05" in the salon's time zone.
  String time(int ms) => DateFormat('HH:mm', 'en_US').format(_at(ms));

  /// "7 Nov 2026, 22:03" in the salon's time zone (web: dateTimeLabel).
  String dateTime(int ms) => DateFormat('d MMM y, HH:mm', 'en_US').format(_at(ms));

  /// "050 123 4567" for a local 05XXXXXXXX number; anything else unchanged.
  String phone(String p) =>
      RegExp(r'^05\d{8}$').hasMatch(p) ? '${p.substring(0, 3)} ${p.substring(3, 6)} ${p.substring(6)}' : p;
}

final _salon = Expando<SalonSettings>();
final _fmt = Expando<Fmt>();

/// The signed-in salon's settings and formatter, parsed once per /api/me answer.
extension MeFormat on Me {
  SalonSettings get salon => _salon[this] ??= SalonSettings.fromJson(settings);
  Fmt get fmt => _fmt[this] ??= Fmt(salon);
}
