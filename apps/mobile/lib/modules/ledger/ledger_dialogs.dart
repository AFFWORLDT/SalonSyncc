import 'package:flutter/material.dart';

import '../../core/format/fmt.dart';
import '../../core/ui/form_sheet.dart';
import '../../data/ledger_api.dart';
import '../../models/ledger.dart';
import '../../models/me.dart';
import '../dashboard/dashboard_screen.dart' show ymd;

Widget _dayChip(BuildContext context, Me me, String day, ValueChanged<String> onDay) => Align(
      alignment: Alignment.centerLeft,
      child: InputChip(
        avatar: const Icon(Icons.calendar_today_outlined, size: 18),
        label: Text(day == me.today ? 'Today' : me.fmt.dayLabel(day)),
        onPressed: () async {
          final d = await showDatePicker(context: context, firstDate: DateTime(2020), lastDate: DateTime.parse(me.today), initialDate: DateTime.parse(day));
          if (d != null) onDay(ymd(d));
        },
      ),
    );

Widget _accountToggle(String value, ValueChanged<String> onChanged) => SegmentedButton<String>(
      segments: const [ButtonSegment(value: 'cash', label: Text('Cash drawer')), ButtonSegment(value: 'bank', label: Text('Bank'))],
      selected: {value},
      onSelectionChanged: (s) => onChanged(s.first),
    );

/// "Move money" / "Edit money move" between the cash drawer and the bank.
class TransferSheet extends StatefulWidget {
  const TransferSheet({super.key, required this.api, required this.me, this.existing});
  final LedgerApi api;
  final Me me;
  final Transfer? existing;

  @override
  State<TransferSheet> createState() => _TransferSheetState();
}

class _TransferSheetState extends State<TransferSheet> with FormSheetState {
  late final _amount = TextEditingController(text: widget.existing == null ? '' : widget.me.fmt.toInput(widget.existing!.amount));
  late final _note = TextEditingController(text: widget.existing?.note ?? '');
  late String _from = widget.existing?.fromAccount ?? 'cash';
  late String _day = widget.existing?.day ?? widget.me.today;

  /// Normally the other account; the server answers "Pick two different accounts" if they match.
  late String _to = widget.existing?.toAccount ?? 'bank';

  @override
  void dispose() {
    _amount.dispose();
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final e = widget.existing;
    return FormSheet(
      title: e == null ? 'Move money' : 'Edit money move',
      subtitle: 'For example, depositing drawer cash into the bank. The shop total stays the same.',
      error: error,
      fields: [
        TextField(
          key: const ValueKey('tx-amount'),
          controller: _amount,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(labelText: 'Amount (${widget.me.fmt.currency})'),
        ),
        const SizedBox(height: 12),
        Text('From', style: Theme.of(context).textTheme.labelLarge),
        const SizedBox(height: 6),
        _accountToggle(_from, (v) => setState(() {
              _from = v;
              _to = v == 'cash' ? 'bank' : 'cash';
            })),
        Padding(padding: const EdgeInsets.only(top: 4), child: Text('Goes into the ${_to == 'bank' ? 'bank' : 'cash drawer'}', style: Theme.of(context).textTheme.bodySmall)),
        const SizedBox(height: 10),
        _dayChip(context, widget.me, _day, (d) => setState(() => _day = d)),
        const SizedBox(height: 10),
        TextField(key: const ValueKey('tx-note'), controller: _note, decoration: const InputDecoration(labelText: 'Note (optional)', hintText: 'e.g. deposit at ENBD')),
      ],
      actions: [
        if (e != null) TextButton(onPressed: busy ? null : () => run(() => widget.api.deleteTransfer(e.id), 'Money move removed'), child: const Text('Remove')),
        FilledButton(
          onPressed: busy ? null : () => run(() => widget.api.saveTransfer(id: e?.id, amount: _amount.text.trim(), from: _from, to: _to, day: _day, note: _note.text.trim()), 'Money moved'),
          child: const Text('Save'),
        ),
      ],
    );
  }
}

/// "Set balances": what is really in the drawer and the bank.
class BalancesSheet extends StatefulWidget {
  const BalancesSheet({super.key, required this.api, required this.me, required this.current});
  final LedgerApi api;
  final Me me;
  final Balances current;

  @override
  State<BalancesSheet> createState() => _BalancesSheetState();
}

class _BalancesSheetState extends State<BalancesSheet> with FormSheetState {
  late final _cash = TextEditingController(text: widget.me.fmt.toInput(widget.current.cash));
  late final _bank = TextEditingController(text: widget.me.fmt.toInput(widget.current.bank));

