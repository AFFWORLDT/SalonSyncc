import 'package:animations/animations.dart';
import 'package:flutter/material.dart';

import '../../core/api/api_error.dart';
import '../../core/format/fmt.dart';
import '../../core/theme/app_theme.dart';
import '../../core/ui/haptics.dart';
import '../../core/ui/salon_logo.dart';
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
import 'num_pad.dart';
import 'sale_done.dart';
import 'service_picker.dart';

/// Extra buttons on the "bill generated" screen (sharing), given the saved bill.
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

/// Opens the sale as a tall sheet attached to the bottom (like FM's till); resolves with how it closed (null when
/// closed without saving). Not drag-to-dismiss, so a half-made bill isn't lost by a swipe; ✕ closes it.
Future<SheetResult?> openSaleSheet(BuildContext context, {required Me me, required SalesApi sales, StaffApi? staff, Sale? existing, DoneActions? doneActions}) {
  Haptic.tap();
  return showModalBottomSheet<SheetResult>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    enableDrag: false,
    clipBehavior: Clip.antiAlias,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    sheetAnimationStyle: AnimationStyle(duration: const Duration(milliseconds: 260), reverseDuration: const Duration(milliseconds: 200)),
    builder: (_) => FractionallySizedBox(
      heightFactor: 0.97,
      child: SaleSheet(me: me, sales: sales, staff: staff, existing: existing, doneActions: doneActions),
    ),
  );
}

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

/// The last catalogue and staff per salon, so the sheet opens filled; both are refreshed in the background.
final _servicesCache = <String, List<Service>>{};
final _staffCache = <String, List<Staff>>{};

class _SaleSheetState extends State<SaleSheet> {
  List<Service>? _services;
  List<DraftLine> _lines = [];
  String _amount = '';
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _note = TextEditingController();
  final _otherName = TextEditingController();
  String _otherPrice = '';
  String? _payment;
  String? _category;
  int _step = 0;
  bool _goingBack = false;
  List<Staff>? _staff;
  int? _barberId;
  late String _day = widget.existing?.day ?? widget.me.today;
  bool _busy = false;
  String? _error;
  Sale? _saved;

  /// Where the number pad types; [_fresh]: the next key replaces the value. [_priceText] is the line price being typed.
  PadTarget? _target;
  bool _fresh = true;
  String _priceText = '';

  /// When a new bill's save failed without an answer (offline / timeout): it may have reached the server anyway.
  int? _unsureSince;

  Fmt get fmt => widget.me.fmt;
  String get _slug => widget.me.org.slug;
  bool get editing => widget.existing != null;
  bool get admin => widget.me.role == Role.admin && widget.staff != null;
  List<String> get _steps => admin ? const ['barber', 'services', 'customer'] : const ['services', 'customer'];
  String get _kind => _steps[_step];
  bool get _last => _step == _steps.length - 1;

  bool _enabled(String step) => switch (step) { 'barber' => true, 'services' => !admin || _barberId != null, _ => (!admin || _barberId != null) && _total > 0 };

  String? get _barberName {
    if (!admin) return widget.me.user.name;
    for (final s in _staff ?? const <Staff>[]) {
      if (s.id == _barberId) return s.name;
    }
    return editing && _barberId == widget.existing!.barberId ? widget.existing!.barberName : null;
  }

  void _go(int step, {bool tick = true}) {
    if (step == _step) return;
    if (tick) Haptic.tap();
    FocusScope.of(context).unfocus();
    setState(() {
      _goingBack = step < _step;
      _step = step;
      _error = null;
    });
  }

  void _next() => _go(_step + 1);
  void _back() => _go(_step - 1);

  @override
  void initState() {
    super.initState();
    final s = widget.existing;
    if (s != null) {
      _lines = [for (final i in s.items) DraftLine(serviceId: i.serviceId, name: i.name, price: i.price, qty: i.qty)];
      if (s.items.isEmpty) _amount = fmt.toInput(s.amount);
      if (!s.isWalkIn) _name.text = s.customerLabel;
      _phone.text = s.customerPhone ?? '';
      _note.text = s.note ?? '';
      _payment = s.payment;
      _barberId = s.barberId;
      // Editing starts at the services; the barber is one tap away in the steps.
      if (admin) _step = 1;
    } else {
      _payment = 'cash';
    }
    if (_lines.isEmpty) _target = const AmountTarget();
    _services = _servicesCache[_slug];
    if (admin) {
      final cached = _staffCache[_slug];
      if (cached != null) _staff = _activeStaff(cached);
      widget.staff!.list().then((l) {
        _staffCache[_slug] = l;
        if (mounted) setState(() => _staff = _activeStaff(l));
      }, onError: (Object e) {
        if (mounted && _staff == null) setState(() { _staff = const []; _error = messageOf(e); });
      });
    }
    _loadServices();
    // The Customer tab shows the name as it is typed.
    _name.addListener(_retitle);
    _phone.addListener(_retitle);
  }

