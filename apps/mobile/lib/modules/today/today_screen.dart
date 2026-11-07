import 'package:flutter/material.dart';

import '../../core/theme/scale.dart';
import '../../core/ui/stats.dart';
import '../../core/ui/tour.dart';
import '../../core/ui/heading.dart';
import '../../core/format/fmt.dart';
import '../../core/theme/app_theme.dart';
import '../../core/ui/glass.dart';
import '../../core/ui/states.dart';
import '../../data/report_api.dart';
import '../../data/sales_api.dart';
import '../../models/me.dart';
import '../../models/role.dart';
import '../../models/paged.dart';
import '../../models/report.dart';
import '../../models/sale.dart';
import 'expense_card.dart';
import 'sale_row.dart';

const kReadOnly = 'Your subscription has ended. Upgrade to add or change sales.';

/// The barber's day: totals, today's expense, "New sale", and today's bills (tap to edit).
/// The last answer per user and day, so the tab opens filled and refreshes quietly (tests clear it).
final todayCache = <String, (Totals?, Paged<Sale>)>{};

class TodayScreen extends StatefulWidget {
  const TodayScreen({super.key, required this.me, required this.sales, required this.report, required this.onNewSale, required this.onOpenSale, this.onRefreshMe});
  final Me me;
  final SalesApi sales;
  final ReportApi report;

  /// Open the new-sale sheet / a bill; each resolves when it closes, and the screen then reloads.
  final Future<void> Function() onNewSale;
  final Future<void> Function(Sale sale) onOpenSale;

  /// Re-reads /api/me (the server's business day). When the day moves on, [me] changes and the screen reloads.
  final Future<void> Function()? onRefreshMe;

  @override
  State<TodayScreen> createState() => TodayScreenState();
}

class TodayScreenState extends State<TodayScreen> {
  Totals? _today;
  Paged<Sale>? _list;
  Object? _error;

  String get _key => '${widget.me.org.slug}|${widget.me.user.id}|${widget.me.today}';

  @override
  void initState() {
    super.initState();
    final c = todayCache[_key];
    if (c != null) {
      _today = c.$1;
      _list = c.$2;
    }
    load();
  }

  @override
  void didUpdateWidget(TodayScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.me.today != widget.me.today) {
      setState(() {
        _today = null;
        _list = null;
      });
      load();
    }
  }

  Future<void> _pull() async {
    await widget.onRefreshMe?.call().then((_) {}, onError: (_) {});
    await load();
  }

  Future<void> load() async {
    try {
      // An admin's Today is their own chair: their sales only (the API shows an admin every sale unless asked).
      final mine = widget.me.role == Role.admin ? widget.me.user.id : null;
      final r = await Future.wait([widget.report.me(widget.me.today.substring(0, 7)), widget.sales.today(widget.me.today, barberId: mine)]);
      if (!mounted) return;
      setState(() {
        _today = (r[0] as MyReport).today;
        _list = r[1] as Paged<Sale>;
        todayCache[_key] = (_today, _list!);
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  void _retry() {
    setState(() => _error = null);
    load();
  }

  Future<void> _after(Future<void> Function() open) async {
    await open();
    await load();
  }

  @override
  Widget build(BuildContext context) {
    final me = widget.me, fmt = me.fmt, t = Theme.of(context).textTheme;
    final loading = _error == null && _list == null;
    final cs = Theme.of(context).colorScheme;
    final d = _today;
    return RefreshIndicator(
      onRefresh: _pull,
      child: ListView(padding: const EdgeInsets.fromLTRB(SkSpace.gutter, SkSpace.sm, SkSpace.gutter, SkSpace.xxxl), children: [
        SkHeading('Hi ${me.user.name} 👋', subtitle: fmt.dateLabel(me.today), mono: true),
        const SizedBox(height: SkSpace.sm),
        if (_error != null && _list == null)
          ErrorState(error: _error!, onRetry: _retry)
        else ...[
          SkHero(
            label: 'My sales today',
            value: d?.sales,
            format: fmt.money,
            notes: [if (d != null) '${d.count} customer${d.count == 1 ? '' : 's'}'],
          ),
          const SizedBox(height: SkSpace.lg),
          SkStatStrip(format: fmt.money, stats: [
            SkStat(label: 'My commission', value: d?.commission),
            SkStat(label: 'Sales − expense', value: d?.net, color: d != null && d.net < 0 ? cs.error : null),
          ]),
          const SizedBox(height: SkSpace.md),
          if (d == null)
            const SkSkeleton(height: 64, radius: 18)
          else if (me.features.contains('expenses'))
            ExpenseCard(today: d, fmt: fmt, canEdit: (me.canAddExpense || me.role == Role.admin) && !me.readOnly, sales: widget.sales, onSaved: load),
          const SizedBox(height: SkSpace.lg),
          if (me.readOnly)
            SkGlass(child: Text(kReadOnly, style: t.bodyMedium))
          else
            tourTarget(
              'new-sale-today',
              FilledButton.icon(
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52), textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                onPressed: () => _after(widget.onNewSale),
                icon: const Icon(Icons.add_rounded),
                label: const Text('New sale'),
              ),
            ),
          Padding(
            padding: const EdgeInsets.only(top: SkSpace.xl, bottom: SkSpace.sm),
            child: Row(children: [
              Expanded(child: Text("Today's sales", style: t.titleMedium?.copyWith(fontWeight: FontWeight.w600))),
              if (_list != null) Text(fmt.money(_list!.sum ?? 0), style: SkText.mono.copyWith(fontWeight: FontWeight.w700)),
            ]),
          ),
          if (loading)
            const SkSkeletonList(count: 3, height: 60)
          else if (_list!.items.isEmpty)
            const EmptyState(text: 'No sales yet today. Tap “New sale” after each customer.', icon: Icons.content_cut_rounded)
          else
            SkFlatList(children: [
              for (final s in _list!.items) SaleRow(sale: s, fmt: fmt, onTap: () => _after(() => widget.onOpenSale(s))),
            ]),
        ],
      ]),
    );
  }
}
