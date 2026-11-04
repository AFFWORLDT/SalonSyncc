import 'dart:async';

import 'package:flutter/material.dart';

import '../../data/sales_api.dart';
import '../../models/sale.dart';

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

/// Step 2: who it was for (optional, with the barber's own recent customers as suggestions), Cash or Card, and a note.
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
  });

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
  List<CustomerHint> _hints = const [];
  Timer? _debounce;
  int _seq = 0;

  @override
  void initState() {
    super.initState();
    _lookup('');
    widget.name.addListener(_typed);
    widget.phone.addListener(_typed);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    widget.name.removeListener(_typed);
    widget.phone.removeListener(_typed);
    super.dispose();
  }

  String _last = '';
  void _typed() {
    final q = widget.phone.text.trim().isNotEmpty ? widget.phone.text.trim() : widget.name.text.trim();
    if (q == _last) return;
    _last = q;
    _debounce?.cancel();
    if (q.isNotEmpty && q.length < 3) return;
    _debounce = Timer(const Duration(milliseconds: 250), () => _lookup(q));
  }

  Future<void> _lookup(String q) async {
    final n = ++_seq;
    try {
      final h = await widget.sales.customers(q);
      if (mounted && n == _seq) setState(() => _hints = h);
    } catch (_) {
      // Suggestions are a convenience; a failed lookup just shows none.
    }
  }

  void _pick(CustomerHint h) {
    widget.name.text = h.name;
    widget.phone.text = h.phone ?? '';
    _last = widget.phone.text.trim().isNotEmpty ? widget.phone.text.trim() : h.name;
    setState(() => _hints = const []);
    FocusScope.of(context).unfocus();
  }

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
      TextField(
        key: const ValueKey('customer-name'),
        controller: widget.name,
        textCapitalization: TextCapitalization.words,
        maxLength: 80,
        decoration: const InputDecoration(labelText: 'Name', counterText: ''),
      ),
      const SizedBox(height: 10),
      TextField(
        key: const ValueKey('customer-phone'),
        controller: widget.phone,
        keyboardType: TextInputType.phone,
        decoration: const InputDecoration(labelText: 'Mobile', hintText: 'Local number, or with + and country code'),
      ),
      if (_hints.isNotEmpty) ...[
        const SizedBox(height: 10),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final h in _hints)
            ActionChip(avatar: const Icon(Icons.person_outline_rounded, size: 18), label: Text(h.name), tooltip: h.phone, onPressed: () => _pick(h)),
        ]),
      ],
      const SizedBox(height: 20),
      Text('Payment', style: t.labelLarge),
      const SizedBox(height: 8),
      Row(children: [
        for (final (id, label, icon) in const [('cash', 'Cash', Icons.payments_outlined), ('card', 'Card', Icons.credit_card_rounded)]) ...[
          Expanded(
            child: ChoiceChip(
              avatar: Icon(icon, size: 18),
              label: SizedBox(width: double.infinity, child: Text(label, textAlign: TextAlign.center)),
              selected: widget.payment == id,
              onSelected: (_) => widget.onPayment(id),
            ),
          ),
          if (id == 'cash') const SizedBox(width: 10),
        ],
      ]),
      const SizedBox(height: 20),
      if (widget.day == null)
        _noteField()
      else
        ExpansionTile(
          tilePadding: EdgeInsets.zero,
          title: const Text('More (day, note)'),
          children: [
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
            _noteField(),
          ],
        ),
    ]);
  }
}