  void _retitle() {
    if (mounted) setState(() {});
  }

  List<Staff> _activeStaff(List<Staff> l) => l.where((x) => x.active || x.id == _barberId).toList();

  Future<void> _loadServices() async {
    try {
      final l = await widget.sales.services();
      _servicesCache[_slug] = l;
      if (mounted) setState(() => _services = l);
    } catch (e) {
      if (mounted && _services == null) setState(() { _services = const []; _error = messageOf(e); });
    }
  }

  @override
  void dispose() {
    for (final c in [_name, _phone, _note, _otherName]) {
      c.dispose();
    }
    super.dispose();
  }

  int get _total => _lines.isNotEmpty ? SaleDraft(lines: _lines, payment: '').total : (fmt.fromInput(_amount) ?? 0);

  // ---------- the pad and the lines ----------

  void _select(PadTarget t) => setState(() {
        _target = t;
        _fresh = true;
        _error = null;
        if (t is LinePrice) _priceText = fmt.toInput(_lines[t.index].price);
      });

  void _addService(Service s) {
    final i = _lines.indexWhere((x) => x.serviceId == s.id);
    if (i >= 0) {
      setState(() => _lines = [for (var j = 0; j < _lines.length; j++) j == i ? _lines[j].copyWith(qty: (_lines[j].qty + 1).clamp(1, kMaxQty)) : _lines[j]]);
      return;
    }
    // A new line: the pad now retypes its price (the catalogue price stays until a key is pressed).
    setState(() => _lines = [..._lines, DraftLine(serviceId: s.id, name: s.name, price: s.price)]);
    _select(LinePrice(_lines.length - 1));
  }

  void _qty(int i, int qty) {
    if (qty > 0) {
      setState(() => _lines = [for (var j = 0; j < _lines.length; j++) j == i ? _lines[j].copyWith(qty: qty.clamp(1, kMaxQty)) : _lines[j]]);
      return;
    }
    setState(() {
      _lines = [..._lines]..removeAt(i);
      final t = _target;
      if (_lines.isEmpty) {
        _target = const AmountTarget();
        _fresh = true;
      } else if (t is LinePrice) {
        _target = t.index == i ? null : (t.index > i ? LinePrice(t.index - 1) : t);
      }
    });
  }

  void _addOther() {
    final p = fmt.fromInput(_otherPrice);
    final n = _otherName.text.trim();
    if (n.isEmpty || p == null) {
      Haptic.warning();
      setState(() => _error = n.isEmpty ? 'Type the other item\'s name' : 'Type its price on the pad');
      return;
    }
    Haptic.select();
    FocusScope.of(context).unfocus();
    setState(() {
      _lines = [..._lines, DraftLine(name: n.length > 80 ? n.substring(0, 80) : n, price: p)];
      _otherName.clear();
      _otherPrice = '';
      _target = null;
      _error = null;
    });
  }

  void _quick(num q) => setState(() {
        _amount = q == q.roundToDouble() ? q.round().toString() : q.toString();
        _target = const AmountTarget();
        _fresh = true;
        _error = null;
      });

  void _key(String k) {
    final t = _target;
    if (t == null) return;
    setState(() {
      _error = null;
      String apply(String v) => applyKey(v, k, decimals: fmt.digits, fresh: _fresh);
      switch (t) {
        case AmountTarget():
          _amount = apply(_amount);
        case OtherPriceTarget():
          _otherPrice = apply(_otherPrice);
        case LinePrice(:final index):
          _priceText = apply(_priceText);
          final p = fmt.fromInput(_priceText);
          if (p != null) _lines = [for (var j = 0; j < _lines.length; j++) j == index ? _lines[j].copyWith(price: p) : _lines[j]];
      }
      _fresh = false;
    });
  }

  String get _typing => switch (_target) {
        null => 'Tap a price or amount to type',
        AmountTarget() => 'Typing: amount',
        OtherPriceTarget() => 'Typing: other item price',
        LinePrice(:final index) => 'Typing: ${_lines[index].name} price',
      };

  // ---------- save / delete ----------

