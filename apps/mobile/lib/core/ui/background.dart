import 'package:flutter/material.dart';

import '../theme/tokens.dart';

/// The web's background: the theme colour with soft glows in the corners.
class SkBackground extends StatelessWidget {
  const SkBackground({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final p = SkTokens.of(Theme.of(context).brightness);
    RadialGradient glow(Alignment at, Color c, double a) =>
        RadialGradient(center: at, radius: 0.9, colors: [c.withValues(alpha: a), c.withValues(alpha: 0)]);
    return DecoratedBox(
      decoration: BoxDecoration(color: p.background),
      child: Stack(fit: StackFit.expand, children: [
        DecoratedBox(decoration: BoxDecoration(gradient: glow(const Alignment(-0.85, -0.9), p.mesh[0], 0.30))),
        DecoratedBox(decoration: BoxDecoration(gradient: glow(const Alignment(0.85, -0.8), p.mesh[1], 0.26))),
        DecoratedBox(decoration: BoxDecoration(gradient: glow(const Alignment(0.45, 0.95), p.mesh[2], 0.22))),
        child,
      ]),
    );
  }
}
