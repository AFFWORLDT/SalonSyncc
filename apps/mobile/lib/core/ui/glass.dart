import 'dart:ui';

import 'package:flutter/material.dart';

import '../theme/tokens.dart';

/// The web's glass card: a blurred, see-through surface with a hairline border. Repeated rows in a list pass
/// `blur: false` (same look, a little more opaque): one blur layer per row stutters on low-end phones.
class SkGlass extends StatelessWidget {
  const SkGlass({super.key, required this.child, this.padding = const EdgeInsets.all(20), this.radius = 24, this.blur = true});

  final Widget child;
  final EdgeInsetsGeometry padding;
  final double radius;
  final bool blur;

  @override
  Widget build(BuildContext context) {
    final b = Theme.of(context).brightness;
    final p = SkTokens.of(b);
    final r = BorderRadius.circular(radius);
    final card = DecoratedBox(
      decoration: BoxDecoration(
        color: p.card.withValues(alpha: blur ? p.cardAlpha : (p.cardAlpha + 0.2).clamp(0, 1)),
        borderRadius: r,
        border: Border.all(color: Colors.white.withValues(alpha: b == Brightness.dark ? 0.12 : 0.25)),
      ),
      child: Padding(padding: padding, child: child),
    );
    if (!blur) return card;
    return ClipRRect(borderRadius: r, child: BackdropFilter(filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18), child: card));
  }
}