  void _reset() => setState(() {
        _lines = [];
        _amount = '';
        _otherPrice = '';
        for (final c in [_name, _phone, _note, _otherName]) {
          c.clear();
        }
        _payment = 'cash';
        _barberId = null;
        _day = widget.me.today;
        _step = 0;
        _goingBack = true;
        _target = const AmountTarget();
        _fresh = true;
        _error = null;
        _saved = null;
      });

  void _fail(String message) {
    Haptic.error();
    setState(() => _error = message);
  }

  Future<void> _save() async {
    if (_busy) return;
    if (_payment == null) return _fail('Choose Cash or Card');
    String? phone;
    try {
      phone = phoneForApi(_phone.text, widget.me.salon.phoneCountry);
    } on FormatException catch (e) {
      return _fail(e.message);
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
    FocusScope.of(context).unfocus();
    setState(() { _busy = true; _error = null; });
    final at = widget.now?.call() ?? DateTime.now().millisecondsSinceEpoch;
    try {
      if (!editing && _unsureSince != null) {
        // The last try may have saved: look for that bill among today's before saving it a second time.
        final landed = await _landed(draft, _unsureSince!);
        if (landed != null) {
          Haptic.success();
          if (mounted) setState(() { _busy = false; _saved = landed; _unsureSince = null; });
          return;
        }
      }
      final s = editing ? await widget.sales.update(widget.existing!.id, draft) : await widget.sales.create(draft);
      _unsureSince = null;
      Haptic.success();
      if (!mounted) return;
      if (editing) return Navigator.of(context).pop(SheetResult.saved(s));
      setState(() { _busy = false; _saved = s; });
    } catch (e) {
      if (!editing && e is Offline) _unsureSince ??= at;
      if (mounted) {
        setState(() => _busy = false);
        _fail(messageOf(e));
      }
    }
  }

  /// A bill for this barber and day (an admin's choice, else mine today) with this total and payment, made since
  /// [since] (a minute's grace for clock skew).
  Future<Sale?> _landed(SaleDraft d, int since) async {
    final barber = d.barberId ?? widget.me.user.id;
    final list = await widget.sales.search(day: d.day ?? widget.me.today, barberId: d.barberId, pageSize: 200);
    for (final s in list.items) {
      if (s.barberId == barber && s.amount == d.total && s.payment == d.payment && s.createdAt >= since - 60000) return s;
    }
    return null;
  }

  Future<void> _delete() async {
    Haptic.warning();
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
      Haptic.warning();
      if (mounted) Navigator.of(context).pop(const SheetResult.deleted());
    } catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        _fail(messageOf(e));
      }
    }
  }

  // ---------- layout ----------

  @override
  Widget build(BuildContext context) {
    final saved = _saved;
    if (saved != null) {
      return SaleDone(
        sale: saved,
        fmt: fmt,
        settings: widget.me.salon,
        slug: _slug,
        actions: widget.doneActions?.call(context, saved),
        onDone: () => Navigator.of(context).pop(SheetResult.saved(saved)),
        onNew: _reset,
      );
    }
    return PopScope(
      canPop: _step == 0 || (editing && admin && _step == 1),
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _back();
      },
      child: Scaffold(
        body: SafeArea(
          bottom: false,
          child: Column(children: [
            _header(context),
            Expanded(
              child: PageTransitionSwitcher(
                duration: skDuration(context, 220),
                reverse: _goingBack,
                transitionBuilder: (child, a, b) =>
                    SharedAxisTransition(animation: a, secondaryAnimation: b, transitionType: SharedAxisTransitionType.horizontal, child: child),
                child: switch (_kind) {
                  'barber' => _BarberGrid(
                      key: const ValueKey('step-barber'),
                      staff: _staff,
                      slug: _slug,
                      selected: _barberId,
                      onPick: (id) {
                        Haptic.select();
                        setState(() { _barberId = id; _error = null; });
                        // One tap picks and moves on.
                        Future<void>.delayed(const Duration(milliseconds: 140), () {
                          if (mounted && _kind == 'barber') _go(_step + 1, tick: false);
                        });
                      },
                    ),
                  'services' => ServicePicker(
                      key: const ValueKey('step-services'),
                      services: _services,
                      lines: _lines,
                      onAdd: _addService,
                      onQty: _qty,
                      target: _target,
                      onTarget: _select,
                      priceText: _priceText,
                      amountText: _amount,
                      onQuick: _quick,
                      otherName: _otherName,
                      otherPrice: _otherPrice,
                      onAddOther: _addOther,
                      quickAmounts: widget.me.salon.quickAmounts,
                      fmt: fmt,
                      category: _category,
                      onCategory: (c) => setState(() => _category = c),
                    ),
                  _ => CustomerStep(
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
                      fmt: fmt,
                      lines: _lines,
                      total: _total,
                      barberName: _barberName,
                    ),
                },
              ),
            ),
          ]),
        ),
        bottomNavigationBar: _kind == 'barber' ? null : _footer(context),
      ),
    );
  }

  /// Title, close / back, delete, and the steps as tabs (each shows what was picked; tap to go back to it).
  Widget _header(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    final values = {
      'barber': _barberName ?? '',
      'services': _total > 0 ? fmt.money(_total) : '',
      'customer': _name.text.trim().isNotEmpty ? _name.text.trim() : (_phone.text.trim().isNotEmpty ? 'Mobile added' : ''),
    };
    const labels = {'barber': 'Barber', 'services': 'Services', 'customer': 'Customer'};
    return Container(
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: cs.outlineVariant.withValues(alpha: 0.5)))),
      padding: const EdgeInsets.fromLTRB(4, 4, 8, 10),
      child: Column(children: [
        Row(children: [
          (_step == 0 || (editing && admin && _step == 1))
              ? IconButton(tooltip: 'Close', onPressed: () => Navigator.of(context).maybePop(), icon: const Icon(Icons.close_rounded))
              : IconButton(tooltip: 'Back', onPressed: _back, icon: const Icon(Icons.arrow_back_rounded)),
          Expanded(child: Text(editing ? 'Edit ${widget.existing!.billNo}' : 'New sale', style: t.titleLarge?.copyWith(fontWeight: FontWeight.w600))),
          if (editing) IconButton(tooltip: 'Delete bill', onPressed: _busy ? null : _delete, icon: const Icon(Icons.delete_outline_rounded)),
        ]),
        const SizedBox(height: 6),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Row(children: [
            for (var i = 0; i < _steps.length; i++) ...[
              if (i > 0) const SizedBox(width: 8),
              Expanded(
                child: _StepTab(
                  key: ValueKey('tab-${_steps[i]}'),
                  label: '${i + 1} · ${labels[_steps[i]]}',
                  value: values[_steps[i]]!,
                  on: i == _step,
                  done: i < _step || values[_steps[i]]!.isNotEmpty,
                  enabled: _enabled(_steps[i]),
                  onTap: () => _go(i),
                ),
              ),
            ],
          ]),
        ),
      ]),
    );
  }

  Widget _footer(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final total = _total;
    final error = AnimatedSize(
      duration: skDuration(context, 160),
      child: _error == null
          ? const SizedBox(width: double.infinity)
          : Container(
              width: double.infinity,
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(color: cs.error.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
              child: Row(children: [
                Icon(Icons.error_outline_rounded, size: 18, color: cs.error),
                const SizedBox(width: 8),
                Expanded(child: Text(_error!, style: TextStyle(color: cs.error, fontWeight: FontWeight.w500))),
              ]),
            ),
    );
    return Material(
      color: cs.surfaceContainerLow,
      child: SafeArea(
        top: false,
        child: Container(
          decoration: BoxDecoration(border: Border(top: BorderSide(color: cs.outlineVariant.withValues(alpha: 0.5)))),
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            error,
            if (!_last) ...[
              Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                  Text('TOTAL', style: SkText.mono.copyWith(fontSize: 11, letterSpacing: 1, color: cs.onSurfaceVariant)),
                  Text(fmt.money(total), key: const ValueKey('total'), style: SkText.mono.copyWith(fontSize: 24, fontWeight: FontWeight.w700, height: 1.15)),
                ]),
                const SizedBox(width: 12),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Text(_typing, textAlign: TextAlign.end, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: cs.primary)),
                  ),
                ),
              ]),
              const SizedBox(height: 8),
              NumPad(
                onKey: _key,
                dot: fmt.digits > 0,
                action: _NextKey(enabled: _enabled('customer'), total: total > 0 ? fmt.money(total) : null, onTap: _next),
              ),
            ] else
              FilledButton(
                key: const ValueKey('save'),
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56), textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                onPressed: _busy ? null : _save,
                child: _busy
                    ? const SizedBox.square(dimension: 22, child: CircularProgressIndicator(strokeWidth: 2.5))
                    : Text('${editing ? 'Save changes' : 'Save bill'} · ${fmt.money(total)}'),
              ),
          ]),
        ),
      ),
    );
  }
}

