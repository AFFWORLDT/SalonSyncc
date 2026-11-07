import 'package:flutter/material.dart';

import '../../core/format/fmt.dart';
import '../../core/theme/app_theme.dart';
import '../../core/ui/haptics.dart';
import '../../core/ui/motion.dart';
import '../../core/ui/states.dart';
import '../../data/sales_api.dart';
import '../../models/service.dart';

const kMaxQty = 20;

/// Which field the number pad types into: a line's price (its index), the plain amount, or the other item's price.
sealed class PadTarget {
  const PadTarget();
}

class LinePrice extends PadTarget {
  const LinePrice(this.index);
  final int index;
  @override
  bool operator ==(Object other) => other is LinePrice && other.index == index;
  @override
  int get hashCode => index;
}

class AmountTarget extends PadTarget {
  const AmountTarget();
  @override
  bool operator ==(Object other) => other is AmountTarget;
  @override
  int get hashCode => 1;
}

class OtherPriceTarget extends PadTarget {
  const OtherPriceTarget();
  @override
  bool operator ==(Object other) => other is OtherPriceTarget;
  @override
  int get hashCode => 2;
}

/// Step "Services" (like FM's): category pills, the catalogue as big tap-to-add tiles with price and a count badge,
/// the chosen lines (tap a price to retype it on the pad, − / +), an "Other item" row, and — with no lines — a plain
/// amount with the salon's quick amounts. Numbers are typed on the sheet's number pad, never the phone keyboard.
class ServicePicker extends StatelessWidget {
  const ServicePicker({
    super.key,
    required this.services,
    required this.lines,
    required this.onAdd,
    required this.onQty,
    required this.target,
    required this.onTarget,
    required this.priceText,
    required this.amountText,
    required this.onQuick,
    required this.otherName,
    required this.otherPrice,
    required this.onAddOther,
    required this.quickAmounts,
    required this.fmt,
    required this.category,
    required this.onCategory,
  });

  final List<Service>? services;
  final List<DraftLine> lines;
  final ValueChanged<Service> onAdd;
  final void Function(int index, int qty) onQty;
  final PadTarget? target;
  final ValueChanged<PadTarget> onTarget;

  /// What is being typed into the line price on the pad (shown instead of the saved price).
  final String priceText;
  final String amountText;
  final ValueChanged<num> onQuick;
  final TextEditingController otherName;
  final String otherPrice;
  final VoidCallback onAddOther;
  final List<num> quickAmounts;
  final Fmt fmt;
  final String? category;
  final ValueChanged<String> onCategory;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    final groups = <String, List<Service>>{};
    for (final s in services ?? const <Service>[]) {
      (groups[s.category] ??= []).add(s);
    }
    final cat = groups.containsKey(category) ? category! : (groups.keys.isEmpty ? null : groups.keys.first);
    final list = groups[cat] ?? const <Service>[];

