import 'package:flutter/material.dart';

import '../../core/format/fmt.dart';
import '../../core/theme/app_theme.dart';
import '../../core/ui/count_up.dart';
import '../../core/ui/glass.dart';
import '../../core/ui/states.dart';
import '../../data/report_api.dart';
import '../../data/sales_api.dart';
import '../../models/me.dart';
import '../../models/paged.dart';
import '../../models/report.dart';
import '../../models/sale.dart';
import 'expense_card.dart';
import 'sale_row.dart';

const kReadOnly = 'Your subscription has ended. Upgrade to add or change sales.';

/// The barber's day: totals, today's expense, "New sale", and today's bills (tap to edit).
class TodayScreen extends StatefulWidget {
  const TodayScreen({super.key, required this.me, required this.sales, required this.report, required this.onNewSale, required this.onOpenSale});
  final Me me;
  final SalesApi sales;
  final ReportApi report;

  /// Open the new-sale sheet / a bill; each resolves when it closes, and the screen then reloads.
  final Future<void> Function() onNewSale;
  final Future<void> Function(Sale sale) onOpenSale;

  @override
  State<TodayScreen> createState() => TodayScreenState();
}

class TodayScreenState extends State<TodayScreen> {
  Totals? _today;
  Paged<Sale>? _list;
  Object? _error;

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final r = await Future.wait([widget.report.me(widget.me.today.substring(0, 7)), widget.sales.today(widget.me.today)]);
      if (!mounted) return;
      setState(() {
        _today = (r[0] as MyReport).today;
        _list = r[1] as Paged<Sale>;
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
    return RefreshIndicator(
      onRefresh: load,
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 16, 16, 32), children: [
        Text('Hi ${me.user.name} 👋', style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w600)),
        const SizedBox(height: 2),
        Text(fmt.dateLabel(me.today), style: SkText.mono.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant)),
        const SizedBox(height: 16),
        if (_error != null && _list == null)
          ErrorState(error: _error!, onRetry: _retry)
        else ...[
          _Tiles(today: _today, fmt: fmt),
          const SizedBox(height: 12),
          if (_today == null)
            const SkSkeleton(height: 64, radius: 24)
          else if (me.features.contains('expenses'))
            ExpenseCard(today: _today!, fmt: fmt, canEdit: me.canAddExpense && !me.readOnly, sales: widget.sales, onSaved: load),
          const SizedBox(height: 16),
          if (me.readOnly)
            SkGlass(child: Text(kReadOnly, style: t.bodyMedium))
          else
            FilledButton.icon(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
              onPressed: () => _after(widget.onNewSale),
              icon: const Icon(Icons.add_rounded),
              label: const Text('New sale'),
            ),
          const SizedBox(height: 20),
          Row(children: [
            Expanded(child: Text("Today's sales", style: t.titleMedium)),
            if (_list != null) Text(fmt.money(_list!.sum ?? 0), style: SkText.mono.copyWith(fontWeight: FontWeight.w600)),
          ]),
          const SizedBox(height: 8),
          if (loading)
            for (var i = 0; i < 3; i++) const Padding(padding: EdgeInsets.symmetric(vertical: 6), child: SkSkeleton(height: 56))
          else if (_list!.items.isEmpty)
            const EmptyState(text: 'No sales yet today. Tap “New sale” after each customer.', icon: Icons.content_cut_rounded)
          else
            SkGlass(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Column(children: [
                for (final s in _list!.items) SaleRow(sale: s, fmt: fmt, onTap: () => _after(() => widget.onOpenSale(s))),
              ]),
            ),
        ],
      ]),
    );
  }
}

class _Tiles extends StatelessWidget {
  const _Tiles({required this.today, required this.fmt});
  final Totals? today;
  final Fmt fmt;

  @override
  Widget build(BuildContext context) {
    final d = today;
    final cs = Theme.of(context).colorScheme;
    Widget tile(String label, int? value, {String? hint, bool big = false, Color? color}) => SkGlass(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: Theme.of(context).textTheme.labelMedium?.copyWith(color: cs.onSurfaceVariant)),
            const SizedBox(height: 6),
            value == null
                ? SkSkeleton(height: big ? 30 : 22, width: 90)
                : CountUp(
                    value: value,
                    format: fmt.money,
                    style: SkText.mono.copyWith(fontSize: big ? 28 : 18, fontWeight: FontWeight.w700, color: color),
                  ),
            if (hint != null) ...[const SizedBox(height: 2), Text(hint, style: Theme.of(context).textTheme.bodySmall)],
          ]),
        );
    return Column(children: [
      SizedBox(
        width: double.infinity,
        child: tile('My sales today', d?.sales, big: true, hint: d == null ? null : '${d.count} customer${d.count == 1 ? '' : 's'}'),
      ),
      const SizedBox(height: 12),
      Row(children: [
        Expanded(child: tile('My commission', d?.commission)),
        const SizedBox(width: 12),
        Expanded(child: tile('Sales − expense', d?.net, color: d != null && d.net < 0 ? cs.error : null)),
      ]),
    ]);
  }
}