/// The tall key on the pad: Next, with the total.
class _NextKey extends StatelessWidget {
  const _NextKey({required this.enabled, required this.total, required this.onTap});
  final bool enabled;
  final String? total;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Opacity(
      opacity: enabled ? 1 : 0.4,
      child: Material(
        color: cs.primary,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          key: const ValueKey('next'),
          borderRadius: BorderRadius.circular(14),
          onTapDown: enabled ? (_) => Haptic.tap() : null,
          onTap: enabled ? onTap : null,
          child: Center(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Icon(Icons.arrow_forward_rounded, color: cs.onPrimary),
              const SizedBox(height: 2),
              Text('Next', style: TextStyle(color: cs.onPrimary, fontWeight: FontWeight.w700, fontSize: 15)),
              if (total != null) FittedBox(child: Padding(padding: const EdgeInsets.symmetric(horizontal: 4), child: Text(total!, style: SkText.mono.copyWith(fontSize: 11, color: cs.onPrimary.withValues(alpha: 0.85))))),
            ]),
          ),
        ),
      ),
    );
  }
}

class _StepTab extends StatelessWidget {
  const _StepTab({super.key, required this.label, required this.value, required this.on, required this.done, required this.enabled, required this.onTap});
  final String label, value;
  final bool on, done, enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Opacity(
      opacity: enabled ? 1 : 0.4,
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: enabled && !on ? onTap : null,
        child: AnimatedContainer(
          duration: skDuration(context, 160),
          padding: const EdgeInsets.fromLTRB(2, 4, 2, 6),
          decoration: BoxDecoration(border: Border(bottom: BorderSide(width: 2.5, color: on ? cs.primary : (done ? cs.primary.withValues(alpha: 0.4) : cs.outlineVariant)))),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label.toUpperCase(), maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 10.5, letterSpacing: 0.6, fontWeight: FontWeight.w600, color: on ? cs.primary : cs.onSurfaceVariant)),
            const SizedBox(height: 2),
            Text(value.isEmpty ? '—' : value, maxLines: 1, overflow: TextOverflow.ellipsis, style: SkText.mono.copyWith(fontSize: 13, fontWeight: FontWeight.w600)),
          ]),
        ),
      ),
    );
  }
}

