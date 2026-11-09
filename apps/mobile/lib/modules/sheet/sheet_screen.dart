import 'dart:typed_data';

import '../../core/screen_cache.dart';
import '../../data/staff_api.dart';
import '../../core/ui/haptics.dart';
import '../../core/ui/avatar.dart';
import '../../core/theme/scale.dart';
import '../../core/ui/brand.dart';
import '../../core/ui/count_up.dart';
import '../../core/ui/toast.dart';
import '../../core/ui/toggle.dart';
import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/export/daily_xlsx.dart';
import '../../core/format/fmt.dart';
import '../../core/theme/app_theme.dart';
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
  const SheetScreen({super.key, required this.me, required this.reports, required this.onDay, this.shareFile = _shareXlsx, this.staff});
  final Me me;
  final AdminReportsApi reports;

  /// A date was tapped: show that day's sales.
  final ValueChanged<String> onDay;
  final ShareFile shareFile;

  /// For the barbers' photos in "By barber" (optional: initials without it).
  final StaffApi? staff;

  @override
  State<SheetScreen> createState() => _SheetScreenState();
}

class _SheetScreenState extends State<SheetScreen> {
  late final String _current = widget.me.today.substring(0, 7);
  late String _month;
  DailySheet? _d;
  Object? _error;
  bool _showExp = false, _exporting = false;

  /// What the table shows: everything, the shop's columns only, or one barber.
  String _view = 'all';
  int? _barberId;
  Map<int, String?> _avatars = const {};
  int _seq = 0;

  @override
  void initState() {
    super.initState();
    _month = sheetMonthRequest.value ?? _current; // read before clearing the request
    sheetMonthRequest.value = null;
    sheetMonthRequest.addListener(_asked);
    _load();
    widget.staff?.list().then((l) => mounted ? setState(() => _avatars = {for (final x in l) x.id: x.avatarUrl}) : null, onError: (_) {});
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
    final key = 'sheet|${widget.me.org.slug}|$_month';
    final cached = ScreenCache.get<DailySheet>(key);
    if (cached != null) fillFromCache(setState, () => _d = cached);
    try {
      final d = await widget.reports.daily(_month);
      ScreenCache.put(key, d);
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
      if (mounted) showSkToast(context, messageOf(e), kind: ToastKind.error);
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = widget.me, fmt = me.fmt, t = Theme.of(context).textTheme, cs = Theme.of(context).colorScheme;
    final d = _d;
    final barber = d == null ? null : d.barbers.where((b) => b.id == _barberId).firstOrNull ?? (d.barbers.isEmpty ? null : d.barbers.first);
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: skPagePadding(context), children: [
        // Title with its icon, then the month and Excel.
        Row(children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(color: kSkDeep.withValues(alpha: 0.1), shape: BoxShape.circle),
            child: Icon(Icons.calendar_month_rounded, size: 28, color: Theme.of(context).brightness == Brightness.dark ? kSkMint : kSkDeep),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Daily sheet', style: t.headlineMedium?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.6)),
              Text('Track your salon performance', style: t.bodyMedium?.copyWith(color: cs.onSurfaceVariant)),
            ]),
          ),
        ]),
        const SizedBox(height: SkSpace.lg),
        Row(children: [
          // ‹ November 2026 › in one pill.
          Expanded(
            child: Material(
            color: cs.surface,
            shape: StadiumBorder(side: BorderSide(color: cs.outlineVariant.withValues(alpha: 0.7))),
            child: Row(children: [
              IconButton(tooltip: 'Previous month', onPressed: () => _go(prevMonth(_month)), icon: const Icon(Icons.chevron_left_rounded)),
              Expanded(
                child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Icon(Icons.calendar_month_outlined, size: 18, color: cs.onSurfaceVariant),
                  const SizedBox(width: 6),
                  Flexible(child: Text(fmt.monthLabel(_month), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600))),
                ]),
              ),
              IconButton(tooltip: 'Next month', onPressed: _month == _current ? null : () => _go(nextMonth(_month)), icon: const Icon(Icons.chevron_right_rounded)),
            ]),
            ),
          ),
        ]),
        const SizedBox(height: SkSpace.lg),
        if (_error != null && d == null)
          ErrorState(error: _error!, onRetry: _load)
        else ...[
          _Summary(d: d, fmt: fmt),
          const SizedBox(height: SkSpace.lg),
          // What the table shows.
          SizedBox(
            height: 48,
            child: ListView(scrollDirection: Axis.horizontal, children: [
              for (final (id, label, icon) in const [('all', 'Full sheet', Icons.grid_on_rounded), ('shop', 'Shop', Icons.storefront_outlined), ('barber', 'By barber', Icons.person_outline_rounded)]) ...[
                SkChoicePill(key: ValueKey('view-$id'), label: label, icon: icon, active: _view == id, onTap: () => setState(() => _view = id)),
                const SizedBox(width: SkSpace.sm),
              ],
              if (me.features.contains('excel_export'))
                OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(shape: const StadiumBorder(), minimumSize: const Size(0, 48)),
                  onPressed: d == null || _exporting ? null : _excel,
                  icon: const Icon(Icons.table_view_outlined),
                  label: Text(_exporting ? 'Preparing…' : 'Excel'),
                ),
            ]),
          ),
          if (_view == 'barber' && d != null && d.barbers.isNotEmpty) ...[
            const SizedBox(height: SkSpace.md),
            SizedBox(
              height: 76,
              child: ListView(scrollDirection: Axis.horizontal, children: [
                for (final b in d.barbers)
                  _BarberChoice(slug: me.org.slug, b: b, url: _avatars[b.id], on: b.id == barber?.id, onTap: () => setState(() => _barberId = b.id)),
              ]),
            ),
          ],
          if (_view != 'shop')
            SkSwitchTile(
              contentPadding: EdgeInsets.zero,
              title: const Text("Show each barber's expense"),
              value: _showExp,
              onChanged: (v) => setState(() => _showExp = v),
            )
          else
            const SizedBox(height: SkSpace.md),
          if (d == null)
            const SkSkeleton(height: 240, radius: 18)
          else
            SkSoftCard(
              radius: 24,
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: _Table(
                d: d,
                me: me,
                showExp: _showExp && _view != 'shop',
                onDay: widget.onDay,
                barbers: switch (_view) { 'shop' => const [], 'barber' => [?barber], _ => d.barbers },
                shop: _view != 'barber',
              ),
            ),
          const SizedBox(height: SkSpace.lg),
          // How to read it, on a soft mint card.
          Container(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            decoration: BoxDecoration(
              color: kSkDeep.withValues(alpha: Theme.of(context).brightness == Brightness.dark ? 0.18 : 0.07),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(Icons.info_rounded, color: Theme.of(context).brightness == Brightness.dark ? kSkMint : kSkDeep),
              const SizedBox(width: 10),
              Expanded(child: Text(kSheetNote.replaceAll('{CUR}', fmt.currency), style: t.bodySmall?.copyWith(color: cs.onSurfaceVariant, height: 1.4))),
            ]),
          ),
        ],
      ]),
    );
  }
}

