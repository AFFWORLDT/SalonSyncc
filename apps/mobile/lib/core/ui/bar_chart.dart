import 'package:flutter/material.dart';

import 'motion.dart';

/// Two series as paired bars (sales, profit) — drawn by hand to keep the app free of a chart package.
class SkBarChart extends StatelessWidget {
  const SkBarChart({super.key, required this.a, required this.b, this.height = 140});
  final List<int> a, b;
  final double height;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: skDuration(context, 350),
      curve: Curves.easeOutCubic,
      builder: (_, t, _) => CustomPaint(
        size: Size(double.infinity, height),
        painter: _Bars(a, b, t, cs.primary, cs.tertiary, cs.error, cs.outlineVariant),
      ),
    );
  }
}

class _Bars extends CustomPainter {
  _Bars(this.a, this.b, this.t, this.ca, this.cb, this.neg, this.axis);
  final List<int> a, b;
  final double t;
  final Color ca, cb, neg, axis;

  @override
  void paint(Canvas canvas, Size size) {
    if (a.isEmpty) return;
    final top = [...a, ...b].fold<int>(1, (m, v) => v.abs() > m ? v.abs() : m).toDouble();
    final hasNeg = b.any((v) => v < 0);
    final zero = hasNeg ? size.height * 0.7 : size.height;
    final slot = size.width / a.length;
    final w = (slot * 0.36).clamp(1.5, 14.0);
    canvas.drawLine(Offset(0, zero), Offset(size.width, zero), Paint()..color = axis);
    for (var i = 0; i < a.length; i++) {
      final x = i * slot + slot / 2;
      void bar(double dx, int v, Color c) {
        final h = (v / top) * (v >= 0 ? zero : size.height - zero) * t;
        final r = Rect.fromLTRB(x + dx - w / 2, zero - (v >= 0 ? h : 0), x + dx + w / 2, zero + (v < 0 ? -h : 0));
        canvas.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(3)), Paint()..color = c);
      }

      bar(-w * 0.55, a[i], ca);
      if (i < b.length) bar(w * 0.55, b[i], b[i] < 0 ? neg : cb);
    }
  }

  @override
  bool shouldRepaint(_Bars o) => o.t != t || o.a != a || o.b != b;
}
