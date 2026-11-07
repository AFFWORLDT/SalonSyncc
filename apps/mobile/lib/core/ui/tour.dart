import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../theme/scale.dart';
import 'haptics.dart';

/// The first-login walkthrough (same steps as the web's lib/tour.ts): the screen dims, a spotlight opens on one
/// part of the app and a card says what it is for. Steps whose target isn't on screen are skipped.

/// Parts of the app a tour step can point at, by name ("profile", "new-sale", "tab-sheet", "setup").
final _targets = <String, GlobalKey>{};

/// Marks [child] as the tour target [id].
Widget tourTarget(String id, Widget child) => KeyedSubtree(key: _targets.putIfAbsent(id, () => GlobalKey(debugLabel: 'tour-$id')), child: child);

class TourStep {
  const TourStep({required this.title, required this.text, this.target});
  final String title, text;
  final String? target;
}

/// Admins: set up the salon, services, team, then ring up a bill. Barbers: a sale and their history.
List<TourStep> tourSteps({required String salonName, required bool admin}) {
  final welcome = TourStep(
    title: 'Welcome to ${salonName.isEmpty ? 'your salon' : salonName} 👋',
    text: "Here's a 1-minute tour of where everything lives. You can replay it any time from your profile.",
  );
  if (!admin) {
    return [
      welcome,
      const TourStep(target: 'new-sale-today', title: 'Ring up a sale', text: 'Tap here after each customer: pick the services and how they paid. The bill is ready to share.'),
      const TourStep(target: 'profile', title: 'Your profile', text: 'Your history, your photo and your settings live under your photo.'),
    ];
  }
  return [
    welcome,
    const TourStep(
      target: 'profile',
      title: '1. Your salon details',
      text: 'Tap your photo, then ⚙ Settings: upload your logo, add your address, phone and TRN, and switch on VAT. They print on every bill.',
    ),
    const TourStep(
      target: 'profile',
      title: '2. Services and 3. Your team',
      text: 'Also under your photo: Services for your price list, Staff for your barbers with their commission and their own login.',
    ),
    const TourStep(target: 'new-sale', title: '4. Ring up a sale', text: 'Pick the barber and services, and the bill is ready. Commission and the daily sheet update by themselves.'),
    const TourStep(target: 'tab-sheet', title: '5. Daily sheet', text: "Every day's sales, expenses, commission and profit per barber, with Excel export."),
    const TourStep(target: 'setup', title: 'Your checklist', text: "Tick these off to get fully set up. Tap any line to go there. It disappears when you're done."),
  ];
}

String _doneKey(String slug, int userId) => 'sk.tour.done.$slug.$userId';

/// Plays the tour once per person per salon (or again when [force]).
Future<void> maybeShowTour(BuildContext context, {required String slug, required int userId, required List<TourStep> steps, bool force = false}) async {
  SharedPreferences? prefs;
  try {
    prefs = await SharedPreferences.getInstance();
    if (!force && (prefs.getBool(_doneKey(slug, userId)) ?? false)) return;
  } catch (_) {}
  if (!context.mounted) return;
  await Navigator.of(context, rootNavigator: true).push(PageRouteBuilder<void>(
    opaque: false,
    barrierDismissible: false,
    transitionDuration: const Duration(milliseconds: 200),
    reverseTransitionDuration: const Duration(milliseconds: 160),
    pageBuilder: (_, _, _) => _Tour(steps: steps),
    transitionsBuilder: (_, a, _, child) => FadeTransition(opacity: a, child: child),
  ));
  try {
    await prefs?.setBool(_doneKey(slug, userId), true);
  } catch (_) {}
}

class _Tour extends StatefulWidget {
  const _Tour({required this.steps});
  final List<TourStep> steps;

  @override
  State<_Tour> createState() => _TourState();
}

class _TourState extends State<_Tour> {
  late final List<TourStep> _steps = widget.steps.where((s) => s.target == null || _rectOf(s.target!) != null).toList();
  int _i = 0;

