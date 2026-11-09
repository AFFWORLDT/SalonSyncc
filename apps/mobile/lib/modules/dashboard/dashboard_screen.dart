import 'package:flutter/material.dart';

import '../../core/ui/range_sheet.dart';

import '../../core/screen_cache.dart';
import '../../core/theme/scale.dart';
import '../../core/ui/avatar.dart';
import '../../core/ui/tour.dart';
import '../../core/ui/brand.dart';
import '../../core/ui/count_up.dart';
import '../../core/format/fmt.dart';
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

  String get _key => 'dashboard|${widget.me.org.slug}|$_from|$_to';

  @override
  void initState() {
    super.initState();
    _o = ScreenCache.get<Overview>(_key);
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
        ScreenCache.put(_key, o);
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
      _o = ScreenCache.get<Overview>(_key);
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
    final r = await showSkRangeSheet(context, today: today, initial: _preset == 'Custom' ? DateTimeRange(start: DateTime.parse(_from), end: DateTime.parse(_to)) : null);
    if (r != null) _range('Custom', ymd(r.start), ymd(r.end));
  }

  @override
  Widget build(BuildContext context) {
    final me = widget.me, fmt = me.fmt, t = Theme.of(context).textTheme, cs = Theme.of(context).colorScheme;
    final today = me.today, single = _from == _to;
    final word = single ? (_to == today ? 'today' : 'that day') : 'in range';
    final subtitle = single ? (_to == today ? 'Today, ${fmt.dateLabel(_to)}' : fmt.dateLabel(_to)) : '${fmt.dateLabel(_from)} – ${fmt.dateLabel(_to)}';
    final advanced = me.features.contains('reports_advanced');
    final o = _o;
    final vs = single && _to == today ? 'yesterday' : 'previous period';
    final delta = o == null ? null : deltaText(o.totals.sales, o.prev.sales, vs);
    final profitDelta = o == null ? null : deltaText(o.totals.profit, o.prev.profit, vs);
    final canExpense = widget.onAddCompanyExpense != null && !me.readOnly && me.features.contains('expenses');
    final best = o == null ? 0 : o.perBarber.fold(0, (m, x) => x.sales > m ? x.sales : m);
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: skPagePadding(context, top: 0), children: [
        // Title, date and the range pills, over a soft salon photo on the right.
        Stack(clipBehavior: Clip.none, children: [
          const Positioned(top: -8, right: -SkSpace.gutter, child: _HeaderPhoto()),
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const SizedBox(height: SkSpace.sm),
            Text('Dashboard', style: t.headlineMedium?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.6)),
            const SizedBox(height: 4),
            Row(children: [
              Flexible(child: Text(subtitle, style: t.bodyLarge?.copyWith(color: cs.onSurfaceVariant))),
              if (_to == today) ...[
                const SizedBox(width: 8),
                Container(width: 7, height: 7, decoration: BoxDecoration(color: skPalette(context).success, shape: BoxShape.circle)),
                const SizedBox(width: 6),
                Text('Live', style: t.bodyLarge?.copyWith(color: cs.onSurfaceVariant)),
              ],
            ]),
            const SizedBox(height: SkSpace.lg),
            SizedBox(
              height: 44,
              child: ListView(scrollDirection: Axis.horizontal, clipBehavior: Clip.none, children: [
                for (final (id, days) in advanced ? _presets : _presets.take(1)) ...[
                  _RangePill(label: id, active: _preset == id, onTap: () => _pickPreset(id, days)),
                  const SizedBox(width: SkSpace.sm),
                ],
                if (advanced) _RangePill(label: 'Custom', icon: Icons.calendar_month_outlined, active: _preset == 'Custom', onTap: _custom),
              ]),
            ),
          ]),
        ]),
        const SizedBox(height: SkSpace.xl),
        if (_error != null && o == null)
          ErrorState(error: _error!, onRetry: _load)
        else ...[
          _SalesCard(
            word: word,
            o: o,
            fmt: fmt,
            delta: delta,
            profitDelta: profitDelta,
            onAddExpense: !canExpense ? null : () => widget.onAddCompanyExpense!().then((_) => _load()),
          ),
          if (o != null && o.series.length > 1) ...[
            const SizedBox(height: SkSpace.lg),
            SkBarChart(a: [for (final x in o.series) x.sales], b: [for (final x in o.series) x.profit], height: 110),
            const SizedBox(height: SkSpace.xs),
            Text('${o.seriesByMonth ? 'By month' : 'By day'} · sales and profit', style: t.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
          ],
          const SizedBox(height: SkSpace.lg),
          if (widget.onNewSale != null && !me.readOnly) tourTarget('new-sale', SkGreenButton(label: 'New sale', onPressed: () => widget.onNewSale!().then((_) => _load()))),
          const SizedBox(height: SkSpace.lg),
          if (_setup != null && !me.readOnly) SetupChecklist(slug: me.org.slug, setup: _setup!, withRatings: me.features.contains('ratings')),
          _Section('Barbers $word', action: 'Daily sheet', onAction: widget.onDailySheet),
          if (o == null)
            const SkSkeletonList(count: 3, height: 60)
          else if (o.perBarber.isEmpty)
            const EmptyState(text: 'No barbers yet', icon: Icons.groups_outlined)
          else
            for (final b in o.perBarber)
              Padding(
                padding: const EdgeInsets.only(bottom: SkSpace.md),
                child: SkSoftCard(onTap: widget.onDailySheet, child: _BarberRow(b: b, fmt: fmt, slug: me.org.slug, max: best, single: single)),
              ),
          _Section('Latest sales $word', action: 'All sales', onAction: () => widget.onAllSales(single ? _to : null)),
          if (o == null)
            const SkSkeletonList(count: 3, height: 60)
          else if (o.recent.isEmpty)
            EmptyState(text: 'No sales $word.', icon: Icons.content_cut_rounded)
          else
            for (final s in o.recent.take(8))
              Padding(
                padding: const EdgeInsets.only(bottom: SkSpace.md),
                child: SkSoftCard(child: Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: SaleRow(sale: s, fmt: fmt, showBarber: true, onTap: () => widget.onOpenSale(s).then((_) => _load())))),
              ),
        ],
      ]),
    );
  }
}

