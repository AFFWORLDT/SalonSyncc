import 'package:animations/animations.dart';
import 'package:flutter/material.dart';

import '../../core/api/api_error.dart';
import '../../core/format/fmt.dart';
import '../../core/ui/states.dart';
import '../../core/ui/motion.dart';
import '../../data/sales_api.dart';
import '../../data/staff_api.dart';
import '../../models/role.dart';
import '../../models/staff.dart';
import '../../models/me.dart';
import '../../models/sale.dart';
import '../../models/service.dart';
import 'customer_step.dart';
import 'sale_done.dart';
import 'service_picker.dart';

/// Extra buttons on the "bill generated" screen (sharing, Task 6), given the saved bill.
typedef DoneActions = Widget Function(BuildContext context, Sale sale);

/// How the sheet closed: with a saved bill, after deleting the bill, or (null) without a change.
class SheetResult {
  const SheetResult.saved(Sale this.sale) : deleted = false;
  const SheetResult.deleted()
      : sale = null,
        deleted = true;
  final Sale? sale;
  final bool deleted;
}

/// Opens the sheet full-screen; resolves with how it closed (null when closed without saving).
Future<SheetResult?> openSaleSheet(BuildContext context, {required Me me, required SalesApi sales, StaffApi? staff, Sale? existing, DoneActions? doneActions}) =>
    Navigator.of(context).push<SheetResult>(MaterialPageRoute(
      fullscreenDialog: true,
      builder: (_) => SaleSheet(me: me, sales: sales, staff: staff, existing: existing, doneActions: doneActions),
    ));

/// New sale or edit bill: (admin: who did it →) services → customer, then the saved bill.
class SaleSheet extends StatefulWidget {
  const SaleSheet({super.key, required this.me, required this.sales, this.staff, this.existing, this.doneActions, this.now});
  final Me me;
  final SalesApi sales;

  /// Admins pick the barber from this list; barbers always sell as themselves.
  final StaffApi? staff;
  final Sale? existing;
  final DoneActions? doneActions;

  /// The clock (ms), for tests.
  final int Function()? now;

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
  bool _goingBack = false;
  List<Staff>? _staff;
  int? _barberId;
  late String _day = widget.existing?.day ?? widget.me.today;
  bool _busy = false;
  String? _error;
  Sale? _saved;

  /// When a new bill's save failed without an answer (offline / timeout): it may have reached the server anyway.
  int? _unsureSince;

  Fmt get fmt => widget.me.fmt;
  bool get editing => widget.existing != null;
  bool get admin => widget.me.role == Role.admin && widget.staff != null;
  List<String> get _steps => admin ? const ['barber', 'services', 'customer'] : const ['services', 'customer'];
  String get _kind => _steps[_step];
  bool get _last => _step == _steps.length - 1;
  bool get _canNext => _kind == 'barber' ? _barberId != null : _total > 0;

  void _next() => setState(() {
        _goingBack = false;
        _step++;
        _error = null;
      });

