import 'package:flutter/material.dart';

import '../../core/ui/avatar.dart';
import '../../core/theme/scale.dart';
import '../../core/ui/stats.dart';
import '../../core/ui/toast.dart';
import '../../core/ui/heading.dart';
import '../../core/format/fmt.dart';
import '../../core/theme/app_theme.dart';
import '../../core/ui/filter_chip_menu.dart';
import '../../core/ui/states.dart';
import '../../data/expenses_api.dart';
import '../../data/staff_api.dart';
import '../../models/expense.dart';
import '../../models/me.dart';
import '../../models/staff.dart';
import '../dashboard/dashboard_screen.dart' show ymd;
import '../history/history_screen.dart' show prevMonth, nextMonth;

/// Barber expenses (one entry per barber per day) and company expenses (rent, bills, supplies), month by month.
class ExpensesScreen extends StatefulWidget {
  const ExpensesScreen({super.key, required this.me, required this.api, required this.staff});
  final Me me;
  final ExpensesApi api;
  final StaffApi staff;

  @override
  State<ExpensesScreen> createState() => _ExpensesScreenState();
}

class _ExpensesScreenState extends State<ExpensesScreen> {
  late final String _current = widget.me.today.substring(0, 7);
  late String _month = _current;
  bool _company = false;
  int? _barber;
  List<Staff> _staff = const [];
  List<Expense>? _barberRows;
  List<CompanyExpense>? _companyRows;
  Object? _error;
  int _seq = 0;

  @override
  void initState() {
    super.initState();
    widget.staff.list().then((l) => mounted ? setState(() => _staff = l) : null, onError: (_) {});
    _load();
  }

  Future<void> _load() async {
    final n = ++_seq;
    try {
      if (_company) {
        final l = await widget.api.company(_month);
        if (mounted && n == _seq) setState(() { _companyRows = l; _error = null; });
      } else {
        final l = await widget.api.barber(_month, barberId: _barber);
        if (mounted && n == _seq) setState(() { _barberRows = l; _error = null; });
      }
    } catch (e) {
      if (mounted && n == _seq) setState(() => _error = e);
    }
  }

  void _set(VoidCallback change) {
    setState(() {
      change();
      _barberRows = null;
      _companyRows = null;
      _error = null;
    });
    _load();
  }

  void _toast(String s) => showSkToast(context, s);