    return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 16), children: [
      if (services == null)
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 8,
          crossAxisSpacing: 8,
          childAspectRatio: 2.6,
          children: [for (var i = 0; i < 6; i++) const SkSkeleton(height: 56, radius: 14)],
        )
      else ...[
        if (groups.length > 1)
          SizedBox(
            height: 36,
            child: ListView(scrollDirection: Axis.horizontal, children: [
              for (final c in groups.keys)
                Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: _Pill(
                    label: c,
                    on: c == cat,
                    onTap: () {
                      Haptic.tap();
                      onCategory(c);
                    },
                  ),
                ),
            ]),
          ),
        if (groups.length > 1) const SizedBox(height: 12),
        AnimatedSwitcher(
          duration: skDuration(context, 150),
          child: GridView.count(
            key: ValueKey(cat),
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 8,
            crossAxisSpacing: 8,
            childAspectRatio: 2.5,
            children: [
              for (final s in list)
                _ServiceTile(
                  service: s,
                  qty: lines.where((l) => l.serviceId == s.id).fold(0, (n, l) => n + l.qty),
                  fmt: fmt,
                  onTap: () {
                    Haptic.select();
                    onAdd(s);
                  },
                ),
            ],
          ),
        ),
      ],
      const SizedBox(height: 14),
      AnimatedSize(
        duration: skDuration(context, 180),
        alignment: Alignment.topCenter,
        child: lines.isEmpty
            ? _amountOnly(context)
            : Container(
                decoration: BoxDecoration(color: cs.surfaceContainerHighest.withValues(alpha: 0.45), borderRadius: BorderRadius.circular(16)),
                child: Column(children: [
                  for (var i = 0; i < lines.length; i++) ...[
                    if (i > 0) Divider(height: 1, color: cs.outlineVariant.withValues(alpha: 0.5)),
                    _line(context, i),
                  ],
                ]),
              ),
      ),
      const SizedBox(height: 16),
      Text('Other item', style: t.labelLarge?.copyWith(color: cs.onSurfaceVariant)),
      const SizedBox(height: 6),
      Row(children: [
        Expanded(
          child: TextField(
            key: const ValueKey('other-name'),
            controller: otherName,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(hintText: 'Name', isDense: true),
          ),
        ),
        const SizedBox(width: 8),
        _PadField(
          key: const ValueKey('other-price'),
          text: otherPrice,
          hint: fmt.currency,
          on: target == const OtherPriceTarget(),
          width: 86,
          height: 48,
          onTap: () => onTarget(const OtherPriceTarget()),
        ),
        const SizedBox(width: 6),
        IconButton.filledTonal(key: const ValueKey('other-add'), tooltip: 'Add item', onPressed: onAddOther, icon: const Icon(Icons.add_rounded)),
      ]),
    ]);
  }

  Widget _amountOnly(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final on = target == const AmountTarget();
    String label(num q) => q == q.roundToDouble() ? q.round().toString() : q.toString();
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text('Or just the amount (${fmt.currency})', style: Theme.of(context).textTheme.labelLarge?.copyWith(color: cs.onSurfaceVariant)),
      const SizedBox(height: 6),
      _PadField(key: const ValueKey('amount'), text: amountText, hint: '0', on: on, height: 60, big: true, onTap: () => onTarget(const AmountTarget())),
      if (quickAmounts.isNotEmpty) ...[
        const SizedBox(height: 10),
        GridView.count(
          crossAxisCount: 4,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 8,
          crossAxisSpacing: 8,
          childAspectRatio: 2.1,
          children: [
            for (final q in quickAmounts)
              _QuickAmount(
                key: ValueKey('quick-${label(q)}'),
                label: label(q),
                on: amountText == label(q),
                onTap: () {
                  Haptic.select();
                  onQuick(q);
                },
              ),
          ],
        ),
      ],
    ]);
  }

  Widget _line(BuildContext context, int i) {
    final l = lines[i];
    final t = Theme.of(context).textTheme;
    final on = target == LinePrice(i);
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
      child: Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(l.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: t.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(height: 4),
            Row(children: [
              _PadField(
                key: ValueKey('price-$i'),
                text: on ? priceText : fmt.toInput(l.price),
                hint: fmt.toInput(l.price),
                prefix: fmt.currency,
                on: on,
                height: 32,
                onTap: () => onTarget(LinePrice(i)),
              ),
              if (l.qty > 1)
                Flexible(
                  child: Padding(
                    padding: const EdgeInsets.only(left: 8),
                    child: Text('× ${l.qty} = ${fmt.money(l.price * l.qty)}', maxLines: 1, overflow: TextOverflow.ellipsis, style: SkText.mono.copyWith(fontSize: 12)),
                  ),
                ),
            ]),
          ]),
        ),
        IconButton(
          key: ValueKey('minus-$i'),
          tooltip: l.qty == 1 ? 'Remove ${l.name}' : 'One less',
          onPressed: () {
            Haptic.tap();
            onQty(i, l.qty - 1);
          },
          icon: Icon(l.qty == 1 ? Icons.close_rounded : Icons.remove_rounded),
        ),
        SizedBox(width: 22, child: Text('${l.qty}', textAlign: TextAlign.center, style: SkText.mono.copyWith(fontWeight: FontWeight.w700))),
        IconButton(
          key: ValueKey('plus-$i'),
          tooltip: 'One more',
          onPressed: l.qty >= kMaxQty
              ? null
              : () {
                  Haptic.tap();
                  onQty(i, l.qty + 1);
                },
          icon: const Icon(Icons.add_rounded),
        ),
      ]),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.label, required this.on, required this.onTap});
  final String label;
  final bool on;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Material(
      color: on ? cs.onSurface : cs.surfaceContainerHighest.withValues(alpha: 0.7),
      shape: const StadiumBorder(),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Text(label, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: on ? cs.surface : cs.onSurfaceVariant)),
        ),
      ),
    );
  }
}

