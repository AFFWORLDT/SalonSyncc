import 'package:flutter/material.dart';

import 'motion.dart';

/// A number that counts up to [value] when it first shows or changes (instant with reduce-motion).
class CountUp extends StatelessWidget {
  const CountUp({super.key, required this.value, required this.format, this.style});
  final int value;
  final String Function(int) format;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) => TweenAnimationBuilder<double>(
        tween: Tween(begin: 0, end: value.toDouble()),
        duration: skDuration(context, 350),
        curve: Curves.easeOutCubic,
        builder: (_, v, __) => Text(format(v.round()), style: style),
      );
}