  Future<void> _editBarber(Expense? e, {required int barberId, required String barberName, required String day}) async {
    final r = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _BarberExpenseSheet(api: widget.api, fmt: widget.me.fmt, existing: e, barberId: barberId, barberName: barberName, day: day),
    );
    if (r == null) return;
    _toast(r);
    _load();
  }

  Future<void> _addBarber() async {
    final pick = await showModalBottomSheet<(Staff, String)>(
      context: context,
      showDragHandle: true,
      builder: (_) => _PickBarberDay(staff: _staff.where((s) => s.active).toList(), today: widget.me.today, fmt: widget.me.fmt, slug: widget.me.org.slug),
    );
    if (pick == null || !mounted) return;
    final (s, day) = pick;
    Expense? existing;
    try {
      final rows = day.startsWith(_month) && _barber == null && _barberRows != null ? _barberRows! : await widget.api.barber(day.substring(0, 7), barberId: s.id);
      for (final e in rows) {
        if (e.barberId == s.id && e.day == day) existing = e;
      }
    } catch (_) {}
    if (mounted) await _editBarber(existing, barberId: s.id, barberName: s.name, day: day);
  }

  Future<void> _editCompany(CompanyExpense? e) async {
    final r = await showCompanyExpenseSheet(context, api: widget.api, me: widget.me, existing: e);
    if (r == null) return;
    _toast(r);
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final fmt = widget.me.fmt, t = Theme.of(context).textTheme, cs = Theme.of(context).colorScheme;
    final ro = widget.me.readOnly;
    final rows = _company ? _companyRows : _barberRows;
    final total = _company ? _companyRows?.fold<int>(0, (s, e) => s + e.amount) : _barberRows?.fold<int>(0, (s, e) => s + e.amount);
    final avatars = {for (final x in _staff) x.id: x.avatarUrl};
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.fromLTRB(SkSpace.gutter, SkSpace.sm, SkSpace.gutter, SkSpace.xxxl), children: [
        SkHeading(
          'Expenses',
          action: ro
              ? null
              : FilledButton.icon(
                  onPressed: _company ? () => _editCompany(null) : _addBarber,
                  icon: const Icon(Icons.add_rounded),
                  label: Text(_company ? 'Add company expense' : 'Add expense'),
                ),
        ),
        Wrap(spacing: SkSpace.sm, runSpacing: SkSpace.sm, children: [
          SkFilterPill(label: 'Barbers', icon: Icons.content_cut_rounded, active: !_company, onTap: () => _set(() => _company = false)),
          SkFilterPill(label: 'Company', icon: Icons.storefront_outlined, active: _company, onTap: () => _set(() => _company = true)),
          if (!_company)
            ChipMenu<int?>(
              value: _barber,
              icon: Icons.person_outline_rounded,
              items: [(null, 'All barbers'), for (final s in _staff) (s.id, s.active ? s.name : '${s.name} (inactive)')],
              onChanged: (v) => _set(() => _barber = v),
            ),
        ]),
        const SizedBox(height: SkSpace.sm),
        Row(children: [
          IconButton(tooltip: 'Previous month', onPressed: () => _set(() => _month = prevMonth(_month)), icon: const Icon(Icons.chevron_left_rounded)),
          Expanded(child: Text(fmt.monthLabel(_month), textAlign: TextAlign.center, style: t.titleMedium?.copyWith(fontWeight: FontWeight.w600))),
          IconButton(
            tooltip: 'Next month',
            onPressed: _month == _current ? null : () => _set(() => _month = nextMonth(_month)),
            icon: const Icon(Icons.chevron_right_rounded),
          ),
        ]),
        const SizedBox(height: SkSpace.sm),
        if (_error != null && rows == null)
          ErrorState(error: _error!, onRetry: _load)
        else ...[
          SkHero(
            label: _company ? 'Company expenses' : 'Barbers\' expenses',
            value: total,
            format: fmt.money,
            notes: [if (rows != null) '${rows.length} entr${rows.length == 1 ? 'y' : 'ies'}'],
          ),
          const SizedBox(height: SkSpace.lg),
          if (rows == null)
            const SkSkeletonList(count: 4, height: 60)
          else if (rows.isEmpty)
            EmptyState(text: _company ? 'No company expenses this month. Add rent, bills or supplies here.' : 'No expenses this month.', icon: Icons.receipt_outlined)
          else if (_company)
            SkFlatList(children: [
              for (final e in _companyRows!)
                _row(
                  leading: CircleAvatar(
                    radius: 20,
                    backgroundColor: cs.primary.withValues(alpha: 0.12),
                    foregroundColor: cs.primary,
                    child: Icon(e.paidFrom == 'bank' ? Icons.account_balance_outlined : Icons.payments_outlined, size: 20),
                  ),
                  title: e.note,
                  sub: '${fmt.dayLabel(e.day)} · ${e.paidFrom == 'bank' ? 'Bank' : 'Cash'}',
                  amount: fmt.money(e.amount),
                  onTap: ro ? null : () => _editCompany(e),
                ),
            ])
          else
            SkFlatList(children: [
              for (final e in _barberRows!)
                _row(
                  leading: SkAvatar(slug: widget.me.org.slug, name: e.barberName, url: avatars[e.barberId], size: 40),
                  title: e.barberName,
                  sub: [fmt.dayLabel(e.day), if ((e.note ?? '').isNotEmpty) e.note!].join(' · '),
                  amount: fmt.money(e.amount),
                  onTap: ro ? null : () => _editBarber(e, barberId: e.barberId, barberName: e.barberName, day: e.day),
                ),
            ]),
        ],
      ]),
    );
  }

  Widget _row({required Widget leading, required String title, required String sub, required String amount, VoidCallback? onTap}) {
    final cs = Theme.of(context).colorScheme;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(SkSpace.lg, SkSpace.md, SkSpace.lg, SkSpace.md),
        child: Row(children: [
          leading,
          const SizedBox(width: SkSpace.lg),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
              const SizedBox(height: 2),
              Text(sub, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
            ]),
          ),
          Text(amount, style: SkText.mono.copyWith(fontWeight: FontWeight.w700, color: cs.error)),
        ]),
      ),
    );
  }
}