/// The deep green brand colours of the sales card (the same in light and dark).
const _deep = kSkDeep, _deeper = kSkDeeper, _mint = kSkMint;

/// A salon photo fading in from the right behind the title (decoration only).
class _HeaderPhoto extends StatelessWidget {
  const _HeaderPhoto();
  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final w = MediaQuery.sizeOf(context).width * 0.5;
    return IgnorePointer(
      child: Opacity(
        opacity: dark ? 0.28 : 0.9,
        child: ShaderMask(
          blendMode: BlendMode.dstIn,
          shaderCallback: (r) => const LinearGradient(colors: [Color(0x00000000), Color(0xFF000000)], stops: [0, 0.55]).createShader(r),
          child: ShaderMask(
            blendMode: BlendMode.dstIn,
            shaderCallback: (r) => const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFF000000), Color(0x00000000)], stops: [0.55, 1]).createShader(r),
            child: Image.asset('assets/brand/sign-in-hero.jpg', width: w, height: 170, fit: BoxFit.cover, alignment: const Alignment(-0.1, 0.2)),
          ),
        ),
      ),
    );
  }
}

/// 1D / 7D / 30D / 1Y / Custom: white pills, the chosen one deep green.
class _RangePill extends StatelessWidget {
  const _RangePill({required this.label, required this.active, required this.onTap, this.icon});
  final String label;
  final bool active;
  final VoidCallback onTap;
  final IconData? icon;
  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final fg = active ? Colors.white : cs.onSurface;
    return Semantics(
      button: true,
      selected: active,
      child: Material(
        color: active ? _deep : cs.surface,
        shape: StadiumBorder(side: BorderSide(color: active ? _deep : cs.outlineVariant.withValues(alpha: 0.7))),
        elevation: active ? 0 : 0.5,
        shadowColor: Colors.black26,
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 18),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              if (icon != null) ...[Icon(icon, size: 18, color: fg), const SizedBox(width: 6)],
              Text(label, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: fg)),
            ]),
          ),
        ),
      ),
    );
  }
}

