import 'package:flutter/material.dart';

import '../../core/theme/scale.dart';
import '../../core/ui/stats.dart';
import '../../core/ui/heading.dart';
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
    try {
      final p = await widget.sales.search(day: _day, barberId: _barber, payment: _payment, page: page, pageSize: kSalesPage);
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
    final fmt = widget.me.fmt, cs = Theme.of(context).colorScheme;
    final p = _last;
    // Grouped by day (newest first, as the API sends them), each with its own total.
    final days = <String, List<Sale>>{};
    for (final s in _items) {
      (days[s.day] ??= []).add(s);
    }
    return NotificationListener<ScrollNotification>(
      onNotification: _onScroll,
      child: RefreshIndicator(
        onRefresh: _load,
        child: ListView(padding: const EdgeInsets.fromLTRB(SkSpace.gutter, SkSpace.sm, SkSpace.gutter, SkSpace.xxxl), children: [
          SkHeading(
            'Sales',
            action: widget.me.readOnly
                ? null
                : FilledButton.icon(onPressed: () => widget.onNewSale().then((_) => _load()), icon: const Icon(Icons.add_rounded), label: const Text('New sale')),
          ),
          SizedBox(
            height: 38,
            child: ListView(scrollDirection: Axis.horizontal, children: [
              SkFilterPill(
                label: _day == null ? 'All days' : fmt.dayLabel(_day!),
                icon: Icons.calendar_today_outlined,
                active: _day != null,
                onTap: _pickDay,
                clearTooltip: 'All days',
                onClear: () => _set(() => _day = null),
              ),
              const SizedBox(width: SkSpace.sm),
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
          const SizedBox(height: SkSpace.xl),
          if (_error != null && p == null)
            ErrorState(error: _error!, onRetry: _load)
          else if (p == null)
            const SkSkeletonList(count: 6, height: 60)
          else ...[
            // The total for the filter, Groww-style.
            Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('${p.total} sale${p.total == 1 ? '' : 's'}${_day == null ? '' : ' · ${fmt.dateLabel(_day!)}'}', style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant)),
                  const SizedBox(height: 2),
                  Text(fmt.money(p.sum ?? 0), style: SkText.mono.copyWith(fontSize: 26, fontWeight: FontWeight.w700, letterSpacing: -0.5)),
                ]),
              ),
            ]),
            const SizedBox(height: SkSpace.md),
            if (_items.isEmpty)
              const EmptyState(text: 'No sales match.', icon: Icons.search_off_rounded)
            else
              for (final MapEntry(key: day, value: list) in days.entries) ...[
                if (_day == null)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(SkSpace.xs, SkSpace.md, SkSpace.xs, SkSpace.sm),
                    child: Row(children: [
                      Expanded(child: Text(day == widget.me.today ? 'Today' : fmt.dayLabel(day), style: const TextStyle(fontWeight: FontWeight.w600))),
                      Text(fmt.money(list.fold(0, (sum, x) => sum + x.amount)), style: SkText.mono.copyWith(fontSize: 13, color: cs.onSurfaceVariant)),
                    ]),
                  ),
                SkFlatList(children: [
                  for (final s in list) SaleRow(sale: s, fmt: fmt, showBarber: true, onTap: () => widget.onOpen(s).then((_) => _load())),
                ]),
              ],
            if (p.total > _items.length && p.items.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: SkSpace.lg),
                child: Center(child: TextButton(onPressed: () => _load(page: _page + 1), child: const Text('Show more'))),
              ),
          ],
        ]),
      ),
    );
  }
}