  static Rect? _rectOf(String id) {
    final ctx = _targets[id]?.currentContext;
    final box = ctx?.findRenderObject();
    if (box is! RenderBox || !box.attached || !box.hasSize) return null;
    final r = box.localToGlobal(Offset.zero) & box.size;
    return r.isEmpty ? null : r;
  }

  void _next() {
    Haptic.tap();
    if (_i >= _steps.length - 1) return Navigator.of(context).pop();
    setState(() => _i++);
  }

  @override
  Widget build(BuildContext context) {
    if (_steps.isEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) => Navigator.of(context).maybePop());
      return const SizedBox.shrink();
    }
    final step = _steps[_i];
    final hole = step.target == null ? null : _rectOf(step.target!)?.inflate(6);
    final size = MediaQuery.sizeOf(context);
    final t = Theme.of(context).textTheme, cs = Theme.of(context).colorScheme;
    // The card sits below the spotlight when it is in the top half, above it otherwise; centred with no spotlight.
    final below = hole != null && hole.center.dy < size.height / 2;
    final card = Material(
      color: cs.surface,
      elevation: 8,
      borderRadius: BorderRadius.circular(SkRadius.lg),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 16, 10, 8),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(step.title, style: t.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          Padding(padding: const EdgeInsets.only(right: 8), child: Text(step.text, style: t.bodyMedium?.copyWith(color: cs.onSurfaceVariant, height: 1.35))),
          const SizedBox(height: 6),
          Row(children: [
            Text('${_i + 1} of ${_steps.length}', style: t.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
            const Spacer(),
            if (_i < _steps.length - 1) TextButton(key: const ValueKey('tour-skip'), onPressed: () => Navigator.of(context).pop(), child: const Text('Skip')),
            FilledButton(key: const ValueKey('tour-next'), onPressed: _next, child: Text(_i == _steps.length - 1 ? 'Done' : (_i == 0 ? "Let's go" : 'Next'))),
          ]),
        ]),
      ),
    );
    return PopScope(
      canPop: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: _next,
        child: Stack(children: [
          Positioned.fill(
            child: TweenAnimationBuilder<Rect?>(
              tween: RectTween(end: hole ?? Rect.fromCircle(center: size.center(Offset.zero), radius: 0)),
              duration: const Duration(milliseconds: 260),
              curve: Curves.easeOutCubic,
              builder: (_, r, _) => CustomPaint(painter: _Dim(hole: hole == null ? null : r, color: Colors.black.withValues(alpha: 0.62), ring: cs.primary)),
            ),
          ),
          AnimatedPositioned(
            duration: const Duration(milliseconds: 260),
            curve: Curves.easeOutCubic,
            left: 16,
            right: 16,
            top: hole == null ? size.height * 0.32 : (below ? hole.bottom + 14 : null),
            bottom: hole != null && !below ? size.height - hole.top + 14 : null,
            child: GestureDetector(onTap: () {}, child: card),
          ),
        ]),
      ),
    );
  }
}

class _Dim extends CustomPainter {
  _Dim({required this.hole, required this.color, required this.ring});
  final Rect? hole;
  final Color color, ring;

  @override
  void paint(Canvas canvas, Size size) {
    final all = Path()..addRect(Offset.zero & size);
    if (hole == null) {
      canvas.drawPath(all, Paint()..color = color);
      return;
    }
    final r = RRect.fromRectAndRadius(hole!, Radius.circular(hole!.shortestSide / 2 > 28 ? 18 : hole!.shortestSide / 2));
    canvas.drawPath(Path.combine(PathOperation.difference, all, Path()..addRRect(r)), Paint()..color = color);
    canvas.drawRRect(r, Paint()
      ..color = ring
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.5);
  }

  @override
  bool shouldRepaint(_Dim old) => old.hole != hole || old.color != color;
}