/// The big green card: sales with the change and customers, then expense, commission and profit in a row.
class _SalesCard extends StatelessWidget {
  const _SalesCard({required this.word, required this.o, required this.fmt, required this.delta, required this.profitDelta, required this.onAddExpense});
  final String word;
  final Overview? o;
  final Fmt fmt;
  final String? delta, profitDelta;
  final VoidCallback? onAddExpense;

  @override
  Widget build(BuildContext context) {
    final o = this.o;
    const white70 = Color(0xB3FFFFFF);
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(26),
        gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [_deep, _deeper]),
        boxShadow: const [BoxShadow(color: Color(0x330A3E32), blurRadius: 24, offset: Offset(0, 12), spreadRadius: -8)],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(children: [
        // A faint sweep of light across the card.
        Positioned(right: -60, top: -40, child: Container(width: 220, height: 220, decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withValues(alpha: 0.05)))),
        Padding(
          padding: const EdgeInsets.fromLTRB(22, 20, 18, 18),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text('Sales $word', style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600))),
              const Icon(Icons.bar_chart_rounded, color: Colors.white, size: 30),
            ]),
            const SizedBox(height: 6),
            o == null
                ? const Padding(padding: EdgeInsets.symmetric(vertical: 8), child: SkSkeleton(height: 38, width: 180))
                : FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerLeft,
                    child: CountUp(value: o.totals.sales, format: fmt.money, style: const TextStyle(color: Colors.white, fontSize: 42, height: 1.1, fontWeight: FontWeight.w800, letterSpacing: -1)),
                  ),
            const SizedBox(height: 12),
            Wrap(spacing: 12, runSpacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
              if (delta != null) _CardDelta(delta!),
              if (o != null) Text('${o.totals.count} customer${o.totals.count == 1 ? '' : 's'}', style: const TextStyle(color: white70, fontSize: 14)),
            ]),
            const SizedBox(height: 16),
            Divider(height: 1, color: Colors.white.withValues(alpha: 0.14)),
            const SizedBox(height: 14),
            IntrinsicHeight(
              child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Expanded(
                  child: _CardStat(
                    icon: Icons.account_balance_wallet_outlined,
                    label: 'Expense $word',
                    value: o?.totals.expense,
                    fmt: fmt,
                    hint: o == null || o.totals.companyExpense == 0 ? null : 'incl. ${fmt.money(o.totals.companyExpense)} company',
                    action: onAddExpense == null
                        ? null
                        : IconButton(
                            tooltip: 'Add company expense',
                            visualDensity: VisualDensity.compact,
                            iconSize: 20,
                            onPressed: onAddExpense,
                            icon: const Icon(Icons.add_circle_rounded, color: _mint),
                          ),
                  ),
                ),
                VerticalDivider(width: 18, color: Colors.white.withValues(alpha: 0.14)),
                Expanded(child: _CardStat(icon: Icons.percent_rounded, label: 'Commission $word', value: o?.totals.commission, fmt: fmt)),
                VerticalDivider(width: 18, color: Colors.white.withValues(alpha: 0.14)),
                Expanded(
                  child: _CardStat(
                    icon: Icons.trending_up_rounded,
                    label: 'Profit $word',
                    value: o?.totals.profit,
                    fmt: fmt,
                    color: o == null ? null : (o.totals.profit < 0 ? const Color(0xFFFF8A80) : _mint),
                    hint: profitDelta,
                  ),
                ),
              ]),
            ),
          ]),
        ),
      ]),
    );
  }
}

/// "↓ 54% vs yesterday" on the green card: soft red or mint.
class _CardDelta extends StatelessWidget {
  const _CardDelta(this.text);
  final String text;
  @override
  Widget build(BuildContext context) {
    final down = text.startsWith('-');
    final c = down ? const Color(0xFFFF8A80) : _mint;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(color: c.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(999)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(down ? Icons.arrow_downward_rounded : Icons.arrow_upward_rounded, size: 15, color: c),
        const SizedBox(width: 4),
        Flexible(child: Text(text.replaceFirst(RegExp(r'^[+-]'), ''), maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: c))),
      ]),
    );
  }
}