/// The month at a glance: the total sale large, then expense, commission and profit, each with its icon.
class _Summary extends StatelessWidget {
  const _Summary({required this.d, required this.fmt});
  final DailySheet? d;
  final Fmt fmt;

  @override
  Widget build(BuildContext context) {
    final d = this.d, cs = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final green = dark ? kSkMint : kSkDeep;
    Widget stat(IconData icon, String label, int? v, {Color? color, String? hint}) => Expanded(
          child: Column(children: [
            Icon(icon, size: 24, color: green),
            const SizedBox(height: 6),
            Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
            const SizedBox(height: 2),
            v == null
                ? const SkSkeleton(height: 18, width: 56)
                : FittedBox(fit: BoxFit.scaleDown, child: CountUp(value: v, format: fmt.money, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: color))),
            if (hint != null) Text(hint, textAlign: TextAlign.center, maxLines: 2, style: TextStyle(fontSize: 10.5, color: cs.onSurfaceVariant)),
          ]),
        );
    final divider = VerticalDivider(width: 12, color: cs.outlineVariant.withValues(alpha: 0.6));
    return SkSoftCard(
      radius: 24,
      padding: const EdgeInsets.fromLTRB(18, 16, 12, 16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Total sale', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: cs.onSurfaceVariant)),
        const SizedBox(height: 2),
        d == null
            ? const Padding(padding: EdgeInsets.symmetric(vertical: 6), child: SkSkeleton(height: 34, width: 160))
            : FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: CountUp(value: d.totals.sales, format: fmt.money, style: const TextStyle(fontSize: 34, height: 1.15, fontWeight: FontWeight.w800, letterSpacing: -1)),
              ),
        const SizedBox(height: 12),
        Divider(height: 1, color: cs.outlineVariant.withValues(alpha: 0.6)),
        const SizedBox(height: 12),
        IntrinsicHeight(
          child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            stat(Icons.account_balance_wallet_outlined, 'Expense', d?.totals.expense, hint: d == null || d.totals.companyExpense == 0 ? null : 'incl. ${fmt.money(d.totals.companyExpense)} company'),
            divider,
            stat(Icons.groups_outlined, 'Commission', d?.totals.commission),
            divider,
            stat(Icons.insights_rounded, 'Profit', d?.totals.profit, color: d == null ? null : (d.totals.profit < 0 ? cs.error : (dark ? kSkMint : skPalette(context).success))),
          ]),
        ),
      ]),
    );
  }
}

/// A barber to show in "By barber": photo and name, ringed when picked.
class _BarberChoice extends StatelessWidget {
  const _BarberChoice({required this.slug, required this.b, required this.url, required this.on, required this.onTap});
  final String slug;
  final SheetBarber b;
  final String? url;
  final bool on;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return InkWell(
      borderRadius: BorderRadius.circular(SkRadius.md),
      onTap: () {
        Haptic.select();
        onTap();
      },
      child: SizedBox(
        width: 68,
        child: Column(children: [
          Container(
            padding: const EdgeInsets.all(2),
            decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: on ? cs.primary : Colors.transparent, width: 2)),
            child: SkAvatar(slug: slug, name: b.name, url: url, size: 44),
          ),
          const SizedBox(height: 4),
          Text(b.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, fontWeight: on ? FontWeight.w700 : FontWeight.w500, color: on ? cs.primary : null)),
        ]),
      ),
    );
  }
}

