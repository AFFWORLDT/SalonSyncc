import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../config.dart';
import '../theme/scale.dart';

/// The wide banner behind a person's photo (LinkedIn-style): their uploaded image, or — until they add one — soft
/// brand-coloured light drifting slowly behind them. The drift stops when the phone asks for less motion.
class SkProfileBanner extends StatelessWidget {
  const SkProfileBanner({super.key, required this.slug, this.url, required this.height});
  final String slug;
  final String? url;
  final double height;

  @override
  Widget build(BuildContext context) {
    final drift = _Drift(height: height);
    if (url == null) return drift;
    return CachedNetworkImage(
      imageUrl: absolute(salonBase(slug), url!).toString(),
      height: height,
      width: double.infinity,
      fit: BoxFit.cover,
      fadeInDuration: const Duration(milliseconds: 150),
      placeholder: (_, _) => drift,
      errorWidget: (_, _, _) => drift,
    );
  }
}

class _Drift extends StatefulWidget {
  const _Drift({required this.height});
  final double height;

  @override
  State<_Drift> createState() => _DriftState();
}

class _DriftState extends State<_Drift> with SingleTickerProviderStateMixin {
  late final AnimationController _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: const Duration(seconds: 14));
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final still = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    if (still) {
      _c.stop();
    } else if (!_c.isAnimating) {
      _c.repeat();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = skPalette(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    return SizedBox(
      height: widget.height,
      width: double.infinity,
      child: RepaintBoundary(
        child: AnimatedBuilder(
          animation: _c,
          builder: (_, _) => CustomPaint(painter: _DriftPainter(t: _c.value, colors: p.mesh, base: dark ? const Color(0xFF0B1513) : const Color(0xFFE9E2D3))),
        ),
      ),
    );
  }
}

class _DriftPainter extends CustomPainter {
  _DriftPainter({required this.t, required this.colors, required this.base});
  final double t;
  final List<Color> colors;
  final Color base;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = base);
    final a = t * 2 * math.pi;
    // Three soft lights on slow, different orbits.
    final lights = [
      (Offset(size.width * (0.22 + 0.10 * math.cos(a)), size.height * (0.35 + 0.25 * math.sin(a))), colors[0], 0.95),
      (Offset(size.width * (0.70 + 0.12 * math.cos(a * 2 + 1)), size.height * (0.55 + 0.30 * math.sin(a + 2))), colors[1], 0.85),
      (Offset(size.width * (0.48 + 0.18 * math.sin(a + 4)), size.height * (0.90 + 0.15 * math.cos(a * 2))), colors[2], 1.1),
    ];
    for (final (o, c, r) in lights) {
      final radius = size.width * 0.42 * r;
      canvas.drawCircle(
        o,
        radius,
        Paint()..shader = RadialGradient(colors: [c.withValues(alpha: 0.75), c.withValues(alpha: 0)]).createShader(Rect.fromCircle(center: o, radius: radius)),
      );
    }
    // A fine diagonal sheen sweeping across.
    final x = size.width * (t * 1.6 - 0.3);
    canvas.drawRect(
      Offset.zero & size,
      Paint()
        ..shader = LinearGradient(
          colors: [Colors.white.withValues(alpha: 0), Colors.white.withValues(alpha: 0.10), Colors.white.withValues(alpha: 0)],
          stops: const [0, 0.5, 1],
        ).createShader(Rect.fromLTWH(x - size.width * 0.25, 0, size.width * 0.5, size.height)),
    );
  }

  @override
  bool shouldRepaint(_DriftPainter old) => old.t != t || old.base != base;
}
