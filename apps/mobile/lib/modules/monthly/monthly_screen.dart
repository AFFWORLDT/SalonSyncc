import 'dart:typed_data';

import '../../core/ui/toast.dart';
import '../../core/ui/heading.dart';
import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/export/daily_xlsx.dart' show workbookName;
import '../../core/export/monthly_xlsx.dart';
import '../../core/format/fmt.dart';
import '../../core/theme/app_theme.dart';
import '../../core/ui/count_up.dart';
import '../../core/ui/glass.dart';
import '../../core/ui/states.dart';
import '../../data/monthly_api.dart';
import '../../models/me.dart';
import '../../models/monthly.dart';

typedef ShareFile = Future<void> Function(Uint8List bytes, String name);

Future<void> _shareXlsx(Uint8List bytes, String name) async {
  await Share.shareXFiles([XFile.fromData(bytes, name: name, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')], fileNameOverrides: [name]);
}

const _short = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/// The year month by month: sales per barber, the shop's totals and profit; Excel export.
class MonthlyScreen extends StatefulWidget {
  const MonthlyScreen({super.key, required this.me, required this.api, required this.onMonth, this.shareFile = _shareXlsx});
  final Me me;
  final MonthlyApi api;

  /// A month was tapped: open its daily sheet.
  final ValueChanged<String> onMonth;
  final ShareFile shareFile;

  @override
  State<MonthlyScreen> createState() => _MonthlyScreenState();
}

class _MonthlyScreenState extends State<MonthlyScreen> {
  late final int _current = int.parse(widget.me.today.substring(0, 4));
  late int _year = _current;
  MonthlyReport? _r;
  Object? _error;
  bool _exporting = false;
  int _seq = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final n = ++_seq;
    try {
      final r = await widget.api.year('$_year');
      if (mounted && n == _seq) {
        setState(() {
          _r = r;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted && n == _seq) setState(() => _error = e);
    }
  }

  void _go(int y) {
    setState(() {
      _year = y;
      _r = null;
      _error = null;
    });
    _load();
  }

  Future<void> _excel() async {
    final r = _r;
    if (r == null || _exporting) return;
    setState(() => _exporting = true);
    try {
      await widget.shareFile(buildMonthlyXlsx(r, fmt: widget.me.fmt), workbookName(widget.me.salonName, '${r.year} summary'));
    } catch (_) {
      if (mounted) showSkToast(context, "Couldn't create the Excel file", kind: ToastKind.error);
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = widget.me, fmt = me.fmt, t = Theme.of(context).textTheme, cs = Theme.of(context).colorScheme;
    final r = _r, totals = r?.totals;
    Widget tile(String label, int? v, {String? hint, Color? color}) => SkGlass(
          blur: false,
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: t.labelMedium?.copyWith(color: cs.onSurfaceVariant)),
            const SizedBox(height: 4),
            v == null ? const SkSkeleton(height: 20, width: 80) : CountUp(value: v, format: fmt.money, style: SkText.mono.copyWith(fontSize: 17, fontWeight: FontWeight.w700, color: color)),
            if (hint != null) Text(hint, style: t.bodySmall),
          ]),
        );
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
        Row(children: [
          Expanded(child: SkHeading('Monthly')),
          if (me.features.contains('excel_export'))
            OutlinedButton.icon(onPressed: r == null || _exporting ? null : _excel, icon: const Icon(Icons.table_view_outlined), label: Text(_exporting ? 'Preparing…' : 'Excel')),
        ]),
        Row(children: [
          IconButton(tooltip: 'Previous year', onPressed: () => _go(_year - 1), icon: const Icon(Icons.chevron_left_rounded)),
          Expanded(child: Text('$_year', textAlign: TextAlign.center, style: t.titleMedium)),
          IconButton(key: const ValueKey('next-year'), tooltip: 'Next year', onPressed: _year >= _current ? null : () => _go(_year + 1), icon: const Icon(Icons.chevron_right_rounded)),
        ]),
        if (_error != null && r == null)
          ErrorState(error: _error!, onRetry: _load)
        else ...[
          Row(children: [
            Expanded(child: tile('Sales $_year', totals?.sales)),
            const SizedBox(width: 10),
            Expanded(child: tile('Expense', totals?.expense, hint: totals == null || totals.companyExpense == 0 ? null : 'incl. ${fmt.money(totals.companyExpense)} company')),
          ]),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: tile('Commission', totals?.commission)),
            const SizedBox(width: 10),
            Expanded(child: tile('Profit', totals?.profit, color: totals != null && totals.profit < 0 ? cs.error : null)),
          ]),
          const SizedBox(height: 16),
          if (r == null)
            const SkSkeleton(height: 200, radius: 24)
          else if (r.months.every((m) => m.isEmpty))
            EmptyState(text: 'No records in $_year.', icon: Icons.event_busy_outlined)
          else ...[
            Text('Per barber, $_year', style: t.titleMedium),
            const SizedBox(height: 6),
            SkGlass(blur: false, padding: const EdgeInsets.symmetric(vertical: 8), child: _perBarber(context, r)),
            const SizedBox(height: 16),
            Text('Month by month', style: t.titleMedium),
            const SizedBox(height: 6),
            SkGlass(blur: false, padding: const EdgeInsets.symmetric(vertical: 8), child: _months(context, r)),
          ],
          const SizedBox(height: 10),
          Text('All amounts in ${fmt.currency}. Barber columns show sales.', style: t.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
        ],
      ]),
    );
  }

  static const _colW = 64.0;

  Widget _cell(String s, {bool bold = false, Color? color}) => SizedBox(
        width: _colW,
        height: 34,
        child: Align(alignment: Alignment.centerRight, child: Text(s, style: SkText.mono.copyWith(fontSize: 13, fontWeight: bold ? FontWeight.w700 : null, color: color))),
      );

  Widget _head(BuildContext context, String s) =>
      SizedBox(width: _colW, child: Align(alignment: Alignment.centerRight, child: Text(s, style: Theme.of(context).textTheme.labelSmall, maxLines: 1, overflow: TextOverflow.ellipsis)));

  Widget _perBarber(BuildContext context, MonthlyReport r) {
    final fmt = widget.me.fmt, t = Theme.of(context).textTheme, dim = Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.45);
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [SizedBox(width: 110, child: Text('Barber', style: t.labelSmall)), for (final h in ['Cust.', 'Sales', 'Comm.', 'Exp.', 'Net']) _head(context, h)]),
        for (final b in r.barbers)
          () {
            var sales = 0, count = 0, comm = 0, exp = 0;
            for (final m in r.months) {
              final c = m.cellFor(b.id);
              sales += c.sales;
              count += c.count;
              comm += c.commission;
              exp += c.expense;
            }
            final color = b.active ? null : dim;
            return Row(children: [
              SizedBox(width: 110, child: Text(b.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: color))),
              _cell(count == 0 ? '–' : '$count', color: color),
              _cell(fmt.num(sales, dash: true), bold: true, color: color),
              _cell(fmt.num(comm, dash: true), color: color),
              _cell(fmt.num(exp, dash: true), color: color),
              _cell(fmt.num(sales - exp, dash: true), color: color),
            ]);
          }(),
      ]),
    );
  }

  Widget _months(BuildContext context, MonthlyReport r) {
    final fmt = widget.me.fmt, t = Theme.of(context).textTheme, cs = Theme.of(context).colorScheme;
    final months = r.months.where((m) => !m.isEmpty).toList();
    return Padding(
      padding: const EdgeInsets.only(left: 12),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(height: 20, width: 54, child: Text('Month', style: t.labelSmall)),
          for (final m in months)
            InkWell(
              onTap: () => widget.onMonth(m.month),
              child: SizedBox(
                width: 54,
                height: 34,
                child: Align(alignment: Alignment.centerLeft, child: Text(_short[int.parse(m.month.substring(5)) - 1], style: t.bodyMedium?.copyWith(color: cs.primary, fontWeight: FontWeight.w600))),
              ),
            ),
        ]),
        Expanded(
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              SizedBox(height: 20, child: Row(children: [for (final b in r.barbers) _head(context, b.name), for (final h in ['Sale', 'Exp.', 'Com.', 'Profit']) _head(context, h), const SizedBox(width: 12)])),
              for (final m in months)
                Row(children: [
                  for (final b in r.barbers) _cell(fmt.num(m.cellFor(b.id).sales, dash: true)),
                  _cell(fmt.num(m.totals.sales), bold: true),
                  _cell(fmt.num(m.totals.expense, dash: true)),
                  _cell(fmt.num(m.totals.commission, dash: true)),
                  _cell(fmt.num(m.totals.profit), bold: true, color: m.totals.profit < 0 ? cs.error : null),
                  const SizedBox(width: 12),
                ]),
            ]),
          ),
        ),
      ]),
    );
  }
}
