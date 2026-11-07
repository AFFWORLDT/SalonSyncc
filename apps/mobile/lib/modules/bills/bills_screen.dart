import 'dart:async';

import '../../core/screen_cache.dart';
import '../../core/ui/filter_chip_menu.dart';
import '../../core/ui/search_field.dart';
import '../../core/theme/scale.dart';
import '../../core/ui/stats.dart';
import '../../core/ui/heading.dart';
import 'package:flutter/material.dart';

import '../../core/format/fmt.dart';
import '../../core/ui/states.dart';
import '../../data/sales_api.dart';
import '../../models/me.dart';
import '../../models/paged.dart';
import '../../models/sale.dart';
import '../today/sale_row.dart';

const kBillsPage = 50;

/// The barber's own bills: search by bill no., customer or phone, filter by day, 50 at a time.
class BillsScreen extends StatefulWidget {
  const BillsScreen({super.key, required this.me, required this.sales, required this.onOpen, this.admin = false});
  final Me me;
  final SalesApi sales;
  final Future<void> Function(Sale sale) onOpen;

  /// Every bill in the salon (the server shows a barber only their own).
  final bool admin;

  @override
  State<BillsScreen> createState() => _BillsScreenState();
}

class _BillsScreenState extends State<BillsScreen> {
  final _q = TextEditingController();
  Timer? _debounce;
  String? _day;
  int _page = 1;
  Paged<Sale>? _list;
  List<Sale> _items = const [];
  Object? _error;
  bool _more = false;
  int _seq = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _q.dispose();
    super.dispose();
  }

  /// Page 1 replaces the list (new search, day, refresh); later pages are added to it.
  Future<void> _load({int page = 1}) async {
    final n = ++_seq;
    final key = 'bills|${widget.me.org.slug}|${widget.me.user.id}|${widget.admin}|${_q.text.trim()}|$_day';
    final cached = page == 1 ? ScreenCache.get<Paged<Sale>>(key) : null;
    if (cached != null) {
      fillFromCache(setState, () {
        _list = cached;
        _items = cached.items;
        _page = 1;
      });
    }
    try {
      final p = await widget.sales.search(q: _q.text, day: _day, page: page, pageSize: kBillsPage);
      if (page == 1) ScreenCache.put(key, p);
      if (!mounted || n != _seq) return;
      setState(() {
        _page = page;
        _list = p;
        _items = page == 1 ? p.items : [..._items, ...p.items.where((s) => !_items.any((x) => x.id == s.id))];
        _error = null;
        _more = false;
      });
    } catch (e) {
      if (mounted && n == _seq) {
        setState(() {
          _error = e;
          _more = false;
        });
      }
    }
  }

  void _typed(String _) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 250), _load);
  }

  Future<void> _pickDay() async {
    final today = DateTime.parse(widget.me.today);
    final d = await showDatePicker(context: context, firstDate: DateTime(2020), lastDate: today, initialDate: _day == null ? today : DateTime.parse(_day!));
    if (d == null) return;
    setState(() => _day = '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}');
    _load();
  }

  /// Next page when the list is scrolled near its end.
  bool _onScroll(ScrollNotification n) {
    final list = _list;
    if (list != null && !_more && list.total > _items.length && n.metrics.extentAfter < 400) {
      setState(() => _more = true);
      _load(page: _page + 1);
    }
    return false;
  }

  @override
  Widget build(BuildContext context) {
    final fmt = widget.me.fmt;
    final list = _list;
    return NotificationListener<ScrollNotification>(
      onNotification: _onScroll,
      child: RefreshIndicator(
        onRefresh: _load,
        child: ListView(padding: const EdgeInsets.fromLTRB(SkSpace.gutter, SkSpace.sm, SkSpace.gutter, SkSpace.xxxl), children: [
          SkHeading(widget.admin ? 'Bills' : 'My bills', subtitle: widget.admin ? 'Every sale makes a bill. Open one to see or print it.' : null),
          SkSearchField(key: const ValueKey('bill-search'), controller: _q, onChanged: _typed, hint: 'Bill no., customer or phone'),
          const SizedBox(height: SkSpace.md),
          Align(
            alignment: Alignment.centerLeft,
            child: SkFilterPill(
              label: _day == null ? 'Any day' : fmt.dayLabel(_day!),
              icon: Icons.calendar_today_outlined,
              active: _day != null,
              onTap: _pickDay,
              clearTooltip: 'Any day',
              onClear: () {
                setState(() => _day = null);
                _load();
              },
            ),
          ),
          const SizedBox(height: SkSpace.lg),
          if (_error != null && list == null)
            ErrorState(error: _error!, onRetry: _load)
          else if (list == null)
            const SkSkeletonList(count: 6, height: 60)
          else if (_items.isEmpty)
            EmptyState(text: widget.admin ? 'No bills match.' : 'No bills found', icon: Icons.receipt_long_outlined)
          else ...[
            Padding(
              padding: const EdgeInsets.only(left: SkSpace.xs, bottom: SkSpace.sm),
              child: Text('${list.total} bill${list.total == 1 ? '' : 's'}', style: TextStyle(fontSize: 13, color: Theme.of(context).colorScheme.onSurfaceVariant)),
            ),
            SkFlatList(children: [
              for (final s in _items)
                SaleRow(sale: s, fmt: fmt, showDay: true, showBarber: widget.admin, onTap: () => widget.onOpen(s).then((_) => _load())),
            ]),
            if (_more)
              const Padding(padding: EdgeInsets.all(SkSpace.lg), child: Center(child: CircularProgressIndicator(strokeWidth: 2.5)))
            // Loads by itself on scroll; the button is for a list too short to scroll.
            else if (list.total > _items.length && list.items.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: SkSpace.md),
                child: Center(
                  child: TextButton(
                    onPressed: () {
                      setState(() => _more = true);
                      _load(page: _page + 1);
                    },
                    child: const Text('Show more'),
                  ),
                ),
              ),
          ],
        ]),
      ),
    );
  }
}
