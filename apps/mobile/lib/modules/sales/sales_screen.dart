import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/screen_cache.dart';
import '../../core/theme/scale.dart';
import '../../core/ui/brand.dart';
import '../../core/format/fmt.dart';
import '../../core/theme/app_theme.dart';
import '../../core/ui/filter_chip_menu.dart';
import '../../core/ui/states.dart';
import '../../data/sales_api.dart';
import '../../data/staff_api.dart';
import '../../models/me.dart';
import '../../models/paged.dart';
import '../../models/sale.dart';
import '../../models/staff.dart';
import '../../shell/nav.dart';
import '../dashboard/dashboard_screen.dart' show ymd;
import '../today/sale_row.dart';

const kSalesPage = 50;

/// Every sale, filtered by day, barber and payment; 50 at a time.
class SalesScreen extends StatefulWidget {
  const SalesScreen({super.key, required this.me, required this.sales, required this.staff, required this.onOpen, required this.onNewSale});
  final Me me;
  final SalesApi sales;
  final StaffApi staff;
  final Future<void> Function(Sale sale) onOpen;
  final Future<void> Function() onNewSale;

  @override
  State<SalesScreen> createState() => _SalesScreenState();
}

class _SalesScreenState extends State<SalesScreen> {
  String? _day = salesDayRequest.value;
  int? _barber;
  String? _payment;
  String _q = '';
  Timer? _typing;
  List<Staff> _staff = const [];
  Paged<Sale>? _last;
  List<Sale> _items = const [];
  int _page = 1;
  Object? _error;
  int _seq = 0;

  @override
  void initState() {
    super.initState();
    salesDayRequest.value = null;
    salesDayRequest.addListener(_asked);
    widget.staff.list().then((l) => mounted ? setState(() => _staff = l) : null, onError: (_) {});
    _load();
  }

  @override
  void dispose() {
    salesDayRequest.removeListener(_asked);
    _typing?.cancel();
    super.dispose();
  }

  /// Opened again from the dashboard or the daily sheet for one day.
  void _asked() {
    final d = salesDayRequest.value;
    if (d == null) return;
    salesDayRequest.value = null;
    _set(() => _day = d);
  }

  void _set(VoidCallback change) {
    setState(change);
    _load();
  }

  Future<void> _load({int page = 1}) async {
    final n = ++_seq;
    final key = 'sales|${widget.me.org.slug}|$_day|$_barber|$_payment|$_q';
    final cached = page == 1 ? ScreenCache.get<Paged<Sale>>(key) : null;
    if (cached != null) {
      fillFromCache(setState, () {
        _last = cached;
        _items = cached.items;
        _page = 1;
      });
    }
    try {
      final p = await widget.sales.search(q: _q, day: _day, barberId: _barber, payment: _payment, page: page, pageSize: kSalesPage);
      if (page == 1) ScreenCache.put(key, p);
      if (!mounted || n != _seq) return;
      setState(() {
        _last = p;
        _page = page;
        _items = page == 1 ? p.items : [..._items, ...p.items.where((s) => !_items.any((x) => x.id == s.id))];
        _error = null;
      });
    } catch (e) {
      if (mounted && n == _seq) setState(() => _error = e);
    }
  }

  Future<void> _pickDay() async {
    final today = DateTime.parse(widget.me.today);
    final d = await showDatePicker(context: context, firstDate: DateTime(2020), lastDate: today, initialDate: _day == null ? today : DateTime.parse(_day!));
    if (d != null) _set(() => _day = ymd(d));
  }

  /// Search as you type, a moment after the last key.
  void _search(String v) {
    _typing?.cancel();
    _typing = Timer(const Duration(milliseconds: 350), () {
      if (mounted && v.trim() != _q) _set(() => _q = v.trim());
    });
  }

  bool _more = false;

  /// Next page when the list is scrolled near its end.
  bool _onScroll(ScrollNotification n) {
    final p = _last;
    if (p != null && !_more && p.total > _items.length && n.metrics.extentAfter < 400) {
      _more = true;
      _load(page: _page + 1).whenComplete(() => _more = false);
    }
    return false;
  }

