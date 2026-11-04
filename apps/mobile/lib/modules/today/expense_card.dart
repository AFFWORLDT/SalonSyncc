import 'package:flutter/material.dart';

import '../../core/format/fmt.dart';
import '../../core/ui/glass.dart';
import '../../core/ui/states.dart';
import '../../data/sales_api.dart';
import '../../models/report.dart';

/// Today's own expense. Editable only when the salon has expenses on and the admin lets this barber add them.
class ExpenseCard extends StatelessWidget {
  const ExpenseCard({super.key, required this.today, required this.fmt, required this.canEdit, required this.sales, required this.onSaved});
  final Totals today;
  final Fmt fmt;
  final bool canEdit;
  final SalesApi sales;
  final VoidCallback onSaved;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final has = today.expense > 0;
    final line = has
        ? [fmt.money(today.expense), if ((today.expenseNote ?? '').isNotEmpty) today.expenseNote!].join(' · ')
        : canEdit
            ? 'Not added yet — add it before you leave'
            : 'None — the admin adds expenses';
    return SkGlass(
      padding: const EdgeInsets.fromLTRB(20, 14, 12, 14),
      child: Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text("Today's expense", style: t.labelLarge),
            const SizedBox(height: 4),
            Text(line, style: t.bodyMedium?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant)),
          ]),
        ),
        if (canEdit) TextButton(onPressed: () => _edit(context), child: Text(has ? 'Edit' : 'Add')),
      ]),
    );
  }

  Future<void> _edit(BuildContext context) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _ExpenseSheet(today: today, fmt: fmt, sales: sales),
    );
    if (saved == true) onSaved();
  }
}

class _ExpenseSheet extends StatefulWidget {
  const _ExpenseSheet({required this.today, required this.fmt, required this.sales});
  final Totals today;
  final Fmt fmt;
  final SalesApi sales;

  @override
  State<_ExpenseSheet> createState() => _ExpenseSheetState();
}

class _ExpenseSheetState extends State<_ExpenseSheet> {
  late final _amount = TextEditingController(text: widget.today.expense > 0 ? widget.fmt.toInput(widget.today.expense) : '');
  late final _note = TextEditingController(text: widget.today.expenseNote ?? '');
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _amount.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.sales.saveExpense(_amount.text.trim(), _note.text.trim());
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = messageOf(e);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text("Today's expense", style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 16),
          TextField(
            key: const ValueKey('expense-amount'),
            controller: _amount,
            autofocus: true,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(labelText: 'Amount (${widget.fmt.currency})', helperText: 'Leave empty or 0 to remove it'),
          ),
          const SizedBox(height: 12),
          TextField(key: const ValueKey('expense-note'), controller: _note, maxLength: 300, decoration: const InputDecoration(labelText: 'Note (optional)')),
          if (_error != null) Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
          FilledButton(onPressed: _busy ? null : _save, child: const Text('Save')),
        ]),
      );
}
