import 'package:flutter/services.dart';

/// Small vibrations on taps and results, so the phone "feels" the till (same kinds as the web's lib/haptics.ts).
/// They follow the phone's own touch-feedback setting.
abstract final class Haptic {
  /// A key or a button press.
  static void tap() => HapticFeedback.selectionClick();

  /// Picking something: a barber, a service, Cash or Card.
  static void select() => HapticFeedback.lightImpact();

  /// A bill saved.
  static Future<void> success() async {
    await HapticFeedback.mediumImpact();
    await Future<void>.delayed(const Duration(milliseconds: 90));
    await HapticFeedback.lightImpact();
  }

  /// Delete, and other things to think twice about.
  static void warning() => HapticFeedback.mediumImpact();

  /// A save that failed.
  static Future<void> error() async {
    await HapticFeedback.heavyImpact();
    await Future<void>.delayed(const Duration(milliseconds: 110));
    await HapticFeedback.heavyImpact();
  }
}