  @override
  void dispose() {
    _cash.dispose();
    _bank.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final fmt = widget.me.fmt;
    const kb = TextInputType.numberWithOptions(decimal: true, signed: true);
    return FormSheet(
      title: 'Set balances',
      subtitle: 'Count the cash in the drawer and check the bank, then enter what is really there. The difference is recorded as a "Balance set" line.',
      error: error,
      fields: [
        TextField(key: const ValueKey('bal-cash'), controller: _cash, keyboardType: kb, decoration: InputDecoration(labelText: 'Cash drawer (${fmt.currency})', helperText: 'The ledger says ${fmt.money(widget.current.cash)}')),
        const SizedBox(height: 10),
        TextField(key: const ValueKey('bal-bank'), controller: _bank, keyboardType: kb, decoration: InputDecoration(labelText: 'Bank (${fmt.currency})', helperText: 'The ledger says ${fmt.money(widget.current.bank)}')),
      ],
      actions: [
        FilledButton(onPressed: busy ? null : () => run(() => widget.api.setBalances(cash: _cash.text.trim(), bank: _bank.text.trim()), 'Balances set'), child: const Text('Set balances')),
      ],
    );
  }
}

/// "Pay barber" / "Edit payout": commission, salary or an advance, out of the drawer or the bank.
class PayoutSheet extends StatefulWidget {
  const PayoutSheet({super.key, required this.api, required this.me, required this.barbers, this.barberId, this.existing});
  final LedgerApi api;
  final Me me;
  final List<BarberBalance> barbers;
  final int? barberId;
  final Payout? existing;

  @override
  State<PayoutSheet> createState() => _PayoutSheetState();
}

class _PayoutSheetState extends State<PayoutSheet> with FormSheetState {
  late int? _barber = widget.existing?.barberId ?? widget.barberId;
  late final _amount = TextEditingController(text: widget.existing == null ? '' : widget.me.fmt.toInput(widget.existing!.amount));
  late final _note = TextEditingController(text: widget.existing?.note ?? '');
  late String _paid = widget.existing?.paidFrom ?? 'cash';
  late String _day = widget.existing?.day ?? widget.me.today;

  @override
  void dispose() {
    _amount.dispose();
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final fmt = widget.me.fmt, e = widget.existing;
    BarberBalance? owed;
    for (final b in widget.barbers) {
      if (b.id == _barber) owed = b;
    }
    return FormSheet(
      title: e == null ? 'Pay barber' : 'Edit payout',
      subtitle: 'Money given to a barber: commission, salary or an advance. It comes out of the cash drawer or the bank.',
      error: error,
      fields: [
        DropdownButtonFormField<int>(
          initialValue: _barber,
          decoration: InputDecoration(labelText: 'Barber', helperText: owed == null ? null : 'Owed now: ${fmt.money(owed.balance)}'),
          hint: const Text('Choose…'),
          items: [for (final b in widget.barbers.where((b) => b.active || b.id == _barber)) DropdownMenuItem(value: b.id, child: Text(b.name))],
          onChanged: (v) => setState(() => _barber = v),
        ),
        const SizedBox(height: 10),
        TextField(
          key: const ValueKey('po-amount'),
          controller: _amount,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(labelText: 'Amount (${fmt.currency})'),
        ),
        const SizedBox(height: 12),
        Text('Paid from', style: Theme.of(context).textTheme.labelLarge),
        const SizedBox(height: 6),
        _accountToggle(_paid, (v) => setState(() => _paid = v)),
        const SizedBox(height: 10),
        _dayChip(context, widget.me, _day, (d) => setState(() => _day = d)),
        const SizedBox(height: 10),
        TextField(controller: _note, maxLength: 200, decoration: const InputDecoration(labelText: 'Note (optional)', hintText: 'e.g. October commission', counterText: '')),
      ],
      actions: [
        if (e != null) TextButton(onPressed: busy ? null : () => run(() => widget.api.deletePayout(e.id), 'Payout removed'), child: const Text('Remove')),
        FilledButton(
          onPressed: busy || _barber == null
              ? null
              : () => run(() => widget.api.savePayout(id: e?.id, barberId: _barber!, amount: _amount.text.trim(), paidFrom: _paid, day: _day, note: _note.text.trim()), 'Payout saved'),
          child: const Text('Save payout'),
        ),
      ],
    );
  }
}
