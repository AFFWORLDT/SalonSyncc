import 'package:flutter/material.dart';

import '../theme/scale.dart';
import 'haptics.dart';

/// A filter as a compact pill (Groww-style): muted while it shows everything, dark once something is picked. An
/// optional ✕ clears it ([onClear], with [clearTooltip]). The pill looks 36 px tall but takes taps over 48 px (the
/// accessibility minimum), the ✕ too, and shrinks a touch while pressed.
class SkFilterPill extends StatefulWidget {
  const SkFilterPill({super.key, required this.label, required this.onTap, this.icon, this.active = false, this.onClear, this.clearTooltip, this.dropdown = false});
  final String label;
  final VoidCallback onTap;
  final IconData? icon;
  final bool active, dropdown;
  final VoidCallback? onClear;
  final String? clearTooltip;

  @override
  State<SkFilterPill> createState() => _SkFilterPillState();
}

class _SkFilterPillState extends State<SkFilterPill> {
  bool _down = false;

  Widget _hit({required String label, required VoidCallback onTap, required Widget child}) => Semantics(
        button: true,
        label: label,
        excludeSemantics: true,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTapDown: (_) => setState(() => _down = true),
          onTapCancel: () => setState(() => _down = false),
          onTapUp: (_) => setState(() => _down = false),
          onTap: () {
            Haptic.tap();
            onTap();
          },
          child: SizedBox(height: 48, child: child),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final w = widget;
    final fg = w.active ? cs.surface : cs.onSurface;
    final clear = w.onClear != null && w.active;
    final main = Row(mainAxisSize: MainAxisSize.min, children: [
      const SizedBox(width: 12),
      if (w.icon != null) ...[Icon(w.icon, size: 16, color: fg), const SizedBox(width: 6)],
      Flexible(child: Text(w.label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: fg))),
      if (!clear && w.dropdown)
        Padding(padding: const EdgeInsets.only(left: 2, right: 8), child: Icon(Icons.keyboard_arrow_down_rounded, size: 18, color: fg))
      else if (!clear)
        const SizedBox(width: 12),
    ]);
    return AnimatedScale(
      scale: _down ? 0.96 : 1,
      duration: const Duration(milliseconds: 90),
      child: Stack(children: [
        // The pill itself: 36 px, centred in the 48 px touch area.
        Positioned.fill(
          top: 6,
          bottom: 6,
          child: DecoratedBox(
            decoration: ShapeDecoration(
              color: w.active ? cs.onSurface : cs.surfaceContainerHighest.withValues(alpha: 0.6),
              shape: StadiumBorder(side: BorderSide(color: w.active ? cs.onSurface : cs.outlineVariant.withValues(alpha: 0.7))),
            ),
          ),
        ),
        Row(mainAxisSize: MainAxisSize.min, children: [
          Flexible(child: _hit(label: w.label, onTap: w.onTap, child: main)),
          if (clear)
            Tooltip(
              message: w.clearTooltip ?? 'Clear',
              child: _hit(
                label: w.clearTooltip ?? 'Clear',
                onTap: w.onClear!,
                child: SizedBox(width: 48, child: Icon(Icons.close_rounded, size: 16, color: fg)),
              ),
            ),
        ]),
      ]),
    );
  }
}

/// A pill that shows the current choice and opens a menu of the others (a phone-sized <select>). The first item is
/// "everything" (muted); any other choice shows the pill dark.
class ChipMenu<T> extends StatelessWidget {
  const ChipMenu({super.key, required this.value, required this.items, required this.onChanged, this.icon});
  final T value;
  final List<(T, String)> items;
  final ValueChanged<T> onChanged;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final label = items.firstWhere((x) => x.$1 == value, orElse: () => items.first).$2;
    return Builder(
      builder: (context) => SkFilterPill(
        label: label,
        icon: icon,
        dropdown: true,
        active: items.isNotEmpty && value != items.first.$1,
        onTap: () async {
          final box = context.findRenderObject() as RenderBox;
          final overlay = Overlay.of(context).context.findRenderObject() as RenderBox;
          final at = box.localToGlobal(Offset(0, box.size.height + 4), ancestor: overlay);
          final picked = await showMenu<(T,)>(
            context: context,
            position: RelativeRect.fromLTRB(at.dx, at.dy, overlay.size.width - at.dx, 0),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(SkRadius.md)),
            items: [
              for (final (v, l) in items)
                PopupMenuItem(
                  value: (v,),
                  child: Row(children: [
                    Expanded(child: Text(l)),
                    if (v == value) Icon(Icons.check_rounded, size: 18, color: Theme.of(context).colorScheme.primary),
                  ]),
                ),
            ],
          );
          if (picked != null) onChanged(picked.$1);
        },
      ),
    );
  }
}