  @override
  Widget build(BuildContext context) {
    final fmt = widget.me.fmt, t = Theme.of(context).textTheme, cs = Theme.of(context).colorScheme;
    final p = _last;
    // Grouped by day (newest first, as the API sends them), each with its own total.
    final days = <String, List<Sale>>{};
    for (final s in _items) {
      (days[s.day] ??= []).add(s);
    }
    final total = p?.sum ?? 0, count = p?.total ?? 0;
    return NotificationListener<ScrollNotification>(
      onNotification: _onScroll,
      child: RefreshIndicator(
        onRefresh: _load,
        child: ListView(padding: const EdgeInsets.fromLTRB(SkSpace.gutter, SkSpace.sm, SkSpace.gutter, SkSpace.xxxl), children: [
          // Title, a line under it, and the day on the right.
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Sales', style: t.headlineMedium?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.6)),
                const SizedBox(height: 2),
                Text('Track and manage your salon sales', style: t.bodyMedium?.copyWith(color: cs.onSurfaceVariant)),
              ]),
            ),
            const SizedBox(width: SkSpace.sm),
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: SizedBox(
                height: 40,
                child: SkFilterPill(
                  label: _day == null ? 'All days' : fmt.dayLabel(_day!),
                  icon: Icons.calendar_month_outlined,
                  active: _day != null,
                  onTap: _pickDay,
                  clearTooltip: 'All days',
                  onClear: () => _set(() => _day = null),
                ),
              ),
            ),
          ]),
          const SizedBox(height: SkSpace.lg),
          if (_error != null && p == null)
            ErrorState(error: _error!, onRetry: _load)
          else ...[
            // Bills, average bill and the total (green) for the filter.
            IntrinsicHeight(
              child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Expanded(child: _Tile(icon: Icons.receipt_long_rounded, label: 'Bills', text: p == null ? null : '$count', tint: const Color(0xFF2E8B6F))),
                const SizedBox(width: SkSpace.sm),
                Expanded(child: _Tile(icon: Icons.toll_rounded, label: 'Average bill', text: p == null ? null : fmt.money(count == 0 ? 0 : (total / count).round()), tint: kSkGold)),
                const SizedBox(width: SkSpace.sm),
                Expanded(child: _Tile(icon: Icons.insights_rounded, label: 'Total', text: p == null ? null : fmt.money(total), green: true)),
              ]),
            ),
            const SizedBox(height: SkSpace.lg),
            if (!widget.me.readOnly) SkGreenButton(label: 'New sale', onPressed: () => widget.onNewSale().then((_) => _load())),
            const SizedBox(height: SkSpace.lg),
            SkSoftCard(
              radius: 26,
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(18, 16, 18, 10),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                    Expanded(child: Text('Sales list', style: t.titleLarge?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.3))),
                    if (p != null) Text('$count sale${count == 1 ? '' : 's'}', style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant)),
                  ]),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                  child: SizedBox(
                    height: 48,
                    child: TextField(
                      key: const ValueKey('sales-search'),
                      onChanged: _search,
                      textInputAction: TextInputAction.search,
                      decoration: InputDecoration(
                        hintText: 'Search sales…',
                        prefixIcon: const Icon(Icons.search_rounded, size: 20),
                        contentPadding: EdgeInsets.zero,
                        filled: true,
                        fillColor: cs.surfaceContainerHighest.withValues(alpha: 0.6),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(999), borderSide: BorderSide.none),
                        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(999), borderSide: BorderSide.none),
                        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(999), borderSide: BorderSide(color: cs.primary, width: 1.4)),
                      ),
                    ),
                  ),
                ),
                // Barber and payment filters.
                SizedBox(
                  height: 50,
                  child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.fromLTRB(14, 8, 14, 4), children: [
                    ChipMenu<int?>(
                      value: _barber,
                      icon: Icons.person_outline_rounded,
                      items: [(null, 'All barbers'), for (final s in _staff) (s.id, s.active ? s.name : '${s.name} (inactive)')],
                      onChanged: (v) => _set(() => _barber = v),
                    ),
                    const SizedBox(width: SkSpace.sm),
                    ChipMenu<String?>(
                      value: _payment,
                      icon: Icons.payments_outlined,
                      items: const [(null, 'Cash + card'), ('cash', 'Cash'), ('card', 'Card')],
                      onChanged: (v) => _set(() => _payment = v),
                    ),
                  ]),
                ),
                if (p == null)
                  const Padding(padding: EdgeInsets.all(14), child: SkSkeletonList(count: 5, height: 60))
                else if (_items.isEmpty)
                  const Padding(padding: EdgeInsets.symmetric(vertical: 24), child: EmptyState(text: 'No sales match.', icon: Icons.search_off_rounded))
                else
                  for (final MapEntry(key: day, value: list) in days.entries) ...[
                    if (_day == null)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(18, 12, 18, 4),
                        child: Row(children: [
                          Expanded(child: Text(day == widget.me.today ? 'Today' : fmt.dayLabel(day), style: TextStyle(fontWeight: FontWeight.w700, color: cs.onSurfaceVariant))),
                          Text(fmt.money(list.fold(0, (sum, x) => sum + x.amount)), style: SkText.mono.copyWith(fontSize: 13, color: cs.onSurfaceVariant)),
                        ]),
                      ),
                    for (var i = 0; i < list.length; i++) ...[
                      if (i > 0) Divider(height: 1, indent: 18, endIndent: 18, color: cs.outlineVariant.withValues(alpha: 0.45)),
                      _SaleItem(sale: list[i], fmt: fmt, today: widget.me.today, onTap: () => widget.onOpen(list[i]).then((_) => _load())),
                    ],
                  ],
                if (p != null && _items.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(18, 8, 14, 14),
                    child: Row(children: [
                      Expanded(child: Text('Showing ${_items.length} of $count', style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant))),
                      if (count > _items.length)
                        OutlinedButton.icon(
                          style: OutlinedButton.styleFrom(shape: const StadiumBorder(), side: BorderSide(color: cs.primary.withValues(alpha: 0.5))),
                          onPressed: () => _load(page: _page + 1),
                          icon: const Icon(Icons.expand_more_rounded, size: 18),
                          label: const Text('Show more'),
                        ),
                    ]),
                  ),
              ]),
            ),
          ],
        ]),
      ),
    );
  }
}

