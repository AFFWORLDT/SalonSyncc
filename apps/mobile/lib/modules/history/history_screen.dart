import 'package:flutter/material.dart';

import '../../core/ui/heading.dart';
import '../../core/format/fmt.dart';
import '../../core/theme/app_theme.dart';
import '../../core/ui/count_up.dart';
import '../../core/ui/glass.dart';
import '../../core/ui/states.dart';
import '../../data/report_api.dart';
import '../../models/me.dart';
import '../../models/report.dart';

String prevMonth(String ym) {
  final y = int.parse(ym.substring(0, 4)), m = int.parse(ym.substring(5));
  return m == 1 ? '${y - 1}-12' : '$y-${(m - 1).toString().padLeft(2, '0')}';
}

String nextMonth(String ym) {
  final y = int.parse(ym.substring(0, 4)), m = int.parse(ym.substring(5));
  return m == 12 ? '${y + 1}-01' : '$y-${(m + 1).toString().padLeft(2, '0')}';
}

/// The barber's month, day by day: sales, customers, commission and expense.
class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key, required this.me, required this.report});
  final Me me;
  final ReportApi report;

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  late final String _current = widget.me.today.substring(0, 7);
  late String _month = _current;
  MyReport? _r;
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
      final r = await widget.report.me(_month);
      if (!mounted || n != _seq) return;
      setState(() {
        _r = r;
        _error = null;
      });
    } catch (e) {
      if (mounted && n == _seq) setState(() => _error = e);
    }
  }

  void _go(String m) {
    setState(() {
      _month = m;
      _r = null;
      _error = null;
    });
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final fmt = widget.me.fmt, t = Theme.of(context).textTheme, cs = Theme.of(context).colorScheme;
    final r = _r;
    Widget tile(String label, int? v, {String? hint, Color? color}) => SkGlass(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: t.labelMedium?.copyWith(color: cs.onSurfaceVariant)),
            const SizedBox(height: 4),
            v == null
                ? const SkSkeleton(height: 20, width: 80)
                : CountUp(value: v, format: fmt.money, style: SkText.mono.copyWith(fontSize: 17, fontWeight: FontWeight.w700, color: color)),
            if (hint != null) Text(hint, style: t.bodySmall),
          ]),
        );
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 16, 16, 32), children: [
        SkHeading('My history'),
        const SizedBox(height: 8),
        Row(children: [
          IconButton(key: const ValueKey('prev-month'), tooltip: 'Previous month', onPressed: () => _go(prevMonth(_month)), icon: const Icon(Icons.chevron_left_rounded)),
          Expanded(child: Text(fmt.monthLabel(_month), textAlign: TextAlign.center, style: t.titleMedium)),
          IconButton(
            key: const ValueKey('next-month'),
            tooltip: 'Next month',
            onPressed: _month == _current ? null : () => _go(nextMonth(_month)),
            icon: const Icon(Icons.chevron_right_rounded),
          ),
        ]),
        const SizedBox(height: 8),
        if (_error != null && r == null)
          ErrorState(error: _error!, onRetry: _load)
        else ...[
          Row(children: [
            Expanded(child: tile('Sales', r?.totals.sales, hint: r == null ? null : '${r.totals.count} customer${r.totals.count == 1 ? '' : 's'}')),
            const SizedBox(width: 10),
            Expanded(child: tile('My commission', r?.totals.commission)),
          ]),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: tile('Expense', r?.totals.expense)),
            const SizedBox(width: 10),
            Expanded(child: tile('Sales − expense', r?.totals.net, color: r != null && r.totals.net < 0 ? cs.error : null)),
          ]),
          const SizedBox(height: 16),
          if (r == null)
            for (var i = 0; i < 4; i++) const Padding(padding: EdgeInsets.symmetric(vertical: 6), child: SkSkeleton(height: 48))
          else if (r.days.isEmpty)
            const EmptyState(text: 'No sales this month', icon: Icons.event_busy_outlined)
          else
            SkGlass(
              padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 4),
              child: Column(children: [
                _DayRow(day: Text('Day', style: t.labelSmall), cols: [for (final h in const ['Sold', 'Commission', 'Expense']) Text(h, style: t.labelSmall)]),
                for (final d in r.days)
                  _DayRow(
                    day: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(fmt.dayLabel(d.day), style: t.bodyMedium),
                      Text('${d.count} customer${d.count == 1 ? '' : 's'}', style: t.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
                    ]),
                    cols: [
                      Text(fmt.num(d.sales), style: SkText.mono.copyWith(fontWeight: FontWeight.w600)),
                      Text(fmt.num(d.commission, dash: true), style: SkText.mono),
                      Text(fmt.num(d.expense, dash: true), style: SkText.mono),
                    ],
                  ),
              ]),
            ),
          const SizedBox(height: 12),
          Text('All amounts in ${fmt.currency}', textAlign: TextAlign.center, style: t.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
        ],
      ]),
    );
  }
}

/// One line of the month table: the day, then right-aligned number columns.
class _DayRow extends StatelessWidget {
  const _DayRow({required this.day, required this.cols});
  final Widget day;
  final List<Widget> cols;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Row(children: [
          Expanded(child: day),
          for (final c in cols) SizedBox(width: 78, child: Align(alignment: Alignment.centerRight, child: c)),
        ]),
      );
}
