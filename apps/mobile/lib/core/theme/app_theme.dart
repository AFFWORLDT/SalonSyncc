import 'package:flutter/material.dart';

import 'tokens.dart';

const kTextFont = 'GoogleSansFlex';
const kMonoFont = 'GoogleSansCode';

abstract final class SkText {
  /// Numbers, ids and amounts: the text face with even-width figures, so columns line up (the printed bill keeps
  /// its own typewriter face).
  static const mono = TextStyle(fontFamily: kTextFont, fontFeatures: [FontFeature.tabularFigures()]);
}

ThemeData buildTheme(SkPalette p, Brightness b) {
  final scheme = ColorScheme(
    brightness: b,
    primary: p.primary,
    onPrimary: p.primaryForeground,
    secondary: p.muted,
    onSecondary: p.foreground,
    error: p.destructive,
    onError: Colors.white,
    surface: p.card,
    onSurface: p.foreground,
    onSurfaceVariant: p.mutedForeground,
    outline: p.border,
    outlineVariant: p.border,
    surfaceContainerHighest: p.muted,
  );
  final base = ThemeData(brightness: b, colorScheme: scheme, fontFamily: kTextFont, useMaterial3: true);
  final radius = BorderRadius.circular(14);
  return base.copyWith(
    scaffoldBackgroundColor: p.background,
    textTheme: base.textTheme.apply(fontFamily: kTextFont, bodyColor: p.foreground, displayColor: p.foreground),
    appBarTheme: AppBarTheme(backgroundColor: Colors.transparent, elevation: 0, foregroundColor: p.foreground, centerTitle: false),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: p.card.withValues(alpha: 0.7),
      border: OutlineInputBorder(borderRadius: radius, borderSide: BorderSide(color: p.border)),
      enabledBorder: OutlineInputBorder(borderRadius: radius, borderSide: BorderSide(color: p.border)),
      focusedBorder: OutlineInputBorder(borderRadius: radius, borderSide: BorderSide(color: p.primary, width: 1.6)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        // Not full width: buttons sit in rows too. Screens that want a wide button stretch it or say so.
        minimumSize: const Size(64, 50),
        shape: const StadiumBorder(),
        textStyle: const TextStyle(fontFamily: kTextFont, fontWeight: FontWeight.w600, fontSize: 16),
      ),
    ),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
    pageTransitionsTheme: const PageTransitionsTheme(builders: {
      TargetPlatform.android: FadeForwardsPageTransitionsBuilder(),
      TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
    }),
  );
}
