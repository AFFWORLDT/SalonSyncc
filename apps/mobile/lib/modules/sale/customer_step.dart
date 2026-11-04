import 'dart:async';

import 'package:flutter/material.dart';

import '../../data/sales_api.dart';
import '../../models/sale.dart';

const kBadPhone = "Mobile number doesn't look right";

/// The phone as the API wants it: "+" then the country code then the national number. A local "0…" number loses its 0; an empty field is null.
/// Throws [FormatException] (kBadPhone) when it can't be a mobile number.
String? phoneForApi(String typed, String country) {
  final t = typed.replaceAll(RegExp(r'[\s\-()]'), '');
  if (t.isEmpty) return null;
  if (t.startsWith('+')) {
    if (!RegExp(r'^\+\d{8,15}$').hasMatch(t)) throw const FormatException(kBadPhone);
    return t;
  }
  if (!RegExp(r'^\d{6,14}$').hasMatch(t)) throw const FormatException(kBadPhone);
  final national = t.replaceFirst(RegExp(r'^0+'), '');
  return country.isEmpty ? '+$national' : '+$country$national';
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
  });

  final SalesApi sales;
  final TextEditingController name, phone, note;
  final String? payment;
  final ValueChanged<String> onPayment;
  final String phoneCountry;

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
        decoration: InputDecoration(labelText: 'Mobile', prefixText: widget.phoneCountry.isEmpty ? null : '+${widget.phoneCountry} '),
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
      TextField(
        key: const ValueKey('note'),
        controller: widget.note,
        maxLength: 300,
        minLines: 1,
        maxLines: 3,
        decoration: const InputDecoration(labelText: 'Note on the bill', counterText: ''),
      ),
    ]);
  }
}
