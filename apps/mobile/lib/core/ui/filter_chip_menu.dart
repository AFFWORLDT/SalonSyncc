import 'package:flutter/material.dart';

import '../theme/scale.dart';
import 'haptics.dart';

/// A filter as a compact pill (Groww-style): muted while it shows everything, dark once something is picked. An
/// optional ✕ clears it ([onClear], with [clearTooltip]).
class SkFilterPill extends StatelessWidget {
  const SkFilterPill({super.key, required this.label, required this.onTap, this.icon, this.active = false, this.onClear, this.clearTooltip, this.dropdown = false});
  final String label;
  final VoidCallback onTap;
  final IconData? icon;
  final bool active, dropdown;
  final VoidCallback? onClear;
  final String? clearTooltip;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final fg = active ? cs.surface : cs.onSurface;
    return Material(
      color: active ? cs.onSurface : cs.surfaceContainerHighest.withValues(alpha: 0.6),
      shape: StadiumBorder(side: BorderSide(color: active ? cs.onSurface : cs.outlineVariant.withValues(alpha: 0.7))),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: () {
          Haptic.tap();
          onTap();
        },
        child: SizedBox(
          height: 36,
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            const SizedBox(width: 12),
            if (icon != null) ...[Icon(icon, size: 16, color: fg), const SizedBox(width: 6)],
            Text(label, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: fg)),
            if (onClear != null && active)
              IconButton(
                tooltip: clearTooltip,
                visualDensity: VisualDensity.compact,
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                iconSize: 16,
                onPressed: () {
                  Haptic.tap();
                  onClear!();
                },
                icon: Icon(Icons.close_rounded, color: fg),
              )
            else if (dropdown)
              Padding(padding: const EdgeInsets.only(left: 2, right: 8), child: Icon(Icons.keyboard_arrow_down_rounded, size: 18, color: fg))
            else
              const SizedBox(width: 12),
          ]),
        ),
      ),
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
