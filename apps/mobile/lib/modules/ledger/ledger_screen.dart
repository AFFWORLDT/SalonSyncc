import 'dart:typed_data';

import '../../core/ui/toast.dart';
import '../../core/ui/heading.dart';
import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/export/daily_xlsx.dart' show workbookName;
import '../../core/export/ledger_xlsx.dart';
import '../../core/format/fmt.dart';
import '../../core/theme/app_theme.dart';
import '../../core/ui/filter_chip_menu.dart';
import '../../core/ui/form_sheet.dart';
import '../../core/ui/glass.dart';
import '../../core/ui/states.dart';
import '../../data/ledger_api.dart';
import '../../models/ledger.dart';
import '../../models/me.dart';
import '../dashboard/dashboard_screen.dart' show ymd;
import 'ledger_dialogs.dart';

typedef ShareFile = Future<void> Function(Uint8List bytes, String name);

Future<void> _shareXlsx(Uint8List bytes, String name) async {
  await Share.shareXFiles([XFile.fromData(bytes, name: name, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')], fileNameOverrides: [name]);
}

const kShopFooter =
    'Every line stays forever. An edited bill shows its old line struck through, a reversal, then the new line. Amounts in {CUR}; the last column is the running balance.';
const kBarbersFooter = 'Amounts in {CUR}. A negative "owed" means the barber was paid ahead (an advance).';

/// The money book: the shop (cash drawer and bank) and what each barber is owed.
class LedgerScreen extends StatefulWidget {
  const LedgerScreen({super.key, required this.me, required this.api, this.shareFile = _shareXlsx});
  final Me me;
  final LedgerApi api;
  final ShareFile shareFile;

  @override
  State<LedgerScreen> createState() => _LedgerScreenState();
}

class _LedgerScreenState extends State<LedgerScreen> {
  bool _barbersTab = false;
  late String _to = widget.me.today, _from = '${widget.me.today.substring(0, 7)}-01';
  String _account = 'all';
  Balances? _bal;
  ShopLedger? _shop;
  List<BarberBalance>? _barbers;
  int? _statementId;
  BarberStatement? _statement;
  Object? _error;
  int _seq = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final n = ++_seq;
    try {
      if (_barbersTab) {
        final r = await Future.wait([widget.api.barbers(), if (_statementId != null) widget.api.statement(_statementId!, _from, _to)]);
        if (!mounted || n != _seq) return;
        setState(() {
          _barbers = r[0] as List<BarberBalance>;
          _statement = _statementId == null ? null : r[1] as BarberStatement;
          _error = null;
        });
      } else {
        final r = await Future.wait([widget.api.balances(), widget.api.shop(_from, _to, _account)]);
        if (!mounted || n != _seq) return;
        setState(() {
          _bal = r[0] as Balances;
          _shop = r[1] as ShopLedger;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted && n == _seq) setState(() => _error = e);
    }
  }

  void _set(VoidCallback change) {
    setState(change);
    _load();
  }

  void _toast(String s) => showSkToast(context, s);

  Future<void> _sheet(WidgetBuilder b) async {
    final r = await showFormSheet(context, b);
    if (r == null) return;
    _toast(r);
    _load();
  }

  Future<void> _range() async {
    final r = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime.parse(widget.me.today),
      initialDateRange: DateTimeRange(start: DateTime.parse(_from), end: DateTime.parse(_to)),
    );
    if (r != null) {
      _set(() {
        _from = ymd(r.start);
        _to = ymd(r.end);
      });
    }
  }

  Future<void> _openTransfer(LedgerLine l) async {
    try {
      final list = await widget.api.transfers(l.day.substring(0, 7));
      final t = list.where((x) => x.id == l.sourceId).firstOrNull;
      if (!mounted) return;
      if (t == null) return _toast('This money move was removed');
      await _sheet((_) => TransferSheet(api: widget.api, me: widget.me, existing: t));
    } catch (_) {
      _toast("Couldn't open this money move");
    }
  }

  Future<void> _openPayout(LedgerLine l) async {
    try {
      final list = await widget.api.payouts(l.day.substring(0, 7), barberId: _statementId);
      final p = list.where((x) => x.id == l.sourceId).firstOrNull;
      if (!mounted) return;
      if (p == null) return _toast('This payout was removed');
      await _sheet((_) => PayoutSheet(api: widget.api, me: widget.me, barbers: _barbers ?? const [], existing: p));
    } catch (_) {
      _toast("Couldn't open this payout");
    }
  }

  Future<void> _excel() async {
    final s = _shop;
    if (s == null) return;
    try {
      await widget.shareFile(buildLedgerXlsx(s, fmt: widget.me.fmt), workbookName(widget.me.salonName, 'ledger ${s.from} to ${s.to}'));
    } catch (_) {
      _toast("Couldn't create the Excel file");
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
        SkHeading('Ledger'),
        Text('Every money movement, newest first. Nothing here is ever rewritten.', style: t.bodySmall),
        const SizedBox(height: 12),
        SegmentedButton<bool>(
          segments: const [ButtonSegment(value: false, label: Text('Shop')), ButtonSegment(value: true, label: Text('Barbers'))],
          selected: {_barbersTab},
          onSelectionChanged: (s) => _set(() {
            _barbersTab = s.first;
            _error = null;
          }),
        ),
        const SizedBox(height: 12),
        if (_error != null && (_barbersTab ? _barbers : _shop) == null)
          ErrorState(error: _error!, onRetry: _load)
        else if (_barbersTab)
          ..._barbersView(context)
        else
          ..._shopView(context),
      ]),
    );
  }

  Widget _tile(String label, int? v, {String? hint, Color? color}) {
    final t = Theme.of(context).textTheme, fmt = widget.me.fmt;
    return SkGlass(
      blur: false,
      padding: const EdgeInsets.all(14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: t.labelMedium?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant)),
        const SizedBox(height: 4),
        v == null ? const SkSkeleton(height: 20, width: 80) : Text(fmt.money(v), style: SkText.mono.copyWith(fontSize: 17, fontWeight: FontWeight.w700, color: color)),
        if (hint != null) Text(hint, style: t.bodySmall),
      ]),
    );
  }

  Widget _rangeChip() => InputChip(
        avatar: const Icon(Icons.date_range_outlined, size: 18),
        label: Text('${widget.me.fmt.dayLabel(_from)} – ${widget.me.fmt.dayLabel(_to)}'),
        onPressed: _range,
      );

  Widget _line(LedgerLine l, {VoidCallback? onTap}) {
    final fmt = widget.me.fmt, t = Theme.of(context).textTheme, cs = Theme.of(context).colorScheme;
    final sub = [fmt.dayLabel(l.day), fmt.time(l.at), if (l.account != null) l.account == 'bank' ? 'Bank' : 'Cash', ?l.actorName].join(' · ');
    return ListTile(
      dense: true,
      onTap: onTap,
      title: Text(l.memo, style: TextStyle(decoration: l.reversed ? TextDecoration.lineThrough : null)),
      subtitle: Text(sub),
      trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
        Text('${l.amount > 0 ? '+' : ''}${fmt.money(l.amount)}', style: SkText.mono.copyWith(fontWeight: FontWeight.w600, color: l.amount < 0 ? cs.error : cs.primary)),
        Text(fmt.money(l.balance), style: t.bodySmall?.copyWith(fontFamily: SkText.mono.fontFamily)),
      ]),
    );
  }

  Widget _edge(String label, String sub, int v) => ListTile(
        dense: true,
        title: Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(sub),
        trailing: Text(widget.me.fmt.money(v), style: SkText.mono.copyWith(fontWeight: FontWeight.w700)),
      );

  List<Widget> _shopView(BuildContext context) {
    final me = widget.me, fmt = me.fmt, ro = me.readOnly, s = _shop, b = _bal;
    final t = Theme.of(context).textTheme;
    return [
      Row(children: [
        Expanded(child: _tile('Cash drawer', b?.cash, hint: 'Should be in the drawer now')),
        const SizedBox(width: 10),
        Expanded(child: _tile('Bank', b?.bank, hint: 'Card payments and deposits')),
      ]),
      const SizedBox(height: 10),
      _tile('Total', b == null ? null : b.cash + b.bank),
      const SizedBox(height: 10),
      Wrap(spacing: 8, runSpacing: 8, children: [
        FilledButton.icon(onPressed: ro ? null : () => _sheet((_) => TransferSheet(api: widget.api, me: me)), icon: const Icon(Icons.swap_horiz_rounded), label: const Text('Move money')),
        OutlinedButton(onPressed: ro || b == null ? null : () => _sheet((_) => BalancesSheet(api: widget.api, me: me, current: b)), child: const Text('Set balances')),
        if (me.features.contains('excel_export')) OutlinedButton.icon(onPressed: s == null ? null : _excel, icon: const Icon(Icons.table_view_outlined), label: const Text('Excel')),
      ]),
      const SizedBox(height: 10),
      Wrap(spacing: 8, runSpacing: 8, children: [
        _rangeChip(),
        ChipMenu<String>(
          value: _account,
          icon: Icons.account_balance_outlined,
          items: kAccountLabel.entries.map((e) => (e.key, e.value)).toList(),
          onChanged: (v) => _set(() => _account = v),
        ),
      ]),
      const SizedBox(height: 10),
      if (s == null)
        const SkSkeleton(height: 240, radius: 24)
      else
        SkGlass(
          blur: false,
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Column(children: [
            // Newest first: where the money stands now on top, each line with its balance after it, the start below.
            _edge('Closing balance', fmt.dayLabel(s.to), s.closing),
            const Divider(height: 1),
            if (s.lines.isEmpty)
              const EmptyState(text: 'No money moved in these days.', icon: Icons.account_balance_wallet_outlined)
            else
              for (final l in s.lines.reversed) _line(l, onTap: l.openableTransfer && !ro ? () => _openTransfer(l) : null),
            const Divider(height: 1),
            _edge('Opening balance', fmt.dayLabel(s.from), s.opening),
          ]),
        ),
      const SizedBox(height: 10),
      Text(kShopFooter.replaceAll('{CUR}', fmt.currency), style: t.bodySmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant)),
    ];
  }

  List<Widget> _barbersView(BuildContext context) {
    final me = widget.me, fmt = me.fmt, ro = me.readOnly, t = Theme.of(context).textTheme, cs = Theme.of(context).colorScheme;
    final list = _barbers;
    if (_statementId != null) {
      final st = _statement;
      final name = st?.barber.name ?? list?.where((b) => b.id == _statementId).firstOrNull?.name ?? '';
      return [
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(onPressed: () => _set(() {
                _statementId = null;
                _statement = null;
              }), icon: const Icon(Icons.arrow_back_rounded), label: const Text('All barbers')),
        ),
        Row(children: [
          Expanded(child: Text(name, style: t.titleLarge)),
          FilledButton(
            onPressed: ro || list == null ? null : () => _sheet((_) => PayoutSheet(api: widget.api, me: me, barbers: list, barberId: _statementId)),
            child: Text('Pay $name'),
          ),
        ]),
        const SizedBox(height: 10),
        Row(children: [
          Expanded(child: _tile('Earned', st?.barber.earned)),
          const SizedBox(width: 8),
          Expanded(child: _tile('Paid', st?.barber.paid)),
          const SizedBox(width: 8),
          Expanded(child: _tile('Owed now', st?.barber.balance, color: st != null && st.barber.balance < 0 ? cs.error : null)),
        ]),
        const SizedBox(height: 10),
        Align(alignment: Alignment.centerLeft, child: _rangeChip()),
        const SizedBox(height: 10),
        if (st == null)
          const SkSkeleton(height: 200, radius: 24)
        else
          SkGlass(
            blur: false,
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Column(children: [
              if (st.lines.isEmpty)
                const EmptyState(text: 'Nothing in these days.')
              else
                for (final l in st.lines.reversed) _line(l, onTap: l.openablePayout && !ro ? () => _openPayout(l) : null),
              const Divider(height: 1),
              _edge('Owed on ${fmt.dayLabel(st.from)}', '', st.opening),
            ]),
          ),
      ];
    }
    return [
      Row(children: [
        Expanded(child: _tile('Owed to barbers', list?.fold<int>(0, (s, b) => s + b.balance), hint: 'Commission earned minus payouts')),
        const SizedBox(width: 10),
        FilledButton(onPressed: ro || list == null || list.isEmpty ? null : () => _sheet((_) => PayoutSheet(api: widget.api, me: me, barbers: list)), child: const Text('Pay barber')),
      ]),
      const SizedBox(height: 12),
      if (list == null)
        const SkSkeleton(height: 160, radius: 24)
      else
        SkGlass(
          blur: false,
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Column(children: [
            ListTile(dense: true, title: Text('Barber', style: t.labelSmall), trailing: Text('Earned · Paid · Owed', style: t.labelSmall)),
            for (final b in list)
              Opacity(
                opacity: b.active ? 1 : 0.6,
                child: ListTile(
                  title: Text(b.name),
                  subtitle: Text('${fmt.money(b.earned)} earned · ${fmt.money(b.paid)} paid'),
                  trailing: Text(fmt.money(b.balance), style: SkText.mono.copyWith(fontWeight: FontWeight.w700, color: b.balance < 0 ? cs.error : null)),
                  onTap: () => _set(() => _statementId = b.id),
                ),
              ),
          ]),
        ),
      const SizedBox(height: 10),
      Text(kBarbersFooter.replaceAll('{CUR}', fmt.currency), style: t.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
    ];
  }
}
