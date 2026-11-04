import 'package:animations/animations.dart';
import 'package:flutter/material.dart';

import '../../core/format/fmt.dart';
import '../../core/ui/states.dart';
import '../../core/ui/motion.dart';
import '../../data/sales_api.dart';
import '../../models/me.dart';
import '../../models/sale.dart';
import '../../models/service.dart';
import 'customer_step.dart';
import 'sale_done.dart';
import 'service_picker.dart';

/// Extra buttons on the "bill generated" screen (sharing, Task 6), given the saved bill.
typedef DoneActions = Widget Function(BuildContext context, Sale sale);

/// Opens the sheet full-screen; resolves with the saved bill (null when closed without saving, or after a delete).
Future<Sale?> openSaleSheet(BuildContext context, {required Me me, required SalesApi sales, Sale? existing, DoneActions? doneActions}) =>
    Navigator.of(context).push<Sale>(MaterialPageRoute(
      fullscreenDialog: true,
      builder: (_) => SaleSheet(me: me, sales: sales, existing: existing, doneActions: doneActions),
    ));

/// New sale or edit bill, in two steps (services → customer), then the saved bill.
class SaleSheet extends StatefulWidget {
  const SaleSheet({super.key, required this.me, required this.sales, this.existing, this.doneActions});
  final Me me;
  final SalesApi sales;
  final Sale? existing;
  final DoneActions? doneActions;

  @override
  State<SaleSheet> createState() => _SaleSheetState();
}

class _SaleSheetState extends State<SaleSheet> {
  List<Service>? _services;
  List<DraftLine> _lines = [];
  final _amount = TextEditingController();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _note = TextEditingController();
  String? _payment;
  int _step = 0;
  bool _busy = false;
  String? _error;
  Sale? _saved;

  Fmt get fmt => widget.me.fmt;
  bool get editing => widget.existing != null;

  @override
  void initState() {
    super.initState();
    final s = widget.existing;
    if (s != null) {
      _lines = [for (final i in s.items) DraftLine(serviceId: i.serviceId, name: i.name, price: i.price, qty: i.qty)];
      if (s.items.isEmpty) _amount.text = fmt.toInput(s.amount);
      if (!s.isWalkIn) _name.text = s.customerLabel;
      _phone.text = s.customerPhone ?? '';
      _note.text = s.note ?? '';
      _payment = s.payment;
    }
    _amount.addListener(() => setState(() {}));
    _loadServices();
  }

  Future<void> _loadServices() async {
    try {
      final l = await widget.sales.services();
      if (mounted) setState(() => _services = l);
    } catch (e) {
      if (mounted) setState(() { _services = const []; _error = messageOf(e); });
    }
  }

  @override
  void dispose() {
    for (final c in [_amount, _name, _phone, _note]) {
      c.dispose();
    }
    super.dispose();
  }

  int get _total => _lines.isNotEmpty ? SaleDraft(lines: _lines, payment: '').total : (fmt.fromInput(_amount.text) ?? 0);

  void _reset() => setState(() {
        _lines = [];
        for (final c in [_amount, _name, _phone, _note]) {
          c.clear();
        }
        _payment = null;
        _step = 0;
        _error = null;
        _saved = null;
      });

  Future<void> _save() async {
    if (_busy) return;
    if (_payment == null) return setState(() => _error = 'Choose Cash or Card');
    String? phone;
    try {
      phone = phoneForApi(_phone.text, widget.me.salon.phoneCountry);
    } on FormatException catch (e) {
      return setState(() => _error = e.message);
    }
    final name = _name.text.trim(), note = _note.text.trim();
    final draft = SaleDraft(
      lines: _lines,
      amount: _lines.isEmpty ? _total : null,
      payment: _payment!,
      customerName: name.isEmpty ? null : name,
      customerPhone: phone,
      note: note.isEmpty ? null : note,
    );
    setState(() { _busy = true; _error = null; });
    try {
      final s = editing ? await widget.sales.update(widget.existing!.id, draft) : await widget.sales.create(draft);
      if (!mounted) return;
      if (editing) return Navigator.of(context).pop(s);
      setState(() { _busy = false; _saved = s; });
    } catch (e) {
      if (mounted) setState(() { _busy = false; _error = messageOf(e); });
    }
  }

  Future<void> _delete() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Delete this bill?'),
        content: Text('${widget.existing!.billNo} · ${fmt.money(widget.existing!.amount)}'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Theme.of(c).colorScheme.error),
            onPressed: () => Navigator.pop(c, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() { _busy = true; _error = null; });
    try {
      await widget.sales.delete(widget.existing!.id);
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) setState(() { _busy = false; _error = messageOf(e); });
    }
  }

  @override
  Widget build(BuildContext context) {
    final saved = _saved;
    if (saved != null) {
      return SaleDone(
        sale: saved,
        fmt: fmt,
        actions: widget.doneActions?.call(context, saved),
        onDone: () => Navigator.of(context).pop(saved),
        onNew: _reset,
      );
    }
    final total = _total;
    return PopScope(
      canPop: _step == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) setState(() => _step = 0);
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(editing ? 'Edit bill' : 'New sale'),
          leading: _step == 0 ? const CloseButton() : BackButton(onPressed: () => setState(() => _step = 0)),
          actions: [
            if (editing) IconButton(tooltip: 'Delete bill', onPressed: _busy ? null : _delete, icon: const Icon(Icons.delete_outline_rounded)),
          ],
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(4),
            child: TweenAnimationBuilder<double>(
              tween: Tween(end: _step == 0 ? 0.5 : 1),
              duration: skDuration(context),
              builder: (_, v, _) => LinearProgressIndicator(value: v, minHeight: 3),
            ),
          ),
        ),
        body: PageTransitionSwitcher(
          duration: skDuration(context, 300),
          reverse: _step == 0,
          transitionBuilder: (child, a, b) =>
              SharedAxisTransition(animation: a, secondaryAnimation: b, transitionType: SharedAxisTransitionType.horizontal, child: child),
          child: _step == 0
              ? ServicePicker(
                  key: const ValueKey('step-services'),
                  services: _services,
                  lines: _lines,
                  onLines: (l) => setState(() => _lines = l),
                  amount: _amount,
                  quickAmounts: widget.me.salon.quickAmounts,
                  fmt: fmt,
                )
              : CustomerStep(
                  key: const ValueKey('step-customer'),
                  sales: widget.sales,
                  name: _name,
                  phone: _phone,
                  note: _note,
                  payment: _payment,
                  onPayment: (p) => setState(() { _payment = p; _error = null; }),
                  phoneCountry: widget.me.salon.phoneCountry,
                ),
        ),
        bottomNavigationBar: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              AnimatedSize(
                duration: skDuration(context, 200),
                child: _error == null
                    ? const SizedBox(width: double.infinity)
                    : Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Text(_error!, textAlign: TextAlign.center, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                      ),
              ),
              _step == 0
                  ? FilledButton(
                      key: const ValueKey('next'),
                      style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                      onPressed: total > 0 ? () => setState(() { _step = 1; _error = null; }) : null,
                      child: Text(total > 0 ? 'Next · ${fmt.money(total)}' : 'Pick a service or enter the amount'),
                    )
                  : FilledButton(
                      key: const ValueKey('save'),
                      style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                      onPressed: _busy ? null : _save,
                      child: _busy
                          ? const SizedBox.square(dimension: 22, child: CircularProgressIndicator(strokeWidth: 2.5))
                          : Text('${editing ? 'Save changes' : 'Save bill'} · ${fmt.money(total)}'),
                    ),
            ]),
          ),
        ),
      ),
    );
  }
}
