import 'package:flutter/material.dart';

/// The app's page route: the platform's transition, but quicker (220 ms in, 180 ms back instead of 300), so moving
/// between screens feels instant.
class SkRoute<T> extends MaterialPageRoute<T> {
  SkRoute({required super.builder, super.settings, super.fullscreenDialog});

  @override
  Duration get transitionDuration => const Duration(milliseconds: 220);

  @override
  Duration get reverseTransitionDuration => const Duration(milliseconds: 180);
}
