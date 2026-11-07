import 'dart:async';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// The SalonKit logo animation (assets/brand/intro.gif) on black, once per cold start, over the app while it starts;
/// then it fades away. The native splash is plain black too, so the hand-over doesn't flash. Plays the GIF frames
/// once and holds the last (Image.asset would loop). Never blocks taps, and is skipped with reduced motion.
class IntroOverlay extends StatefulWidget {
  const IntroOverlay({super.key, required this.child, this.asset = 'assets/brand/intro.gif'});
  final Widget child;
  final String asset;

  @override
  State<IntroOverlay> createState() => _IntroOverlayState();
}

class _IntroOverlayState extends State<IntroOverlay> {
  static bool _played = false;

  ui.Image? _frame;
  bool _show = !_played, _gone = _played;
  ui.Codec? _codec;

  @override
  void initState() {
    super.initState();
    if (_show) {
      _played = true;
      _play();
    }
  }

  Future<void> _play() async {
    try {
      final data = await rootBundle.load(widget.asset);
      final codec = _codec = await ui.instantiateImageCodec(data.buffer.asUint8List());
      for (var i = 0; i < codec.frameCount && mounted; i++) {
        final f = await codec.getNextFrame();
        if (!mounted) return f.image.dispose();
        final old = _frame;
        setState(() => _frame = f.image);
        old?.dispose();
        await Future<void>.delayed(f.duration == Duration.zero ? const Duration(milliseconds: 100) : f.duration);
      }
      await Future<void>.delayed(const Duration(milliseconds: 450)); // hold the finished logo a moment
    } catch (_) {
      // No animation is fine; the app is underneath.
    }
    if (mounted) setState(() => _show = false);
  }

  @override
  void dispose() {
    _frame?.dispose();
    _codec?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_gone || (MediaQuery.maybeDisableAnimationsOf(context) ?? false)) return widget.child;
    return Stack(fit: StackFit.expand, children: [
      widget.child,
      IgnorePointer(
        child: AnimatedOpacity(
          opacity: _show ? 1 : 0,
          duration: const Duration(milliseconds: 350),
          curve: Curves.easeOut,
          onEnd: () => setState(() => _gone = true),
          child: ColoredBox(
            color: Colors.black,
            child: Center(
              child: SizedBox.square(
                dimension: 260,
                child: _frame == null ? null : RawImage(image: _frame, fit: BoxFit.contain, filterQuality: FilterQuality.medium),
              ),
            ),
          ),
        ),
      ),
    ]);
  }
}
