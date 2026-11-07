import 'package:flutter/material.dart';

import '../../core/theme/scale.dart';
import '../../core/ui/haptics.dart';
import '../../core/ui/avatar.dart';
import '../../core/ui/stats.dart';
import '../../core/ui/tour.dart';
import '../../core/ui/heading.dart';
import '../../core/format/fmt.dart';
import '../../core/theme/app_theme.dart';
import '../../core/ui/bar_chart.dart';
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
    final p = skPalette(context);
    final delta = o == null ? null : deltaText(o.totals.sales, o.prev.sales, vs);
    final profitDelta = o == null ? null : deltaText(o.totals.profit, o.prev.profit, vs);
    final canExpense = widget.onAddCompanyExpense != null && !me.readOnly && me.features.contains('expenses');
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.fromLTRB(SkSpace.gutter, SkSpace.sm, SkSpace.gutter, SkSpace.xxxl), children: [
        SkHeading('Dashboard', subtitle: subtitle, mono: true),
        // Range: 1D 7D 30D 1Y Custom, as small pills.
        SizedBox(
          height: 34,
          child: ListView(scrollDirection: Axis.horizontal, children: [
            for (final (id, days) in advanced ? _presets : _presets.take(1))
              _RangePill(label: id, on: _preset == id, onTap: () => _pickPreset(id, days)),
            if (advanced) _RangePill(label: 'Custom', icon: Icons.date_range_rounded, on: _preset == 'Custom', onTap: _custom),
          ]),
        ),
        const SizedBox(height: SkSpace.xl),
        if (_error != null && o == null)
          ErrorState(error: _error!, onRetry: _load)
        else ...[
          // The one big number.
          SkHero(
            label: 'Sales $word',
            value: o?.totals.sales,
            format: fmt.money,
            chips: [if (delta != null) SkDeltaChip(delta)],
            notes: [if (o != null) '${o.totals.count} customer${o.totals.count == 1 ? '' : 's'}'],
          ),
          if (o != null && o.series.length > 1) ...[
            const SizedBox(height: SkSpace.lg),
            SkBarChart(a: [for (final x in o.series) x.sales], b: [for (final x in o.series) x.profit], height: 110),
            const SizedBox(height: SkSpace.xs),
            Text('${o.seriesByMonth ? 'By month' : 'By day'} · sales and profit', style: t.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
          ],
          const SizedBox(height: SkSpace.lg),
          SkStatStrip(format: fmt.money, stats: [
            SkStat(
              label: 'Expense $word',
              value: o?.totals.expense,
              hint: o == null || o.totals.companyExpense == 0 ? null : 'incl. ${fmt.money(o.totals.companyExpense)} company',
              action: !canExpense
                  ? null
                  : IconButton(
                      tooltip: 'Add company expense',
                      visualDensity: VisualDensity.compact,
                      iconSize: 20,
                      onPressed: () => widget.onAddCompanyExpense!().then((_) => _load()),
                      icon: const Icon(Icons.add_circle_outline_rounded),
                    ),
            ),
            SkStat(label: 'Commission $word', value: o?.totals.commission),
            SkStat(
              label: 'Profit $word',
              value: o?.totals.profit,
              color: o == null ? null : (o.totals.profit < 0 ? cs.error : p.success),
              hint: profitDelta,
            ),
          ]),
          const SizedBox(height: SkSpace.lg),
          if (widget.onNewSale != null && !me.readOnly)
            tourTarget(
              'new-sale',
              FilledButton.icon(
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52), textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                onPressed: () => widget.onNewSale!().then((_) => _load()),
                icon: const Icon(Icons.add_rounded),
                label: const Text('New sale'),
              ),
            ),
          const SizedBox(height: SkSpace.lg),
          if (_setup != null && !me.readOnly) SetupChecklist(slug: me.org.slug, setup: _setup!, withRatings: me.features.contains('ratings')),
          SkSection('Barbers $word', action: 'Daily sheet', onAction: widget.onDailySheet, top: SkSpace.sm),
          if (o == null)
            const SkSkeletonList(count: 3, height: 60)
          else if (o.perBarber.isEmpty)
            const EmptyState(text: 'No barbers yet', icon: Icons.groups_outlined)
          else
            SkFlatList(children: [
              for (final b in o.perBarber) _BarberRow(b: b, fmt: fmt, slug: me.org.slug, max: o.perBarber.fold(0, (m, x) => x.sales > m ? x.sales : m), single: single),
            ]),
          SkSection('Latest sales $word', action: 'All sales', onAction: () => widget.onAllSales(single ? _to : null)),
          if (o == null)
            const SkSkeletonList(count: 3, height: 60)
          else if (o.recent.isEmpty)
            EmptyState(text: 'No sales $word.', icon: Icons.content_cut_rounded)
          else
            SkFlatList(children: [
              for (final s in o.recent.take(8)) SaleRow(sale: s, fmt: fmt, showBarber: true, onTap: () => widget.onOpenSale(s).then((_) => _load())),
            ]),
        ],
      ]),
    );
  }
}

/// A range pill: dark when picked (Groww's tabs), muted otherwise.
class _RangePill extends StatelessWidget {
  const _RangePill({required this.label, required this.on, required this.onTap, this.icon});
  final String label;
  final bool on;
  final VoidCallback onTap;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final fg = on ? cs.surface : cs.onSurfaceVariant;
    return Padding(
      padding: const EdgeInsets.only(right: SkSpace.sm),
      child: Material(
        color: on ? cs.onSurface : cs.surfaceContainerHighest.withValues(alpha: 0.6),
        shape: const StadiumBorder(),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: () {
            Haptic.tap();
            onTap();
          },
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              if (icon != null) ...[Icon(icon, size: 15, color: fg), const SizedBox(width: 4)],
              Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: fg)),
            ]),
          ),
        ),
      ),
    );
  }
}

/// One barber: photo, name, customers / commission / expense, their sales, and a bar for their share of the best.
class _BarberRow extends StatelessWidget {
  const _BarberRow({required this.b, required this.fmt, required this.slug, required this.max, required this.single});
  final BarberDay b;
  final Fmt fmt;
  final String slug;
  final int max;
  final bool single;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final expense = !b.expenseEntered ? null : (single && b.expense == 0 ? 'no expense' : 'exp ${fmt.num(b.expense)}');
    final sub = ['${b.count} cust.', if (b.commission > 0) 'comm ${fmt.num(b.commission)}', ?expense].join(' · ');
    return Padding(
      padding: const EdgeInsets.fromLTRB(SkSpace.lg, SkSpace.md, SkSpace.lg, SkSpace.md),
      child: Row(children: [
        SkAvatar(slug: slug, name: b.name, url: b.avatarUrl, size: 40),
        const SizedBox(width: SkSpace.lg),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(b.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15))),
              Text(fmt.money(b.sales), style: SkText.mono.copyWith(fontWeight: FontWeight.w700, fontSize: 15)),
            ]),
            const SizedBox(height: 2),
            Text(sub, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
            const SizedBox(height: 6),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: max <= 0 ? 0 : b.sales / max,
                minHeight: 4,
                backgroundColor: cs.outlineVariant.withValues(alpha: 0.35),
                color: cs.primary,
              ),
            ),
          ]),
        ),
      ]),
    );
  }
}
