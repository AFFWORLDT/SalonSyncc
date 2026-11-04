import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/export/daily_xlsx.dart';
import '../../core/format/fmt.dart';
import '../../core/theme/app_theme.dart';
import '../../core/ui/count_up.dart';
import '../../core/ui/glass.dart';
import '../../core/ui/states.dart';
import '../../data/admin_reports_api.dart';
import '../../models/daily_sheet.dart';
import '../../models/me.dart';
import '../../shell/nav.dart';
import '../history/history_screen.dart' show prevMonth, nextMonth;

typedef ShareFile = Future<void> Function(Uint8List bytes, String name);

Future<void> _shareXlsx(Uint8List bytes, String name) async {
  await Share.shareXFiles([XFile.fromData(bytes, name: name, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')], fileNameOverrides: [name]);
}

const kSheetNote =
    'All amounts in {CUR}. Shop expense includes company expenses. Profit = sale − expense − commission. Tap a date to see its sales.';

/// The month day by day: each barber's sale and commission (and expense), the shop's totals and profit; Excel export.
class SheetScreen extends StatefulWidget {
  const SheetScreen({super.key, required this.me, required this.reports, required this.onDay, this.shareFile = _shareXlsx});
  final Me me;
  final AdminReportsApi reports;

  /// A date was tapped: show that day's sales.
  final ValueChanged<String> onDay;
  final ShareFile shareFile;

  @override
  State<SheetScreen> createState() => _SheetScreenState();
}

class _SheetScreenState extends State<SheetScreen> {
  late final String _current = widget.me.today.substring(0, 7);
  late String _month = sheetMonthRequest.value ?? _current;
  DailySheet? _d;
  Object? _error;
  bool _showExp = false, _exporting = false;
  int _seq = 0;

  @override
  void initState() {
    super.initState();
    sheetMonthRequest.value = null;
    sheetMonthRequest.addListener(_asked);
    _load();
  }

  @override
  void dispose() {
    sheetMonthRequest.removeListener(_asked);
    super.dispose();
  }

  /// Opened again from Monthly for one month.
  void _asked() {
    final m = sheetMonthRequest.value;
    if (m == null) return;
    sheetMonthRequest.value = null;
    _go(m);
  }

  Future<void> _load() async {
    final n = ++_seq;
    try {
      final d = await widget.reports.daily(_month);
      if (mounted && n == _seq) {
        setState(() {
          _d = d;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted && n == _seq) setState(() => _error = e);
    }
  }

  void _go(String m) {
    setState(() {
      _month = m;
      _d = null;
      _error = null;
    });
    _load();
  }

  Future<void> _excel() async {
    final d = _d;
    if (d == null || _exporting) return;
    setState(() => _exporting = true);
    try {
      final fmt = widget.me.fmt;
      await widget.shareFile(buildDailyXlsx(d, salonName: widget.me.salonName, fmt: fmt), workbookName(widget.me.salonName, fmt.monthLabel(d.month)));
    } catch (e) {
      if (mounted) ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(messageOf(e))));
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = widget.me, fmt = me.fmt, t = Theme.of(context).textTheme, cs = Theme.of(context).colorScheme;
    final d = _d;
    Widget tile(String label, int? v, {String? hint, Color? color}) => SkGlass(blur: false, 
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
        Row(children: [
          Expanded(child: Text('Daily sheet', style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w600))),
          if (me.features.contains('excel_export'))
            OutlinedButton.icon(
              onPressed: d == null || _exporting ? null : _excel,
              icon: const Icon(Icons.table_view_outlined),
              label: Text(_exporting ? 'Preparing…' : 'Excel'),
            ),
        ]),
        Row(children: [
          IconButton(tooltip: 'Previous month', onPressed: () => _go(prevMonth(_month)), icon: const Icon(Icons.chevron_left_rounded)),
          Expanded(child: Text(fmt.monthLabel(_month), textAlign: TextAlign.center, style: t.titleMedium)),
          IconButton(tooltip: 'Next month', onPressed: _month == _current ? null : () => _go(nextMonth(_month)), icon: const Icon(Icons.chevron_right_rounded)),
        ]),
        if (_error != null && d == null)
          ErrorState(error: _error!, onRetry: _load)
        else ...[
          Row(children: [
            Expanded(child: tile('Total sale', d?.totals.sales)),
            const SizedBox(width: 10),
            Expanded(
              child: tile('Expense', d?.totals.expense,
                  hint: d == null || d.totals.companyExpense == 0 ? null : 'incl. ${fmt.money(d.totals.companyExpense)} company'),
            ),
          ]),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: tile('Total commission', d?.totals.commission)),
            const SizedBox(width: 10),
            Expanded(child: tile('Total profit', d?.totals.profit, color: d != null && d.totals.profit < 0 ? cs.error : null)),
          ]),
          const SizedBox(height: 8),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text("Show each barber's expense"),
            value: _showExp,
            onChanged: (v) => setState(() => _showExp = v),
          ),
          if (d == null)
            const SkSkeleton(height: 240, radius: 24)
          else
            SkGlass(blur: false, padding: const EdgeInsets.symmetric(vertical: 8), child: _Table(d: d, me: me, showExp: _showExp, onDay: widget.onDay)),
          const SizedBox(height: 10),
          Text(kSheetNote.replaceAll('{CUR}', fmt.currency), style: t.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
        ],
      ]),
    );
  }
}