/// "Add expense for": pick the barber and the day, then the entry opens (an existing one in edit).
class _PickBarberDay extends StatefulWidget {
  const _PickBarberDay({required this.staff, required this.today, required this.fmt, required this.slug});
  final List<Staff> staff;
  final String today, slug;
  final Fmt fmt;

  @override
  State<_PickBarberDay> createState() => _PickBarberDayState();
}

class _PickBarberDayState extends State<_PickBarberDay> {
  Staff? _who;
  late String _day = widget.today;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Add expense for', style: Theme.of(context).textTheme.titleLarge),
          Text('Pick the barber and the day.', style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 14),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final s in widget.staff)
              ChoiceChip(
                avatar: SkAvatar(slug: widget.slug, name: s.name, url: s.avatarUrl, size: 24),
                label: Text(s.name),
                selected: _who?.id == s.id,
                onSelected: (_) => setState(() => _who = s),
              ),
          ]),
          const SizedBox(height: 12),
          Align(
            alignment: Alignment.centerLeft,
            child: InputChip(
              avatar: const Icon(Icons.calendar_today_outlined, size: 18),
              label: Text(_day == widget.today ? 'Today' : widget.fmt.dayLabel(_day)),
              onPressed: () async {
                final last = DateTime.parse(widget.today);
                final d = await showDatePicker(context: context, firstDate: DateTime(2020), lastDate: last, initialDate: DateTime.parse(_day));
                if (d != null) setState(() => _day = ymd(d));
              },
            ),
          ),
          const SizedBox(height: 16),
          FilledButton(onPressed: _who == null ? null : () => Navigator.pop(context, (_who!, _day)), child: const Text('Next')),
        ]),
      );
}

class _BarberExpenseSheet extends StatefulWidget {
  const _BarberExpenseSheet({required this.api, required this.fmt, this.existing, required this.barberId, required this.barberName, required this.day});
  final ExpensesApi api;
  final Fmt fmt;
  final Expense? existing;
  final int barberId;
  final String barberName, day;

  @override
  State<_BarberExpenseSheet> createState() => _BarberExpenseSheetState();
}

class _BarberExpenseSheetState extends State<_BarberExpenseSheet> {
  late final _amount = TextEditingController(text: widget.existing == null ? '' : widget.fmt.toInput(widget.existing!.amount));
  late final _note = TextEditingController(text: widget.existing?.note ?? '');
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _amount.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _save({bool remove = false}) async {
    if (_busy) return;
    setState(() { _busy = true; _error = null; });
    try {
      await widget.api.saveBarber(amount: remove ? '0' : _amount.text.trim(), note: _note.text.trim(), day: widget.day, barberId: widget.barberId);
      final typed = _amount.text.trim();
      final gone = remove || typed.isEmpty || double.tryParse(typed) == 0; // the server removes a 0 / empty entry
      if (mounted) Navigator.pop(context, gone ? 'Expense removed' : 'Expense saved');
    } catch (e) {
      if (mounted) setState(() { _busy = false; _error = messageOf(e); });
    }
  }

  @override
  Widget build(BuildContext context) => _SheetFrame(
        title: widget.existing == null ? 'Add expense' : 'Edit expense',
        subtitle: '${widget.barberName} · ${widget.fmt.dayLabel(widget.day)} — one entry per day. Enter the total.',
        error: _error,
        fields: [
          TextField(
            key: const ValueKey('x-amount'),
            controller: _amount,
            autofocus: widget.existing == null,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(labelText: 'Amount (${widget.fmt.currency})'),
          ),
          const SizedBox(height: 10),
          TextField(controller: _note, maxLength: 300, decoration: const InputDecoration(labelText: 'What for? (optional)', counterText: '')),
        ],
        actions: [
          if (widget.existing != null) TextButton(onPressed: _busy ? null : () => _save(remove: true), child: const Text('Remove')),
          FilledButton(onPressed: _busy ? null : _save, child: const Text('Save expense')),
        ],
      );
}

/// "Add / Edit company expense" — also opened from the dashboard's Expense tile. Resolves with the toast to show.
Future<String?> showCompanyExpenseSheet(BuildContext context, {required ExpensesApi api, required Me me, CompanyExpense? existing}) =>
    showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _CompanySheet(api: api, me: me, existing: existing),
    );

