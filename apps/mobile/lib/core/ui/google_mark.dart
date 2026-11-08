import 'dart:math' as math;

import 'package:flutter/material.dart';

/// Google's four-colour "G", drawn (no image asset), for "Continue with Google".
class GoogleMark extends StatelessWidget {
  const GoogleMark({super.key, this.size = 20});
  final double size;

  @override
  Widget build(BuildContext context) => SizedBox.square(dimension: size, child: CustomPaint(painter: _GPainter()));
}

class _GPainter extends CustomPainter {
  static const _blue = Color(0xFF4285F4), _green = Color(0xFF34A853), _yellow = Color(0xFFFBBC05), _red = Color(0xFFEA4335);

  @override
  void paint(Canvas canvas, Size s) {
    final stroke = s.width * 0.22;
    final c = s.center(Offset.zero);
    final r = (s.width - stroke) / 2;
    final rect = Rect.fromCircle(center: c, radius: r);
    double rad(double deg) => deg * math.pi / 180;
    Paint p(Color col) => Paint()
      ..color = col
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke;
    // Clockwise from 3 o'clock: blue (right, down), green (bottom), yellow (left), red (top); open at the upper right.
    canvas.drawArc(rect, rad(0), rad(48), false, p(_blue));
    canvas.drawArc(rect, rad(45), rad(97), false, p(_green));
    canvas.drawArc(rect, rad(140), rad(82), false, p(_yellow));
    canvas.drawArc(rect, rad(220), rad(97), false, p(_red));
    // The bar: from the middle to the right edge, at the centre line.
    canvas.drawRect(Rect.fromLTRB(c.dx - stroke * 0.05, c.dy - stroke / 2, s.width, c.dy + stroke / 2), Paint()..color = _blue);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
