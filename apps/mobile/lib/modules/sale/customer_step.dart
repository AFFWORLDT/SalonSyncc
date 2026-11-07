import 'package:flutter/material.dart';

import '../../core/format/fmt.dart';
import '../../core/theme/app_theme.dart';
import '../../core/ui/haptics.dart';
import '../../core/ui/motion.dart';
import '../../data/sales_api.dart';
import 'customer_picker.dart';

const kBadPhone = "Mobile number doesn't look right";

/// National number length per calling code (same table as the server's apps/api/src/lib/phone.ts).
const kNationalLengths = {'91': 10, '92': 10, '880': 10, '966': 9, '974': 8, '965': 8, '968': 8, '973': 8, '44': 10, '1': 10, '20': 10, '977': 10};

/// The phone exactly as the server will store it (a port of its `canonicalPhone`, so the app's check and the
/// server's agree): UAE numbers as 05XXXXXXXX, others as + then the code and the national number. An empty field is null.
/// Throws [FormatException] (kBadPhone) when the server would reject it.
String? phoneForApi(String typed, String country) {
  final s = typed.replaceAll(RegExp(r'[\s\-().]'), '');
  if (s.isEmpty) return null;
  String? bad() => throw const FormatException(kBadPhone);
  String? uaeLocal(String rest) => RegExp(r'^5\d{8}$').hasMatch(rest) || RegExp(r'^[234679]\d{7}$').hasMatch(rest) ? '0$rest' : bad();
  final uae = country == '971';
  String? intl;
  if (s.startsWith('+')) {
    intl = s.substring(1);
  } else if (s.startsWith('00')) {
    intl = s.substring(2);
  }
  if (intl != null) {
    if (!RegExp(uae ? r'^\d{8,15}$' : r'^\d{6,15}$').hasMatch(intl)) return bad();
    if (uae && intl.startsWith('971')) return uaeLocal(intl.substring(3));
    return '+$intl';
  }
  if (!RegExp(r'^\d+$').hasMatch(s)) return bad();
  if (uae) {
    if (s.startsWith('971') && s.length == 12) return uaeLocal(s.substring(3));
    return uaeLocal(s.startsWith('0') ? s.substring(1) : s);
  }
  var national = s.startsWith('0') ? s.substring(1) : s;
  final len = kNationalLengths[country];
  if (len != null) {
    if (national.startsWith(country) && national.length == country.length + len) national = national.substring(country.length);
    if (national.length != len) return bad();
  } else if (national.length < 6 || national.length > 14) {
    return bad();
  }
  return '+$country$national';
}

/// Last step: who it was for (optional, with recent customers as suggestions), Cash or Card as two big tiles, the bill
/// in short, and (under More) the note and — for admins — the day.
class CustomerStep extends StatefulWidget {
  const CustomerStep({
    super.key,
    required this.sales,
    required this.name,
    required this.phone,
    required this.note,
    required this.payment,
    required this.onPayment,
    required this.phoneCountry,
    this.day,
    this.today,
    this.onDay,
    required this.fmt,
    required this.lines,
    required this.total,
    this.barberName,
  });

  final Fmt fmt;
  final List<DraftLine> lines;
  final int total;
  final String? barberName;

  final SalesApi sales;
  final TextEditingController name, phone, note;
  final String? payment;
  final ValueChanged<String> onPayment;
  final String phoneCountry;

  /// Admin only: the bill's day (null hides "More (day, note)" and shows the note directly).
  final String? day, today;
  final ValueChanged<String>? onDay;

  @override
  State<CustomerStep> createState() => _CustomerStepState();
}

class _CustomerStepState extends State<CustomerStep> {
  Widget _noteField() => TextField(
        key: const ValueKey('note'),
        controller: widget.note,
        maxLength: 300,
        minLines: 1,
        maxLines: 3,
        decoration: const InputDecoration(labelText: 'Note on the bill', counterText: ''),
      );

