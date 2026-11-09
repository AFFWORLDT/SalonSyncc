import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// The splash's warm cream (the same colour as the system splash, so nothing flashes between them).
const kSplashCream = Color(0xFFF3ECE1);
const _floor = Color(0xFFEEE4D7);

/// The SalonKit splash: the salon artwork with the logo, then a real spinner and "Getting everything ready…".
/// The art covers the screen above the spinner; the floor colour carries on under it.
class SplashArt extends StatelessWidget {
  const SplashArt({super.key, this.message = 'Getting everything ready…'});
  final String message;

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.paddingOf(context).bottom;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark.copyWith(statusBarColor: Colors.transparent),
      child: ColoredBox(
        color: _floor,
        child: Stack(fit: StackFit.expand, children: [
          // The art fills the screen above the spinner (trimmed at the sides on narrow phones), fading into the floor.
          Positioned(
            left: 0,
            right: 0,
            top: 0,
            bottom: 112 + bottom,
            child: ShaderMask(
              blendMode: BlendMode.dstIn,
              shaderCallback: (r) => const LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Color(0xFF000000), Color(0xFF000000), Color(0x00000000)],
                stops: [0, 0.9, 1],
              ).createShader(r),
              child: Image.asset(
                'assets/brand/splash.jpg',
                fit: BoxFit.cover,
                alignment: Alignment.topCenter,
                gaplessPlayback: true,
                filterQuality: FilterQuality.medium,
                // Fade in over the cream if the first frame comes before the picture is decoded.
                frameBuilder: (_, child, frame, sync) => sync
                    ? child
                    : AnimatedOpacity(opacity: frame == null ? 0 : 1, duration: const Duration(milliseconds: 120), child: child),
              ),
            ),
          ),
          Positioned(
            left: 24,
            right: 24,
            bottom: 28 + bottom,
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const SizedBox(
                width: 34,
                height: 34,
                child: CircularProgressIndicator(strokeWidth: 3.5, strokeCap: StrokeCap.round, color: Color(0xFF0E5A48), backgroundColor: Color(0xFFCBD8CF)),
              ),
              const SizedBox(height: 14),
              Text(
                message,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Color(0xFF173A30), decoration: TextDecoration.none),
              ),
            ]),
          ),
        ]),
      ),
    );
  }
}

/// Over the app on a cold start: the splash art for a short moment, then a quick fade. Never blocks taps, and goes
/// straight away with reduced motion.
class SplashOverlay extends StatefulWidget {
  const SplashOverlay({super.key, required this.child, this.hold = const Duration(milliseconds: 550)});
  final Widget child;
  final Duration hold;

  @override
  State<SplashOverlay> createState() => _SplashOverlayState();
}

class _SplashOverlayState extends State<SplashOverlay> {
  static bool _shown = false;
  bool _show = !_shown, _gone = _shown;

  @override
  void initState() {
    super.initState();
    if (_show) {
      _shown = true;
      Future<void>.delayed(widget.hold, () => mounted ? setState(() => _show = false) : null);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_gone || (MediaQuery.maybeDisableAnimationsOf(context) ?? false)) return widget.child;
    return Stack(fit: StackFit.expand, children: [
      widget.child,
      IgnorePointer(
        child: AnimatedOpacity(
          opacity: _show ? 1 : 0,
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOut,
          onEnd: () => setState(() => _gone = true),
          child: const SplashArt(),
        ),
      ),
    ]);
  }
}