/// A small stat card: an icon in a tinted circle, a label and a value; [green] is the deep green highlight.
class _Tile extends StatelessWidget {
  const _Tile({required this.icon, required this.label, required this.text, this.tint = kSkDeep, this.green = false});
  final IconData icon;
  final String label;
  final String? text;
  final Color tint;
  final bool green;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final fg = green ? Colors.white : cs.onSurface;
    final body = Padding(
      padding: const EdgeInsets.fromLTRB(12, 14, 10, 14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(color: (green ? kSkMint : tint).withValues(alpha: green ? 0.18 : 0.14), shape: BoxShape.circle),
          child: Icon(icon, size: 21, color: green ? Colors.white : tint),
        ),
        const SizedBox(height: 10),
        Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, color: green ? const Color(0xCCFFFFFF) : cs.onSurfaceVariant)),
        const SizedBox(height: 2),
        text == null
            ? const SkSkeleton(height: 18, width: 56)
            : FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerLeft, child: Text(text!, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: fg))),
      ]),
    );
    if (!green) return SkSoftCard(child: body);
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [kSkDeep, kSkDeeper]),
        boxShadow: const [BoxShadow(color: Color(0x330A3E32), blurRadius: 18, offset: Offset(0, 8), spreadRadius: -6)],
      ),
      child: body,
    );
  }
}

/// One sale: cash/card icon, customer, "2 services · what", the time and barber, the amount with a Cash/Card tag.
class _SaleItem extends StatelessWidget {
  const _SaleItem({required this.sale, required this.fmt, required this.today, required this.onTap});
  final Sale sale;
  final Fmt fmt;
  final String today;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final n = sale.items.fold(0, (s, i) => s + i.qty);
    final what = saleWhat(sale);
    final card = sale.payment == 'card';
    final when = '${sale.day == today ? 'Today' : fmt.dayLabel(sale.day)}, ${fmt.time(sale.createdAt)} · ${sale.barberName}';
    final tag = dark ? kSkMint : kSkDeep;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
        child: Row(children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(color: tag.withValues(alpha: 0.12), shape: BoxShape.circle),
            child: Icon(card ? Icons.credit_card_rounded : Icons.payments_outlined, color: tag),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(sale.customerLabel, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              if (n > 0 || what.isNotEmpty) ...[
                const SizedBox(height: 2),
                Text(
                  [if (n > 0) '$n service${n == 1 ? '' : 's'}', if (what.isNotEmpty) what].join(' • '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant),
                ),
              ],
              const SizedBox(height: 3),
              Row(children: [
                Icon(Icons.schedule_rounded, size: 14, color: cs.onSurfaceVariant),
                const SizedBox(width: 4),
                Expanded(child: Text(when, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant))),
              ]),
            ]),
          ),
          const SizedBox(width: 8),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text(fmt.money(sale.amount), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
              decoration: BoxDecoration(color: tag.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(999)),
              child: Text(card ? 'Card' : 'Cash', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: tag)),
            ),
          ]),
          Icon(Icons.chevron_right_rounded, color: cs.onSurfaceVariant),
        ]),
      ),
    );
  }
}