class _CompanySheet extends StatefulWidget {
  const _CompanySheet({required this.api, required this.me, this.existing});
  final ExpensesApi api;
  final Me me;
  final CompanyExpense? existing;

  @override
  State<_CompanySheet> createState() => _CompanySheetState();
}

class _CompanySheetState extends State<_CompanySheet> {
  late final _amount = TextEditingController(text: widget.existing == null ? '' : widget.me.fmt.toInput(widget.existing!.amount));
  late final _note = TextEditingController(text: widget.existing?.note ?? '');
  late String _paid = widget.existing?.paidFrom ?? 'cash';
  late String _day = widget.existing?.day ?? widget.me.today;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _amount.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() call, String toast) async {
    if (_busy) return;
    setState(() { _busy = true; _error = null; });
    try {
      await call();
      if (mounted) Navigator.pop(context, toast);
    } catch (e) {
      if (mounted) setState(() { _busy = false; _error = messageOf(e); });
    }
  }

  void _save() {
    final a = _amount.text.trim(), n = _note.text.trim();
    final e = widget.existing;
    _run(
      () => e == null
          ? widget.api.addCompany(amount: a, note: n, paidFrom: _paid, day: _day)
          : widget.api.editCompany(e.id, amount: a, note: n, paidFrom: _paid, day: _day),
      'Expense saved',
    );
  }

  @override
  Widget build(BuildContext context) {
    final fmt = widget.me.fmt;
    return _SheetFrame(
      title: widget.existing == null ? 'Add company expense' : 'Edit company expense',
      subtitle: 'Shop costs like rent, electricity or supplies. They come off the shop profit.',
      error: _error,
      fields: [
        TextField(
          key: const ValueKey('cx-amount'),
          controller: _amount,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(labelText: 'Amount (${fmt.currency})'),
        ),
        const SizedBox(height: 10),
        TextField(
          key: const ValueKey('cx-note'),
          controller: _note,
          maxLength: 300,
          decoration: const InputDecoration(labelText: 'What for?', hintText: 'e.g. rent, DEWA bill, towels', counterText: ''),
        ),
        const SizedBox(height: 10),
        Text('Paid from', style: Theme.of(context).textTheme.labelLarge),
        const SizedBox(height: 6),
        SegmentedButton<String>(
          segments: const [ButtonSegment(value: 'cash', label: Text('Cash')), ButtonSegment(value: 'bank', label: Text('Bank'))],
          selected: {_paid},
          onSelectionChanged: (s) => setState(() => _paid = s.first),
        ),
        const SizedBox(height: 10),
        Align(
          alignment: Alignment.centerLeft,
          child: InputChip(
            avatar: const Icon(Icons.calendar_today_outlined, size: 18),
            label: Text(_day == widget.me.today ? 'Today' : fmt.dayLabel(_day)),
            onPressed: () async {
              final last = DateTime.parse(widget.me.today);
              final d = await showDatePicker(context: context, firstDate: DateTime(2020), lastDate: last, initialDate: DateTime.parse(_day));
              if (d != null) setState(() => _day = ymd(d));
            },
          ),
        ),
      ],
      actions: [
        if (widget.existing != null)
          TextButton(onPressed: _busy ? null : () => _run(() => widget.api.deleteCompany(widget.existing!.id), 'Expense removed'), child: const Text('Remove')),
        FilledButton(onPressed: _busy ? null : _save, child: const Text('Save expense')),
      ],
    );
  }
}

/// The shared bottom-sheet form layout: title, subtitle, fields, the server's error, buttons.
class _SheetFrame extends StatelessWidget {
  const _SheetFrame({required this.title, required this.subtitle, required this.fields, required this.actions, this.error});
  final String title, subtitle;
  final List<Widget> fields, actions;
  final String? error;

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
        child: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(title, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 4),
            Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 16),
            ...fields,
            if (error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
            const SizedBox(height: 12),
            Row(mainAxisAlignment: MainAxisAlignment.end, children: [for (final a in actions) Padding(padding: const EdgeInsets.only(left: 8), child: a)]),
          ]),
        ),
      );
}
