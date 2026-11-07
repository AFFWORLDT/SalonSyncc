import 'package:flutter/material.dart';

import '../../core/ui/tour.dart';
import '../../core/ui/heading.dart';
import '../../core/format/fmt.dart';
import '../../core/theme/app_theme.dart';
import '../../core/ui/bar_chart.dart';
import '../../core/ui/count_up.dart';
import '../../core/ui/glass.dart';
import '../../core/ui/states.dart';
import '../../data/admin_reports_api.dart';
import '../../models/me.dart';
import '../../models/overview.dart';
import '../../models/sale.dart';
import '../../models/setup.dart';
import '../today/sale_row.dart';
import 'setup_checklist.dart';

/// "+x% vs label" as the web shows it (one decimal under 10%); null when there is nothing to compare with.
String? deltaText(int now, int before, String label) {
  if (before == 0 && now != 0) return null;
  final d = before == 0 ? 0.0 : (now - before) / before.abs() * 100;
  return '${d >= 0 ? '+' : ''}${d.toStringAsFixed(d.abs() < 10 ? 1 : 0)}% vs $label';
}

String ymd(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// The owner's dashboard: sales, expense, commission and profit for a day or a range, per barber, the latest sales.
/// The last overview per salon and range, so the tab opens filled and refreshes quietly (tests clear it).
final dashboardCache = <String, Overview>{};

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({
    super.key,
    required this.me,
    required this.reports,
    required this.onOpenSale,
    required this.onAllSales,
    required this.onDailySheet,
    this.onNewSale,
    this.onAddCompanyExpense,
  });
  final Me me;
  final AdminReportsApi reports;
  final Future<void> Function(Sale sale) onOpenSale;
  final void Function(String? day) onAllSales;
  final VoidCallback onDailySheet;

  /// Opens the new-sale sheet; resolves when it closes.
  final Future<void> Function()? onNewSale;

  /// Opens "Add company expense"; resolves when it closes.
  final Future<void> Function()? onAddCompanyExpense;

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

const _presets = [('1D', 1), ('7D', 7), ('30D', 30), ('1Y', 365)];

class _DashboardScreenState extends State<DashboardScreen> {
  late String _from = widget.me.today, _to = widget.me.today;
  String _preset = '1D';
  Overview? _o;
  SetupState? _setup;
  Object? _error;
  int _seq = 0;

  String get _key => '${widget.me.org.slug}|$_from|$_to';

  @override
  void initState() {
    super.initState();
    _o = dashboardCache[_key];
    _load();
    widget.reports.setup().then((s) => mounted ? setState(() => _setup = s) : null, onError: (_) {});
  }

  @override
  void didUpdateWidget(DashboardScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.me.today != widget.me.today && _preset == '1D') {
      _range('1D', widget.me.today, widget.me.today);
    }
  }

  Future<void> _load() async {
    final n = ++_seq;
    try {
      final o = await widget.reports.overview(_from, _to);
      if (mounted && n == _seq) {
        dashboardCache[_key] = o;
        setState(() {
          _o = o;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted && n == _seq) setState(() => _error = e);
    }
  }

  void _range(String preset, String from, String to) {
    setState(() {
      _preset = preset;
      _from = from;
      _to = to;
      _o = dashboardCache[_key];
      _error = null;
    });
    _load();
  }

  void _pickPreset(String id, int days) {
    final to = DateTime.parse(widget.me.today);
    _range(id, ymd(to.subtract(Duration(days: days - 1))), widget.me.today);
  }

  Future<void> _custom() async {
    final today = DateTime.parse(widget.me.today);
    final r = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: today,
      initialDateRange: DateTimeRange(start: DateTime.parse(_from), end: DateTime.parse(_to)),
    );
    if (r != null) _range('Custom', ymd(r.start), ymd(r.end));
  }

  @override
  Widget build(BuildContext context) {
    final me = widget.me, fmt = me.fmt, t = Theme.of(context).textTheme, cs = Theme.of(context).colorScheme;
    final today = me.today, single = _from == _to;
    final word = single ? (_to == today ? 'today' : 'that day') : 'in range';
    final subtitle = (single ? (_to == today ? 'Today, ${fmt.dateLabel(_to)}' : fmt.dateLabel(_to)) : '${fmt.dateLabel(_from)} – ${fmt.dateLabel(_to)}') +
        (_to == today ? ' · live' : '');
    final advanced = me.features.contains('reports_advanced');
    final o = _o;
    final vs = single && _to == today ? 'yesterday' : 'previous period';
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 16, 16, 32), children: [
        SkHeading('Dashboard', subtitle: subtitle, mono: true),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(children: [
            for (final (id, days) in advanced ? _presets : _presets.take(1))
              Padding(padding: const EdgeInsets.only(right: 8), child: ChoiceChip(label: Text(id), selected: _preset == id, onSelected: (_) => _pickPreset(id, days))),
            if (advanced) ChoiceChip(label: const Text('Custom'), selected: _preset == 'Custom', onSelected: (_) => _custom()),
          ]),
        ),
        const SizedBox(height: 12),
        if (widget.onNewSale != null && !me.readOnly) ...[
          tourTarget(
            'new-sale',
            FilledButton.icon(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
              onPressed: () => widget.onNewSale!().then((_) => _load()),
              icon: const Icon(Icons.add_rounded),
              label: const Text('New sale'),
            ),
          ),
          const SizedBox(height: 12),
        ],
        if (_setup != null && !me.readOnly) SetupChecklist(slug: me.org.slug, setup: _setup!, withRatings: me.features.contains('ratings')),
        if (_error != null && o == null)
          ErrorState(error: _error!, onRetry: _load)
        else ...[
          _tile(context, 'Sales $word', o?.totals.sales, big: true,
              hint: o == null ? null : ['${o.totals.count} customer${o.totals.count == 1 ? '' : 's'}', ?deltaText(o.totals.sales, o.prev.sales, vs)].join(' · ')),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(
              child: _tile(context, 'Expense $word', o?.totals.expense,
                  hint: o == null || o.totals.companyExpense == 0 ? null : 'incl. ${fmt.money(o.totals.companyExpense)} company',
                  action: widget.onAddCompanyExpense == null || me.readOnly || !me.features.contains('expenses')
                      ? null
                      : IconButton(
                          tooltip: 'Add company expense',
                          visualDensity: VisualDensity.compact,
                          onPressed: () => widget.onAddCompanyExpense!().then((_) => _load()),
                          icon: const Icon(Icons.add_circle_outline_rounded),
                        )),
            ),
            const SizedBox(width: 10),
            Expanded(child: _tile(context, 'Commission $word', o?.totals.commission)),
          ]),
          const SizedBox(height: 10),
          _tile(context, 'Profit $word', o?.totals.profit,
              color: o == null ? null : (o.totals.profit < 0 ? cs.error : cs.primary), hint: o == null ? null : deltaText(o.totals.profit, o.prev.profit, vs)),
          const SizedBox(height: 18),
          _section(context, 'Barbers $word', 'Daily sheet →', widget.onDailySheet),
          if (o == null)
            const SkSkeleton(height: 120, radius: 24)
          else
            SkGlass(blur: false, padding: const EdgeInsets.symmetric(vertical: 8), child: _BarbersTable(rows: o.perBarber, fmt: fmt, single: single)),
          const SizedBox(height: 18),
          _section(context, 'Latest sales $word', 'All sales →', () => widget.onAllSales(single ? _to : null)),
          if (o == null)
            for (var i = 0; i < 3; i++) const Padding(padding: EdgeInsets.symmetric(vertical: 6), child: SkSkeleton(height: 56))
          else if (o.recent.isEmpty)
            EmptyState(text: 'No sales $word.', icon: Icons.content_cut_rounded)
          else
            SkGlass(blur: false, 
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Column(children: [
                for (final s in o.recent.take(8)) SaleRow(sale: s, fmt: fmt, showBarber: true, onTap: () => widget.onOpenSale(s).then((_) => _load())),
              ]),
            ),
          if (o != null && o.series.length > 1) ...[
            const SizedBox(height: 18),
            SkGlass(blur: false, 
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(o.seriesByMonth ? 'By month' : 'By day', style: t.titleSmall),
                Text('${fmt.money(o.totals.sales)} sales, ${fmt.money(o.totals.profit)} profit', style: t.bodySmall),
                const SizedBox(height: 12),
                SkBarChart(a: [for (final p in o.series) p.sales], b: [for (final p in o.series) p.profit]),
              ]),
            ),
          ],
        ],
      ]),
    );
  }

  Widget _section(BuildContext context, String title, String link, VoidCallback onTap) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Row(children: [
          Expanded(child: Text(title, style: Theme.of(context).textTheme.titleMedium)),
          TextButton(onPressed: onTap, child: Text(link)),
        ]),
      );

  Widget _tile(BuildContext context, String label, int? v, {String? hint, bool big = false, Color? color, Widget? action}) {
    final t = Theme.of(context).textTheme, fmt = widget.me.fmt;
    return SkGlass(blur: false, 
      padding: EdgeInsets.fromLTRB(16, 14, action == null ? 16 : 4, 14),
      child: Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: t.labelMedium?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant)),
            const SizedBox(height: 4),
            v == null
                ? SkSkeleton(height: big ? 30 : 20, width: 90)
                : CountUp(value: v, format: fmt.money, style: SkText.mono.copyWith(fontSize: big ? 28 : 17, fontWeight: FontWeight.w700, color: color)),
            if (hint != null) ...[const SizedBox(height: 2), Text(hint, style: t.bodySmall)],
          ]),
        ),
        ?action,
      ]),
    );
  }
}

