import 'dart:ui';

import 'package:flutter/material.dart';

import '../theme/tokens.dart';

/// The web's glass card: a blurred, see-through surface with a hairline border.
class SkGlass extends StatelessWidget {
  const SkGlass({super.key, required this.child, this.padding = const EdgeInsets.all(20), this.radius = 24});

  final Widget child;
  final EdgeInsetsGeometry padding;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final b = Theme.of(context).brightness;
    final p = SkTokens.of(b);
    final r = BorderRadius.circular(radius);
    return ClipRRect(
      borderRadius: r,
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: p.card.withValues(alpha: p.cardAlpha),
            borderRadius: r,
            border: Border.all(color: Colors.white.withValues(alpha: b == Brightness.dark ? 0.12 : 0.25)),
          ),
          child: Padding(padding: padding, child: child),
        ),
      ),
    );
  }
}
