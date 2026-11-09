import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../theme/scale.dart';
import 'count_up.dart';
import 'states.dart';

/// The look of every card: white, big rounded corners, a hairline and (in light) a soft shadow.
BoxDecoration skSoftCard(BuildContext context, {double radius = 22}) {
  final cs = Theme.of(context).colorScheme;
  final dark = Theme.of(context).brightness == Brightness.dark;
  return BoxDecoration(
    color: cs.surface,
    borderRadius: BorderRadius.circular(radius),
    border: Border.all(color: cs.outlineVariant.withValues(alpha: dark ? 0.6 : 0.35)),
    boxShadow: dark ? null : const [BoxShadow(color: Color(0x0F1C1B18), blurRadius: 16, offset: Offset(0, 6))],
  );
}

/// The one big number at the top of a screen (Groww's portfolio value): a small grey label, the amount large in the
/// mono face, then a line of [chips] (e.g. the change vs yesterday) and plain [notes].
class SkHero extends StatelessWidget {
  const SkHero({super.key, required this.label, required this.value, required this.format, this.chips = const [], this.notes = const [], this.color});
  final String label;
  final int? value;
  final String Function(int) format;
  final List<Widget> chips;
  final List<String> notes;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: TextStyle(fontSize: 13.5, color: cs.onSurfaceVariant, fontWeight: FontWeight.w500)),
      const SizedBox(height: SkSpace.xs),
      value == null
          ? const Padding(padding: EdgeInsets.symmetric(vertical: 6), child: SkSkeleton(height: 34, width: 180))
          : CountUp(value: value!, format: format, style: SkText.mono.copyWith(fontSize: 38, height: 1.1, fontWeight: FontWeight.w800, letterSpacing: -1, color: color)),
      if (chips.isNotEmpty || notes.isNotEmpty) ...[
        const SizedBox(height: SkSpace.sm),
        Wrap(spacing: SkSpace.sm, runSpacing: SkSpace.xs, crossAxisAlignment: WrapCrossAlignment.center, children: [
          ...chips,
          for (final n in notes) Text(n, style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant)),
        ]),
      ],
    ]);
  }
}

/// A change shown the Groww way: green ▲ or red ▼ on a soft tint. [text] like "+12% vs yesterday".
class SkDeltaChip extends StatelessWidget {
  const SkDeltaChip(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) {
    final p = skPalette(context);
    final down = text.startsWith('-');
    final c = down ? Theme.of(context).colorScheme.error : p.success;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: c.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(SkRadius.sm)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(down ? Icons.arrow_drop_down_rounded : Icons.arrow_drop_up_rounded, size: 18, color: c),
        Text(text.replaceFirst(RegExp(r'^[+-]'), ''), style: SkText.mono.copyWith(fontSize: 12, fontWeight: FontWeight.w600, color: c)),
      ]),
    );
  }
}

/// One cell of an [SkStatStrip].
class SkStat {
  const SkStat({required this.label, this.value, this.text, this.hint, this.color, this.action, this.loading = false});
  final String label;
  final int? value;

  /// Shown as is instead of a money [value] (a count, a date).
  final String? text;
  final bool loading;
  final String? hint;
  final Color? color;

  /// A small button in the cell's corner (e.g. add a company expense).
  final Widget? action;
}

/// Two or three numbers side by side in one flat card, split by hairlines (instead of a card each).
class SkStatStrip extends StatelessWidget {
  const SkStatStrip({super.key, required this.stats, required this.format});
  final List<SkStat> stats;
  final String Function(int) format;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      decoration: skSoftCard(context),
      child: IntrinsicHeight(
        child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          for (var i = 0; i < stats.length; i++) ...[
            if (i > 0) VerticalDivider(width: 1, thickness: 1, color: cs.outlineVariant.withValues(alpha: 0.6)),
            Expanded(child: _cell(context, stats[i])),
          ],
        ]),
      ),
    );
  }

  Widget _cell(BuildContext context, SkStat s) {
    final cs = Theme.of(context).colorScheme;
    return Stack(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(SkSpace.md, SkSpace.md, SkSpace.sm, SkSpace.md),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Padding(
            padding: EdgeInsets.only(right: s.action == null ? 0 : 22),
            child: Text(s.label, maxLines: 2, style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant, fontWeight: FontWeight.w500)),
          ),
          const SizedBox(height: SkSpace.xs),
          if (s.text != null)
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(s.text!, style: SkText.mono.copyWith(fontSize: 16, fontWeight: FontWeight.w800, color: s.color)),
            )
          else if (s.value == null || s.loading)
            const SkSkeleton(height: 18, width: 64)
          else
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: CountUp(value: s.value!, format: format, style: SkText.mono.copyWith(fontSize: 16, fontWeight: FontWeight.w800, color: s.color)),
            ),
          if (s.hint != null) ...[const SizedBox(height: 2), Text(s.hint!, maxLines: 2, style: TextStyle(fontSize: 11, color: cs.onSurfaceVariant))],
        ]),
      ),
      if (s.action != null) Positioned(top: 2, right: 2, child: s.action!),
    ]);
  }
}

/// Rows in one flat card with hairlines between them (Groww's lists), from [indent] so icons line up.
class SkFlatList extends StatelessWidget {
  const SkFlatList({super.key, required this.children, this.indent = 72});
  final List<Widget> children;
  final double indent;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      decoration: skSoftCard(context),
      clipBehavior: Clip.antiAlias,
      child: Column(children: [
        for (var i = 0; i < children.length; i++) ...[
          if (i > 0) Divider(height: 1, thickness: 1, indent: indent, color: cs.outlineVariant.withValues(alpha: 0.45)),
          children[i],
        ],
      ]),
    );
  }
}

/// A plain flat card (the look of [SkFlatList]) for content that draws its own rows and dividers.
class SkCard extends StatelessWidget {
  const SkCard({super.key, required this.child, this.padding = EdgeInsets.zero});
  final Widget child;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      clipBehavior: Clip.antiAlias,
      decoration: skSoftCard(context),
      child: child,
    );
  }
}