class _BarbersTable extends StatelessWidget {
  const _BarbersTable({required this.rows, required this.fmt, required this.single});
  final List<BarberDay> rows;
  final Fmt fmt;
  final bool single;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final h = t.labelSmall;
    if (rows.isEmpty) return const EmptyState(text: 'No barbers yet');
    // Narrow phones (under ~380 dp): customers move under the name so names keep room.
    return LayoutBuilder(builder: (context, box) {
      final narrow = box.maxWidth < 380;
      final colW = narrow ? 56.0 : 66.0;
      Widget row(Widget name, List<Widget> cols) => Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
            child: Row(children: [
              Expanded(child: name),
              for (final (i, c) in cols.indexed) SizedBox(width: !narrow && i == 0 ? 44 : colW, child: Align(alignment: Alignment.centerRight, child: c)),
            ]),
          );
      return Column(children: [
        row(Text('Barber', style: h), [if (!narrow) Text('Cust.', style: h), Text('Sales', style: h), Text('Comm.', style: h), Text('Exp.', style: h)]),
        for (final b in rows)
          row(
            narrow
                ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(b.name, maxLines: 1, overflow: TextOverflow.ellipsis),
                    Text('${b.count} cust.', style: t.bodySmall),
                  ])
                : Text(b.name, maxLines: 1, overflow: TextOverflow.ellipsis),
            [
              if (!narrow) Text('${b.count}', style: SkText.mono),
            Text(fmt.num(b.sales), style: SkText.mono.copyWith(fontWeight: FontWeight.w600)),
            Text(fmt.num(b.commission, dash: true), style: SkText.mono),
            !b.expenseEntered
                ? Text('–', style: SkText.mono)
                : single && b.expense == 0
                    ? const Icon(Icons.check_rounded, size: 16)
                    : Text(fmt.num(b.expense, dash: true), style: SkText.mono),
            ],
          ),
      ]);
    });
  }
}