  void _back() => setState(() {
        _goingBack = true;
        _step--;
      });

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
      _barberId = s.barberId;
    }
    if (admin) {
      widget.staff!.list().then((l) => mounted ? setState(() => _staff = l.where((x) => x.active || x.id == _barberId).toList()) : null, onError: (Object e) {
        if (mounted) setState(() { _staff = const []; _error = messageOf(e); });
      });
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
        _barberId = null;
        _day = widget.me.today;
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
      barberId: admin ? _barberId : null,
      day: admin && (editing || _day != widget.me.today) ? _day : null,
    );
    setState(() { _busy = true; _error = null; });
    final at = widget.now?.call() ?? DateTime.now().millisecondsSinceEpoch;
    try {
      if (!editing && _unsureSince != null) {
        // The last try may have saved: look for that bill among today's before saving it a second time.
        final landed = await _landed(draft, _unsureSince!);
        if (landed != null) {
          if (mounted) setState(() { _busy = false; _saved = landed; _unsureSince = null; });
          return;
        }
      }
      final s = editing ? await widget.sales.update(widget.existing!.id, draft) : await widget.sales.create(draft);
      _unsureSince = null;
      if (!mounted) return;
      if (editing) return Navigator.of(context).pop(SheetResult.saved(s));
      setState(() { _busy = false; _saved = s; });
    } catch (e) {
      if (!editing && e is Offline) _unsureSince ??= at;
      if (mounted) setState(() { _busy = false; _error = messageOf(e); });
    }
  }

  /// One of my bills from today with this total and payment, made since [since] (a minute's grace for clock skew).
  Future<Sale?> _landed(SaleDraft d, int since) async {
    final today = await widget.sales.today(widget.me.today);
    for (final s in today.items) {
      if (s.barberId == widget.me.user.id && s.amount == d.total && s.payment == d.payment && s.createdAt >= since - 60000) return s;
    }
    return null;
  }

  Future<void> _delete() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Delete this sale?'),
        content: const Text("It will be removed from today's totals."),
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
      if (mounted) Navigator.of(context).pop(const SheetResult.deleted());
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
        onDone: () => Navigator.of(context).pop(SheetResult.saved(saved)),
        onNew: _reset,
      );
    }
    final total = _total;
    return PopScope(
      canPop: _step == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _back();
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(editing ? 'Edit ${widget.existing!.billNo}' : 'New sale'),
          leading: _step == 0 ? const CloseButton() : BackButton(onPressed: _back),
          actions: [
            if (editing) IconButton(tooltip: 'Delete bill', onPressed: _busy ? null : _delete, icon: const Icon(Icons.delete_outline_rounded)),
          ],
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(4),
            child: TweenAnimationBuilder<double>(
              tween: Tween(end: (_step + 1) / _steps.length),
              duration: skDuration(context),
              builder: (_, v, _) => LinearProgressIndicator(value: v, minHeight: 3),
            ),
          ),
        ),
        body: PageTransitionSwitcher(
          duration: skDuration(context, 300),
          reverse: _goingBack,
          transitionBuilder: (child, a, b) =>
              SharedAxisTransition(animation: a, secondaryAnimation: b, transitionType: SharedAxisTransitionType.horizontal, child: child),
          child: _kind == 'barber'
              ? _BarberGrid(key: const ValueKey('step-barber'), staff: _staff, selected: _barberId, onPick: (id) => setState(() { _barberId = id; _error = null; }))
              : _kind == 'services'
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
                  day: admin ? _day : null,
                  today: widget.me.today,
                  onDay: (d) => setState(() => _day = d),
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
              !_last
                  ? FilledButton(
                      key: const ValueKey('next'),
                      style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                      onPressed: _canNext ? _next : null,
                      child: Text(_kind == 'barber'
                          ? (_barberId == null ? 'Pick who did it' : 'Next')
                          : total > 0
                              ? 'Next · ${fmt.money(total)}'
                              : 'Pick a service or enter the amount'),
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

/// Admin step 1: "Who did this customer?" — the active staff (admins marked ★).
class _BarberGrid extends StatelessWidget {
  const _BarberGrid({super.key, required this.staff, required this.selected, required this.onPick});
  final List<Staff>? staff;
  final int? selected;
  final ValueChanged<int> onPick;

  @override
  Widget build(BuildContext context) {
    final l = staff;
    return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 24), children: [
      Text('Who did this customer?', style: Theme.of(context).textTheme.titleMedium),
      const SizedBox(height: 12),
      if (l == null)
        const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()))
      else
        Wrap(spacing: 10, runSpacing: 10, children: [
          for (final s in l)
            ChoiceChip(
              avatar: CircleAvatar(child: Text(s.name.isEmpty ? '?' : s.name[0].toUpperCase())),
              label: Text(s.isAdmin ? '${s.name} ★' : s.name),
              selected: selected == s.id,
              onSelected: (_) => onPick(s.id),
            ),
        ]),
    ]);
  }
}