  Future<void> _pickDay() async {
    final last = DateTime.parse(widget.today!);
    final d = await showDatePicker(context: context, firstDate: DateTime(2020), lastDate: last, initialDate: DateTime.parse(widget.day!));
    if (d != null) widget.onDay?.call('${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}');
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
      Text('Customer (optional)', style: t.labelLarge),
      const SizedBox(height: 8),
      CustomerPicker(sales: widget.sales, name: widget.name, phone: widget.phone, phoneCountry: widget.phoneCountry, formatPhone: widget.fmt.phone),
      const SizedBox(height: 20),
      Text('Payment', style: t.labelLarge),
      const SizedBox(height: 8),
      Row(children: [
        for (final (id, label, icon) in const [('cash', 'Cash', Icons.payments_outlined), ('card', 'Card', Icons.credit_card_rounded)]) ...[
          if (id == 'card') const SizedBox(width: 10),
          Expanded(
            child: _PayTile(
              key: ValueKey('pay-$id'),
              label: label,
              icon: icon,
              on: widget.payment == id,
              onTap: () {
                Haptic.select();
                widget.onPayment(id);
              },
            ),
          ),
        ],
      ]),
      const SizedBox(height: 16),
      _summary(context),
      const SizedBox(height: 20),
      ExpansionTile(
          tilePadding: EdgeInsets.zero,
          shape: const Border(),
          collapsedShape: const Border(),
          initiallyExpanded: widget.note.text.isNotEmpty || (widget.day != null && widget.day != widget.today),
          title: Text(widget.day == null ? 'More (note)' : 'More (day, note)'),
          children: [
            if (widget.day != null) ...[
            Align(
              alignment: Alignment.centerLeft,
              child: InputChip(
                key: const ValueKey('sale-day'),
                avatar: const Icon(Icons.calendar_today_outlined, size: 18),
                label: Text(widget.day == widget.today ? 'Today' : widget.day!),
                onPressed: _pickDay,
              ),
            ),
            Align(
              alignment: Alignment.centerLeft,
              child: Padding(padding: const EdgeInsets.only(top: 4, bottom: 12), child: Text('Change only to enter a missed sale', style: t.bodySmall)),
            ),
            ],
            _noteField(),
            const SizedBox(height: 8),
          ],
        ),
    ]);
  }

  /// The bill in short: barber, lines, total.
  Widget _summary(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final fmt = widget.fmt;
    final muted = TextStyle(color: cs.onSurfaceVariant);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: cs.surfaceContainerHighest.withValues(alpha: 0.45), borderRadius: BorderRadius.circular(16)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (widget.barberName != null)
          Row(children: [Expanded(child: Text('Barber', style: muted)), Text(widget.barberName!, style: const TextStyle(fontWeight: FontWeight.w600))]),
        if (widget.barberName != null) Divider(height: 18, color: cs.outlineVariant.withValues(alpha: 0.6)),
        if (widget.lines.isEmpty)
          Text('Amount only', style: muted)
        else
          for (final l in widget.lines)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(children: [
                Expanded(child: Text(l.qty > 1 ? '${l.name} × ${l.qty}' : l.name, overflow: TextOverflow.ellipsis)),
                Text(fmt.money(l.price * l.qty), style: SkText.mono),
              ]),
            ),
        Divider(height: 18, color: cs.outlineVariant.withValues(alpha: 0.6)),
        Row(children: [
          const Expanded(child: Text('Total', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16))),
          Text(fmt.money(widget.total), style: SkText.mono.copyWith(fontWeight: FontWeight.w700, fontSize: 16)),
        ]),
      ]),
    );
  }
}

class _PayTile extends StatelessWidget {
  const _PayTile({super.key, required this.label, required this.icon, required this.on, required this.onTap});
  final String label;
  final IconData icon;
  final bool on;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final fg = on ? cs.primary : cs.onSurfaceVariant;
    return AnimatedContainer(
      duration: skDuration(context, 120),
      height: 56,
      decoration: BoxDecoration(
        color: on ? cs.primary.withValues(alpha: 0.12) : Colors.transparent,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: on ? cs.primary : cs.outlineVariant, width: on ? 2 : 1),
      ),
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(icon, color: fg),
            const SizedBox(width: 8),
            Text(label, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: fg)),
          ]),
        ),
      ),
    );
  }
}