class _Table extends StatelessWidget {
  const _Table({required this.d, required this.me, required this.showExp, required this.onDay});
  final DailySheet d;
  final Me me;
  final bool showExp;
  final ValueChanged<String> onDay;

  static const _dateW = 92.0, _colW = 64.0, _rowH = 38.0, _headH = 26.0;

  @override
  Widget build(BuildContext context) {
    final fmt = me.fmt, t = Theme.of(context).textTheme, cs = Theme.of(context).colorScheme;
    final rows = d.rows.where((r) => r.day.compareTo(me.today) <= 0).toList().reversed.toList();
    final perBarber = showExp ? 3 : 2;
    final dim = cs.onSurface.withValues(alpha: 0.45);
    Widget num(int v, {bool bold = false, Color? color}) => SizedBox(
          width: _colW,
          height: _rowH,
          child: Align(
            alignment: Alignment.centerRight,
            child: Text(fmt.num(v, dash: true), style: SkText.mono.copyWith(fontSize: 13, fontWeight: bold ? FontWeight.w700 : null, color: color)),
          ),
        );
    Widget head(String s, {double? w, Color? color}) => SizedBox(
          width: w ?? _colW,
          height: _headH,
          child: Align(alignment: Alignment.centerRight, child: Text(s, style: t.labelSmall?.copyWith(color: color), maxLines: 1, overflow: TextOverflow.ellipsis)),
        );
    Widget line(SheetRow r, {bool total = false}) {
      final isToday = r.day == me.today;
      final muted = !total && r.isEmpty ? dim : null;
      return Container(
        color: isToday ? cs.primary.withValues(alpha: 0.08) : null,
        child: Row(children: [
          for (final b in d.barbers) ...[
            num(r.cellFor(b.id).sales, bold: total, color: muted ?? (b.active ? null : dim)),
            num(r.cellFor(b.id).commission, bold: total, color: muted ?? (b.active ? null : dim)),
            if (showExp) num(r.cellFor(b.id).expense, bold: total, color: muted ?? (b.active ? null : dim)),
          ],
          num(r.sales, bold: true, color: muted),
          num(r.expense, bold: total, color: muted),
          num(r.commission, bold: total, color: muted),
          num(r.profit, bold: true, color: muted ?? (r.profit < 0 ? cs.error : null)),
          const SizedBox(width: 12),
        ]),
      );
    }

    final dates = Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      SizedBox(height: _headH * 2, width: _dateW, child: Align(alignment: Alignment.bottomLeft, child: Text('Date', style: t.labelSmall))),
      for (final r in rows)
        InkWell(
          onTap: () => onDay(r.day),
          child: Container(
            width: _dateW,
            height: _rowH,
            alignment: Alignment.centerLeft,
            color: r.day == me.today ? cs.primary.withValues(alpha: 0.08) : null,
            child: Text(fmt.dayLabel(r.day), style: t.bodySmall?.copyWith(color: r.isEmpty ? dim : cs.primary, fontWeight: FontWeight.w600)),
          ),
        ),
      SizedBox(height: _rowH, width: _dateW, child: Align(alignment: Alignment.centerLeft, child: Text('Total', style: t.labelLarge))),
    ]);
    final body = Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        for (final b in d.barbers)
          SizedBox(
            width: _colW * perBarber,
            height: _headH,
            child: Align(
              alignment: Alignment.centerRight,
              child: Text(b.name, style: t.labelMedium?.copyWith(fontWeight: FontWeight.w600, color: b.active ? null : dim), maxLines: 1, overflow: TextOverflow.ellipsis),
            ),
          ),
        SizedBox(width: _colW * 4, height: _headH, child: Align(alignment: Alignment.centerRight, child: Text('Shop', style: t.labelMedium?.copyWith(fontWeight: FontWeight.w600)))),
      ]),
      Row(children: [
        for (final b in d.barbers) ...[
          head('Sale', color: b.active ? null : dim),
          head('Com.', color: b.active ? null : dim),
          if (showExp) head('Exp.', color: b.active ? null : dim),
        ],
        head('Sale'),
        head('Exp.'),
        head('Com.'),
        head('Profit'),
        const SizedBox(width: 12),
      ]),
      for (final r in rows) line(r),
      line(d.totals, total: true),
    ]);
    return Padding(
      padding: const EdgeInsets.only(left: 12),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        dates,
        Expanded(child: SingleChildScrollView(scrollDirection: Axis.horizontal, child: body)),
      ]),
    );
  }
}
