import 'package:flutter/material.dart';

import 'haptics.dart';

/// The transitions.dev "Toggle" motion (same tokens as the web's globals.css .t-toggle): the thumb travels with a
/// two-step overshoot — past the end at 55 %, back at 80 %, settled at 100 % — over 350 ms with
/// cubic-bezier(0.34, 1.35, 0.64, 1) between keyframes; the track colour flips at once. Nothing plays on first build.
class SkToggle extends StatefulWidget {
  const SkToggle({super.key, required this.value, required this.onChanged});
  final bool value;
  final ValueChanged<bool>? onChanged;

  static const duration = Duration(milliseconds: 350);
  static const ease = Cubic(0.34, 1.35, 0.64, 1);
  static const width = 48.0, height = 28.0, thumb = 22.0, pad = 3.0;
  static const travel = width - thumb - pad * 2;
  static const overshoot = 1.5, settle = 0.0;

  @override
  State<SkToggle> createState() => _SkToggleState();
}

class _SkToggleState extends State<SkToggle> with SingleTickerProviderStateMixin {
  late final AnimationController _c;
  late Animation<double> _x = AlwaysStoppedAnimation(widget.value ? SkToggle.travel : 0);

  @override
  void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: SkToggle.duration, value: 1);
  }

  static Animation<double> _keyframes(AnimationController c, bool on) {
    const t = SkToggle.travel;
    final (from, past, back, end) = on
        ? (0.0, t + SkToggle.overshoot, t - SkToggle.settle, t)
        : (t, -SkToggle.overshoot, SkToggle.settle, 0.0);
    TweenSequenceItem<double> step(double a, double b, double weight) =>
        TweenSequenceItem(tween: Tween(begin: a, end: b).chain(CurveTween(curve: SkToggle.ease)), weight: weight);
    return TweenSequence([step(from, past, 55), step(past, back, 25), step(back, end, 20)]).animate(c);
  }

  @override
  void didUpdateWidget(SkToggle old) {
    super.didUpdateWidget(old);
    if (old.value == widget.value) return;
    if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) {
      _x = AlwaysStoppedAnimation(widget.value ? SkToggle.travel : 0);
      return;
    }
    _x = _keyframes(_c, widget.value);
    _c.forward(from: 0);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final on = widget.value, enabled = widget.onChanged != null;
    return Semantics(
      toggled: on,
      enabled: enabled,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: !enabled
            ? null
            : () {
                Haptic.select();
                widget.onChanged!(!on);
              },
        child: Opacity(
          opacity: enabled ? 1 : 0.5,
          // A 48 px tall hit area around the 28 px track.
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Container(
              width: SkToggle.width,
              height: SkToggle.height,
              padding: const EdgeInsets.all(SkToggle.pad),
              decoration: BoxDecoration(
                color: on ? cs.primary : cs.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(SkToggle.height),
                border: Border.all(color: on ? cs.primary : cs.outlineVariant, width: 1),
              ),
              alignment: Alignment.centerLeft,
              child: AnimatedBuilder(
                animation: _x,
                builder: (_, child) => Transform.translate(offset: Offset(_x.value, 0), child: child),
                child: Container(
                  width: SkToggle.thumb - 2,
                  height: SkToggle.thumb - 2,
                  decoration: BoxDecoration(
                    color: on ? cs.onPrimary : cs.onSurfaceVariant,
                    shape: BoxShape.circle,
                    boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 3, offset: Offset(0, 1))],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A settings row with an [SkToggle]: title, optional subtitle, the whole row tappable (replaces SwitchListTile).
class SkSwitchTile extends StatelessWidget {
  const SkSwitchTile({super.key, required this.title, this.subtitle, this.secondary, required this.value, required this.onChanged, this.contentPadding});
  final Widget title;
  final Widget? subtitle, secondary;
  final bool value;
  final ValueChanged<bool>? onChanged;
  final EdgeInsetsGeometry? contentPadding;

  @override
  Widget build(BuildContext context) => ListTile(
        contentPadding: contentPadding,
        leading: secondary,
        title: title,
        subtitle: subtitle,
        enabled: onChanged != null,
        onTap: onChanged == null
            ? null
            : () {
                Haptic.select();
                onChanged!(!value);
              },
        trailing: SkToggle(value: value, onChanged: onChanged),
      );
}
