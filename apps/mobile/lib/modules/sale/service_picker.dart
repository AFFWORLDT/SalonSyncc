import 'package:flutter/material.dart';

import '../../core/format/fmt.dart';
import '../../core/theme/app_theme.dart';
import '../../core/ui/glass.dart';
import '../../core/ui/motion.dart';
import '../../data/sales_api.dart';
import '../../models/service.dart';

const kMaxQty = 20;

/// Step 1: the catalogue as tap-to-add chips by category, the chosen lines (− / + and an editable price), an
/// "Other item" row, and — with no lines — a plain amount with the salon's quick amounts.
class ServicePicker extends StatefulWidget {
  const ServicePicker({
    super.key,
    required this.services,
    required this.lines,
    required this.onLines,
    required this.amount,
    required this.quickAmounts,
    required this.fmt,
  });

  final List<Service>? services;
  final List<DraftLine> lines;
  final ValueChanged<List<DraftLine>> onLines;
  final TextEditingController amount;
  final List<num> quickAmounts;
  final Fmt fmt;

  @override
  State<ServicePicker> createState() => _ServicePickerState();
}

class _ServicePickerState extends State<ServicePicker> {
  String? _cat;
  final _otherName = TextEditingController();
  final _otherPrice = TextEditingController();

  @override
  void dispose() {
    _otherName.dispose();
    _otherPrice.dispose();
    super.dispose();
  }

  void _add(Service s) {
    final l = widget.lines;
    final i = l.indexWhere((x) => x.serviceId == s.id);
    widget.onLines(i < 0
        ? [...l, DraftLine(serviceId: s.id, name: s.name, price: s.price)]
        : [for (var j = 0; j < l.length; j++) j == i ? l[j].copyWith(qty: (l[j].qty + 1).clamp(1, kMaxQty)) : l[j]]);
  }

  void _qty(int i, int qty) {
    final l = widget.lines;
    widget.onLines(qty <= 0 ? ([...l]..removeAt(i)) : [for (var j = 0; j < l.length; j++) j == i ? l[j].copyWith(qty: qty.clamp(1, kMaxQty)) : l[j]]);
  }

  void _price(int i, String text) {
    final p = widget.fmt.fromInput(text);
    if (p == null) return;
    final l = widget.lines;
    widget.onLines([for (var j = 0; j < l.length; j++) j == i ? l[j].copyWith(price: p) : l[j]]);
  }

  void _addOther() {
    final p = widget.fmt.fromInput(_otherPrice.text);
    final n = _otherName.text.trim();
    if (n.isEmpty || p == null) return;
    widget.onLines([...widget.lines, DraftLine(name: n.length > 80 ? n.substring(0, 80) : n, price: p)]);
    _otherName.clear();
    _otherPrice.clear();
    FocusScope.of(context).unfocus();
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final fmt = widget.fmt;
    final groups = <String, List<Service>>{};
    for (final s in widget.services ?? const <Service>[]) {
      (groups[s.category] ??= []).add(s);
    }
    final cat = groups.containsKey(_cat) ? _cat! : (groups.keys.isEmpty ? null : groups.keys.first);
    return ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
      if (widget.services == null)
        const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()))
      else ...[
        if (groups.isNotEmpty)
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(children: [
              for (final c in groups.keys)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(label: Text(c), selected: c == cat, onSelected: (_) => setState(() => _cat = c)),
                ),
            ]),
          ),
        const SizedBox(height: 10),
        AnimatedSwitcher(
          duration: skDuration(context, 200),
          child: Wrap(
            key: ValueKey(cat),
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final s in groups[cat] ?? const <Service>[])
                ActionChip(
                  avatar: const Icon(Icons.add_rounded, size: 18),
                  label: Text(s.name),
                  tooltip: fmt.money(s.price),
                  onPressed: () => _add(s),
                ),
            ],
          ),
        ),
      ],
      const SizedBox(height: 16),
      AnimatedSize(
        duration: skDuration(context, 200),
        alignment: Alignment.topCenter,
        child: widget.lines.isEmpty
            ? _amountOnly(context)
            : SkGlass(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                child: Column(children: [for (var i = 0; i < widget.lines.length; i++) _line(context, i)]),
              ),
      ),
      const SizedBox(height: 16),
      Text('Other item', style: t.labelLarge),
      const SizedBox(height: 6),
      Row(children: [
        Expanded(flex: 3, child: TextField(controller: _otherName, decoration: const InputDecoration(hintText: 'Name', isDense: true))),
        const SizedBox(width: 8),
        Expanded(
          flex: 2,
          child: TextField(
            controller: _otherPrice,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(hintText: 'Price (${fmt.currency})', isDense: true),
          ),
        ),
        IconButton(tooltip: 'Add item', onPressed: _addOther, icon: const Icon(Icons.add_circle_outline_rounded)),
      ]),
    ]);
  }

  Widget _amountOnly(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        TextField(
          key: const ValueKey('amount'),
          controller: widget.amount,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          style: SkText.mono.copyWith(fontSize: 22, fontWeight: FontWeight.w600),
          decoration: InputDecoration(labelText: 'Or just the amount (${widget.fmt.currency})'),
        ),
        if (widget.quickAmounts.isNotEmpty) ...[
          const SizedBox(height: 10),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final q in widget.quickAmounts)
              ActionChip(label: Text(q == q.roundToDouble() ? q.round().toString() : q.toString()), onPressed: () => widget.amount.text = q.toString().replaceAll(RegExp(r'\.0$'), '')),
          ]),
        ],
      ]);

  Widget _line(BuildContext context, int i) {
    final l = widget.lines[i];
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(children: [
        Expanded(child: Text(l.name, maxLines: 2, overflow: TextOverflow.ellipsis)),
        SizedBox(
          width: 76,
          child: TextFormField(
            key: ValueKey('price-$i-${l.name}'),
            initialValue: widget.fmt.toInput(l.price),
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            textAlign: TextAlign.end,
            style: SkText.mono,
            decoration: const InputDecoration(isDense: true),
            onChanged: (v) => _price(i, v),
          ),
        ),
        IconButton(key: ValueKey('minus-$i'), visualDensity: VisualDensity.compact, onPressed: () => _qty(i, l.qty - 1), icon: const Icon(Icons.remove_rounded)),
        Text('${l.qty}', style: SkText.mono.copyWith(fontWeight: FontWeight.w600)),
        IconButton(key: ValueKey('plus-$i'), visualDensity: VisualDensity.compact, onPressed: l.qty >= kMaxQty ? null : () => _qty(i, l.qty + 1), icon: const Icon(Icons.add_rounded)),
      ]),
    );
  }
}