/// Admin step 1: "Who did this customer?" — every active person as a big photo tile; one tap picks and moves on.
class _BarberGrid extends StatelessWidget {
  const _BarberGrid({super.key, required this.staff, required this.slug, required this.selected, required this.onPick});
  final List<Staff>? staff;
  final String slug;
  final int? selected;
  final ValueChanged<int> onPick;

  @override
  Widget build(BuildContext context) {
    final l = staff;
    final cs = Theme.of(context).colorScheme;
    return ListView(padding: const EdgeInsets.fromLTRB(16, 16, 16, 24), children: [
      Text('Who did this customer?', style: Theme.of(context).textTheme.titleMedium?.copyWith(color: cs.onSurfaceVariant)),
      const SizedBox(height: 14),
      GridView.count(
        crossAxisCount: 3,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 10,
        crossAxisSpacing: 10,
        childAspectRatio: 0.86,
        children: l == null
            ? [for (var i = 0; i < 6; i++) const SkSkeleton(height: 120, radius: 18)]
            : [
                for (final s in l)
                  _BarberTile(key: ValueKey('barber-${s.id}'), staff: s, slug: slug, on: selected == s.id, onTap: () => onPick(s.id)),
              ],
      ),
    ]);
  }
}

class _BarberTile extends StatelessWidget {
  const _BarberTile({super.key, required this.staff, required this.slug, required this.on, required this.onTap});
  final Staff staff;
  final String slug;
  final bool on;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return AnimatedContainer(
      duration: skDuration(context, 140),
      decoration: BoxDecoration(
        color: on ? cs.primary.withValues(alpha: 0.12) : Colors.transparent,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: on ? cs.primary : cs.outlineVariant, width: on ? 2 : 1),
      ),
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 10),
            child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              Container(
                padding: const EdgeInsets.all(2.5),
                decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: on ? cs.primary : Colors.transparent, width: 2)),
                child: ClipOval(child: SalonLogo(slug: slug, name: staff.name, logoUrl: staff.avatarUrl, size: 56)),
              ),
              const SizedBox(height: 8),
              Text(
                staff.isAdmin ? '${staff.name} ★' : staff.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5, color: on ? cs.primary : cs.onSurface),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}
