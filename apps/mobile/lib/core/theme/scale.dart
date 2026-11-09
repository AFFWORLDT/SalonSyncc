import 'package:flutter/material.dart';

import 'tokens.dart';

/// Spacing steps. Screens use these instead of raw numbers, so gaps line up everywhere.
abstract final class SkSpace {
  static const xs = 4.0, sm = 8.0, md = 12.0, lg = 16.0, xl = 20.0, xxl = 24.0, xxxl = 32.0;

  /// The side margin of every screen.
  static const gutter = 16.0;
}

/// A scrolling page's padding: the side margins, and room at the bottom for whatever floats there (the glass tab bar,
/// or the phone's gesture bar on pushed screens), so the last row is never hidden.
EdgeInsets skPagePadding(BuildContext context, {double top = SkSpace.sm}) =>
    EdgeInsets.fromLTRB(SkSpace.gutter, top, SkSpace.gutter, SkSpace.xxxl + MediaQuery.paddingOf(context).bottom);

/// Corner radii: small controls, fields and tiles, cards, sheets.
abstract final class SkRadius {
  static const sm = 10.0, md = 14.0, lg = 18.0, xl = 24.0;
}

/// The current theme's palette, for the colours Material has no slot for (success, warning).
SkPalette skPalette(BuildContext context) => SkTokens.of(Theme.of(context).brightness);