class _ServiceTile extends StatelessWidget {
  const _ServiceTile({required this.service, required this.qty, required this.fmt, required this.onTap});
  final Service service;
  final int qty;
  final Fmt fmt;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final on = qty > 0;
    return Material(
      color: on ? cs.primary.withValues(alpha: 0.12) : Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: BorderSide(color: on ? cs.primary : cs.outlineVariant)),
      child: InkWell(
        key: ValueKey('service-${service.id}'),
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Stack(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 6, 26, 6),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
              Text(service.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5, height: 1.15)),
              const SizedBox(height: 2),
              Text(fmt.money(service.price), style: SkText.mono.copyWith(fontSize: 12, color: cs.onSurfaceVariant)),
            ]),
          ),
          if (on)
            Positioned(
              top: 6,
              right: 6,
              child: Container(
                width: 20,
                height: 20,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: cs.primary, shape: BoxShape.circle),
                child: Text('$qty', style: SkText.mono.copyWith(fontSize: 11, fontWeight: FontWeight.w700, color: cs.onPrimary)),
              ),
            ),
        ]),
      ),
    );
  }
}

class _QuickAmount extends StatelessWidget {
  const _QuickAmount({super.key, required this.label, required this.on, required this.onTap});
  final String label;
  final bool on;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Material(
      color: on ? cs.primary : Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: BorderSide(color: on ? cs.primary : cs.outlineVariant)),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Center(child: Text(label, style: SkText.mono.copyWith(fontSize: 16, fontWeight: FontWeight.w600, color: on ? cs.onPrimary : cs.onSurface))),
      ),
    );
  }
}

/// A field the number pad types into: tap to pick it; ringed while it is the pad's target.
class _PadField extends StatelessWidget {
  const _PadField({super.key, required this.text, required this.hint, required this.on, required this.onTap, this.prefix, this.width, this.height = 40, this.big = false});
  final String text, hint;
  final String? prefix;
  final bool on, big;
  final VoidCallback onTap;
  final double? width;
  final double height;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final style = SkText.mono.copyWith(fontSize: big ? 30 : 14, fontWeight: big ? FontWeight.w700 : FontWeight.w600);
    return GestureDetector(
      onTap: () {
        Haptic.tap();
        onTap();
      },
      child: AnimatedContainer(
        duration: skDuration(context, 120),
        width: width,
        height: height,
        padding: EdgeInsets.symmetric(horizontal: big ? 16 : 10),
        alignment: big ? Alignment.center : Alignment.centerLeft,
        decoration: BoxDecoration(
          color: on ? cs.primary.withValues(alpha: 0.10) : cs.surface.withValues(alpha: 0.4),
          borderRadius: BorderRadius.circular(big ? 16 : 10),
          border: Border.all(color: on ? cs.primary : cs.outlineVariant, width: on ? 2 : 1),
        ),
        child: Row(mainAxisSize: big ? MainAxisSize.max : MainAxisSize.min, mainAxisAlignment: MainAxisAlignment.center, children: [
          if (prefix != null && prefix!.isNotEmpty) Text('${prefix!} ', style: SkText.mono.copyWith(fontSize: 11, color: cs.onSurfaceVariant)),
          Flexible(
            child: Text(
              text.isEmpty ? hint : text,
              maxLines: 1,
              overflow: TextOverflow.fade,
              softWrap: false,
              style: style.copyWith(color: text.isEmpty ? cs.onSurfaceVariant.withValues(alpha: 0.6) : null),
            ),
          ),
        ]),
      ),
    );
  }
}
