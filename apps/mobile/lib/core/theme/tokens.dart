import 'package:flutter/painting.dart';
import 'package:flutter/services.dart' show Brightness;

/// One theme's colours. Values copied from the web app's palette
/// (apps/web/src/components/theme/theme.ts PALETTE, LIGHT_BRAND, DARK_BRAND), so both look the same.
class SkPalette {
  const SkPalette({
    required this.background,
    required this.foreground,
    required this.card,
    required this.primary,
    required this.primaryForeground,
    required this.muted,
    required this.mutedForeground,
    required this.faint,
    required this.border,
    required this.destructive,
    required this.success,
    required this.warning,
    required this.mesh,
    required this.cardAlpha,
    required this.borderAlpha,
  });

  final Color background, foreground, card, primary, primaryForeground, muted, mutedForeground, faint, border;
  final Color destructive, success, warning;

  /// The background's soft glows (web: LIGHT_MESH / DARK_MESH).
  final List<Color> mesh;

  /// How see-through glass cards and their borders are (web: GLASS).
  final double cardAlpha, borderAlpha;
}

abstract final class SkTokens {
  static const light = SkPalette(
    background: Color(0xFFF6F2E9),
    foreground: Color(0xFF1C1B18),
    card: Color(0xFFFFFDF8),
    primary: Color(0xFF0E5A48),
    primaryForeground: Color(0xFFFFFFFF),
    muted: Color(0xFFECE6D9),
    mutedForeground: Color(0xFF67635B),
    faint: Color(0xFF9A958B),
    border: Color(0xFFE0D9CB),
    destructive: Color(0xFFD92D20),
    success: Color(0xFF14935A),
    warning: Color(0xFFB86E00),
    mesh: [Color(0xFF2A9D88), Color(0xFFB8935A), Color(0xFF1D4A42)],
    cardAlpha: 0.62,
    borderAlpha: 0.55,
  );

  static const dark = SkPalette(
    background: Color(0xFF08110F),
    foreground: Color(0xFFF2F2F2),
    card: Color(0xFF13201C),
    primary: Color(0xFF2A9D88),
    primaryForeground: Color(0xFFFFFFFF),
    muted: Color(0xFF1A2A25),
    mutedForeground: Color(0xFF8C8C8C),
    faint: Color(0xFF5C5C5C),
    border: Color(0xFF26382F),
    destructive: Color(0xFFFF5A5F),
    success: Color(0xFF2FD27A),
    warning: Color(0xFFFFB020),
    mesh: [Color(0xFF1F7A6A), Color(0xFF2A9D88), Color(0xFF0F2E29)],
    cardAlpha: 0.5,
    borderAlpha: 0.5,
  );

  static SkPalette of(Brightness b) => b == Brightness.dark ? dark : light;
}