/// One of expense / commission / profit on the green card: an icon in a soft circle, the label, the amount.
class _CardStat extends StatelessWidget {
  const _CardStat({required this.icon, required this.label, required this.value, required this.fmt, this.hint, this.color, this.action});
  final IconData icon;
  final String label;
  final int? value;
  final Fmt fmt;
  final String? hint;
  final Color? color;
  final Widget? action;
  @override
  Widget build(BuildContext context) {
    const white70 = Color(0xB3FFFFFF);
    final up = hint != null && !hint!.startsWith('-') && hint!.contains('%');
    return Stack(children: [
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: 30,
          height: 30,
          decoration: BoxDecoration(color: _mint.withValues(alpha: 0.18), shape: BoxShape.circle),
          child: Icon(icon, size: 17, color: _mint),
        ),
        const SizedBox(height: 8),
        Text(label, maxLines: 2, style: const TextStyle(color: white70, fontSize: 12, height: 1.25)),
        const SizedBox(height: 4),
        value == null
            ? const SkSkeleton(height: 18, width: 56)
            : FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: CountUp(value: value!, format: fmt.money, style: TextStyle(color: color ?? Colors.white, fontSize: 17, fontWeight: FontWeight.w800)),
              ),
        if (hint != null) ...[
          const SizedBox(height: 3),
          hint!.contains('%')
              ? Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Padding(padding: const EdgeInsets.only(top: 1), child: Icon(up ? Icons.arrow_upward_rounded : Icons.arrow_downward_rounded, size: 12, color: up ? _mint : const Color(0xFFFF8A80))),
                  const SizedBox(width: 3),
                  Flexible(child: Text(hint!.replaceFirst(RegExp(r'^[+-]'), ''), maxLines: 2, style: const TextStyle(color: white70, fontSize: 11))),
                ])
              : Text(hint!, maxLines: 2, style: const TextStyle(color: white70, fontSize: 11)),
        ],
      ]),
      if (action != null) Positioned(top: -6, right: -8, child: action!),
    ]);
  }
}

/// A section title with a green "Action →" link on the right.
class _Section extends StatelessWidget {
  const _Section(this.label, {required this.action, required this.onAction});
  final String label, action;
  final VoidCallback onAction;
  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme, cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(top: SkSpace.lg, bottom: SkSpace.sm),
      child: Row(children: [
        Expanded(child: Text(label, style: t.titleLarge?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.3))),
        TextButton(
          onPressed: onAction,
          style: TextButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: SkSpace.sm)),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Text(action, style: TextStyle(color: cs.primary, fontWeight: FontWeight.w700, fontSize: 15)),
            const SizedBox(width: 6),
            Icon(Icons.arrow_forward_rounded, size: 18, color: cs.primary),
          ]),
        ),
      ]),
    );
  }
}

/// One barber: photo, name, customers and commission, their sales, a bar for their share of the best, and a chevron.
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
    final sub = ['${b.count} cust', if (b.commission > 0) 'Comm ${fmt.num(b.commission)}', ?expense].join(' • ');
    final roomy = MediaQuery.sizeOf(context).width >= 360; // small phones: smaller photo, no chevron, more room for the name
    return Padding(
      padding: const EdgeInsets.fromLTRB(SkSpace.lg, SkSpace.lg, SkSpace.md, SkSpace.lg),
      child: Row(children: [
        SkAvatar(slug: slug, name: b.name, url: b.avatarUrl, size: roomy ? 52 : 40),
        const SizedBox(width: SkSpace.lg),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(b.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16))),
              Text(fmt.money(b.sales), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            ]),
            const SizedBox(height: 3),
            Text(sub, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant)),
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: max <= 0 ? 0 : b.sales / max,
                minHeight: 5,
                backgroundColor: cs.outlineVariant.withValues(alpha: 0.35),
                color: cs.primary,
              ),
            ),
          ]),
        ),
        if (roomy) ...[
          const SizedBox(width: SkSpace.md),
          Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(color: cs.primary.withValues(alpha: 0.1), shape: BoxShape.circle),
          child: Icon(Icons.chevron_right_rounded, color: cs.primary),
          ),
        ],
      ]),
    );
  }
}