class _Table extends StatelessWidget {
  const _Table({required this.d, required this.me, required this.showExp, required this.onDay, required this.barbers, this.shop = true});
  final DailySheet d;
  final Me me;
  final bool showExp;
  final ValueChanged<String> onDay;

  /// The barber columns to show, and whether the shop's four columns follow them.
  final List<SheetBarber> barbers;
  final bool shop;

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
          for (final b in barbers) ...[
            num(r.cellFor(b.id).sales, bold: total, color: muted ?? (b.active ? null : dim)),
            num(r.cellFor(b.id).commission, bold: total, color: muted ?? (b.active ? null : dim)),
            if (showExp) num(r.cellFor(b.id).expense, bold: total, color: muted ?? (b.active ? null : dim)),
          ],
          if (shop) ...[
            num(r.sales, bold: true, color: muted),
            num(r.expense, bold: total, color: muted),
            num(r.commission, bold: total, color: muted),
            num(r.profit, bold: true, color: muted ?? (r.profit < 0 ? cs.error : null)),
          ],
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
        for (final b in barbers)
          SizedBox(
            width: _colW * perBarber,
            height: _headH,
            child: Align(
              alignment: Alignment.centerRight,
              child: Text(b.name, style: t.labelMedium?.copyWith(fontWeight: FontWeight.w600, color: b.active ? null : dim), maxLines: 1, overflow: TextOverflow.ellipsis),
            ),
          ),
        if (shop) SizedBox(width: _colW * 4, height: _headH, child: Align(alignment: Alignment.centerRight, child: Text('Shop', style: t.labelMedium?.copyWith(fontWeight: FontWeight.w600)))),
      ]),
      Row(children: [
        for (final b in barbers) ...[
          head('Sale', color: b.active ? null : dim),
          head('Com.', color: b.active ? null : dim),
          if (showExp) head('Exp.', color: b.active ? null : dim),
        ],
        if (shop) ...[head('Sale'), head('Exp.'), head('Com.'), head('Profit')],
        const SizedBox(width: 12),
      ]),
      for (final r in rows) line(r),
      line(d.totals, total: true),
    ]);
    return Padding(
      padding: const EdgeInsets.only(left: 12),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        dates,
        Expanded(child: _SwipeHint(child: body)),
      ]),
    );
  }
}

/// A sideways scroller that says so: while there is more to the right, the edge fades and "Swipe for more" shows.
class _SwipeHint extends StatefulWidget {
  const _SwipeHint({required this.child});
  final Widget child;

  @override
  State<_SwipeHint> createState() => _SwipeHintState();
}

class _SwipeHintState extends State<_SwipeHint> {
  final _c = ScrollController();
  bool _more = false;

  @override
  void initState() {
    super.initState();
    _c.addListener(_check);
    WidgetsBinding.instance.addPostFrameCallback((_) => _check());
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  void _check() {
    if (!_c.hasClients) return;
    final more = _c.position.extentAfter > 8;
    if (more != _more && mounted) setState(() => _more = more);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final bg = cs.surface;
    return NotificationListener<ScrollMetricsNotification>(
      onNotification: (_) {
        WidgetsBinding.instance.addPostFrameCallback((_) => _check());
        return false;
      },
      child: Stack(children: [
        SingleChildScrollView(controller: _c, scrollDirection: Axis.horizontal, child: widget.child),
        IgnorePointer(
          child: AnimatedOpacity(
            opacity: _more ? 1 : 0,
            duration: const Duration(milliseconds: 160),
            child: Align(
              alignment: Alignment.centerRight,
              child: Container(
                width: 36,
                decoration: BoxDecoration(gradient: LinearGradient(colors: [bg.withValues(alpha: 0), bg.withValues(alpha: 0.95)])),
              ),
            ),
          ),
        ),
        // Bottom-right, below the names, so it never covers a barber's header.
        Positioned(
          right: 6,
          bottom: 4,
          child: AnimatedOpacity(
            opacity: _more ? 1 : 0,
            duration: const Duration(milliseconds: 160),
            child: IgnorePointer(
              ignoring: !_more,
              child: GestureDetector(
                onTap: () => _c.animateTo(_c.position.maxScrollExtent, duration: const Duration(milliseconds: 350), curve: Curves.easeOutCubic),
                child: Container(
                  key: const ValueKey('swipe-hint'),
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(color: cs.primary, borderRadius: BorderRadius.circular(999)),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Text('Swipe for more', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: cs.onPrimary)),
                    Icon(Icons.chevron_right_rounded, size: 14, color: cs.onPrimary),
                  ]),
                ),
              ),
            ),
          ),
        ),
      ]),
    );
  }
}
