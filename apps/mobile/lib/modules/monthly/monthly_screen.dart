import 'dart:typed_data';

import '../../core/screen_cache.dart';
import '../../core/ui/avatar.dart';
import '../../core/theme/scale.dart';
import '../../core/ui/stats.dart';
import '../../core/ui/toast.dart';
import '../../core/ui/heading.dart';
import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/export/daily_xlsx.dart' show workbookName;
import '../../core/export/monthly_xlsx.dart';
import '../../core/format/fmt.dart';
import '../../core/theme/app_theme.dart';
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
    final key = 'monthly|${widget.me.org.slug}|$_year';
    final cached = ScreenCache.get<MonthlyReport>(key);
    if (cached != null) fillFromCache(setState, () => _r = cached);
    try {
      final r = await widget.api.year('$_year');
      ScreenCache.put(key, r);
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
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.fromLTRB(SkSpace.gutter, SkSpace.sm, SkSpace.gutter, SkSpace.xxxl), children: [
        SkHeading(
          'Monthly',
          action: !me.features.contains('excel_export')
              ? null
              : OutlinedButton.icon(onPressed: r == null || _exporting ? null : _excel, icon: const Icon(Icons.table_view_outlined), label: Text(_exporting ? 'Preparing…' : 'Excel')),
        ),
        Row(children: [
          IconButton(tooltip: 'Previous year', onPressed: () => _go(_year - 1), icon: const Icon(Icons.chevron_left_rounded)),
          Expanded(child: Text('$_year', textAlign: TextAlign.center, style: t.titleMedium?.copyWith(fontWeight: FontWeight.w600))),
          IconButton(key: const ValueKey('next-year'), tooltip: 'Next year', onPressed: _year >= _current ? null : () => _go(_year + 1), icon: const Icon(Icons.chevron_right_rounded)),
        ]),
        const SizedBox(height: SkSpace.sm),
        if (_error != null && r == null)
          ErrorState(error: _error!, onRetry: _load)
        else ...[
          SkHero(label: 'Sales $_year', value: totals?.sales, format: fmt.money),
          const SizedBox(height: SkSpace.lg),
          SkStatStrip(format: fmt.money, stats: [
            SkStat(label: 'Expense', value: totals?.expense, hint: totals == null || totals.companyExpense == 0 ? null : 'incl. ${fmt.money(totals.companyExpense)} company'),
            SkStat(label: 'Commission', value: totals?.commission),
            SkStat(label: 'Profit', value: totals?.profit, color: totals == null ? null : (totals.profit < 0 ? cs.error : skPalette(context).success)),
          ]),
          if (r == null)
            const Padding(padding: EdgeInsets.only(top: SkSpace.xl), child: SkSkeletonList(count: 4, height: 56))
          else if (r.months.every((m) => m.isEmpty))
            EmptyState(text: 'No records in $_year.', icon: Icons.event_busy_outlined)
          else ...[
            SkSection('Month by month'),
            _monthRows(context, r),
            SkSection('Per barber, $_year'),
            _barberRows(context, r),
            const SizedBox(height: SkSpace.md),
            SkCard(
              child: ExpansionTile(
                shape: const Border(),
                collapsedShape: const Border(),
                title: const Text('By barber, each month', style: TextStyle(fontWeight: FontWeight.w600)),
                subtitle: const Text('Every barber\'s sales per month, as in the Excel'),
                childrenPadding: const EdgeInsets.only(bottom: SkSpace.sm),
                children: [_months(context, r)],
              ),
            ),
          ],
          const SizedBox(height: 10),
          Text('All amounts in ${fmt.currency}. Barber columns show sales.', style: t.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
        ],
      ]),
    );
  }

  /// A row per month with sales: the name (tap for its daily sheet), a bar against the best month, sales and profit.
  Widget _monthRows(BuildContext context, MonthlyReport r) {
    final fmt = widget.me.fmt, cs = Theme.of(context).colorScheme;
    final months = r.months.where((m) => !m.isEmpty).toList().reversed.toList();
    final best = months.fold<int>(0, (m, x) => x.totals.sales > m ? x.totals.sales : m);
    return SkFlatList(indent: SkSpace.lg, children: [
      for (final m in months)
        InkWell(
          onTap: () => widget.onMonth(m.month),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(SkSpace.lg, SkSpace.md, SkSpace.lg, SkSpace.md),
            child: Row(children: [
              SizedBox(width: 44, child: Text(_short[int.parse(m.month.substring(5)) - 1], style: TextStyle(fontWeight: FontWeight.w700, color: cs.primary))),
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(value: best <= 0 ? 0 : m.totals.sales / best, minHeight: 6, backgroundColor: cs.outlineVariant.withValues(alpha: 0.35), color: cs.primary),
                ),
              ),
              const SizedBox(width: SkSpace.md),
              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Text(fmt.money(m.totals.sales), style: SkText.mono.copyWith(fontWeight: FontWeight.w700)),
                Text('profit ${fmt.num(m.totals.profit)}', style: SkText.mono.copyWith(fontSize: 11.5, color: m.totals.profit < 0 ? cs.error : cs.onSurfaceVariant)),
              ]),
            ]),
          ),
        ),
    ]);
  }

  /// Each barber's year: sales on the right; customers, commission, expense and net under the name.
  Widget _barberRows(BuildContext context, MonthlyReport r) {
    final fmt = widget.me.fmt, cs = Theme.of(context).colorScheme;
    return SkFlatList(children: [
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
          return Opacity(
            opacity: b.active ? 1 : 0.55,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(SkSpace.lg, SkSpace.md, SkSpace.lg, SkSpace.md),
              child: Row(children: [
                SkAvatar(slug: widget.me.org.slug, name: b.name, size: 40),
                const SizedBox(width: SkSpace.lg),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(b.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
                    const SizedBox(height: 2),
                    Text(
                      '$count cust. · comm ${fmt.num(comm)} · exp ${fmt.num(exp)} · net ${fmt.num(sales - exp)}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant),
                    ),
                  ]),
                ),
                Text(fmt.money(sales), style: SkText.mono.copyWith(fontWeight: FontWeight.w700)),
              ]),
            ),
          );
        }(),
    ]);
  }

  static const _colW = 64.0;

  Widget _cell(String s, {bool bold = false, Color? color}) => SizedBox(
        width: _colW,
        height: 34,
        child: Align(alignment: Alignment.centerRight, child: Text(s, style: SkText.mono.copyWith(fontSize: 13, fontWeight: bold ? FontWeight.w700 : null, color: color))),
      );

  Widget _head(BuildContext context, String s) =>
      SizedBox(width: _colW, child: Align(alignment: Alignment.centerRight, child: Text(s, style: Theme.of(context).textTheme.labelSmall, maxLines: 1, overflow: TextOverflow.ellipsis)));

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
