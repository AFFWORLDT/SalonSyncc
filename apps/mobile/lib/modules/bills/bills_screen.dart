import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/format/fmt.dart';
import '../../core/ui/glass.dart';
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
    try {
      final p = await widget.sales.search(q: _q.text, day: _day, page: page, pageSize: kBillsPage);
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

  @override
  Widget build(BuildContext context) {
    final fmt = widget.me.fmt;
    final list = _list;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 16, 16, 32), children: [
        Text(widget.admin ? 'Bills' : 'My bills', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w600)),
        if (widget.admin) Text('Every sale makes a bill. Open one to see or print it.', style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 12),
        TextField(
          key: const ValueKey('bill-search'),
          controller: _q,
          onChanged: _typed,
          textInputAction: TextInputAction.search,
          decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Bill no., customer or phone'),
        ),
        const SizedBox(height: 8),
        Align(
          alignment: Alignment.centerLeft,
          child: InputChip(
            avatar: const Icon(Icons.calendar_today_outlined, size: 18),
            label: Text(_day == null ? 'Any day' : fmt.dayLabel(_day!)),
            onPressed: _pickDay,
            onDeleted: _day == null
                ? null
                : () {
                    setState(() => _day = null);
                    _load();
                  },
          ),
        ),
        const SizedBox(height: 8),
        if (_error != null && list == null)
          ErrorState(error: _error!, onRetry: _load)
        else if (list == null)
          for (var i = 0; i < 5; i++) const Padding(padding: EdgeInsets.symmetric(vertical: 6), child: SkSkeleton(height: 56))
        else if (_items.isEmpty)
          EmptyState(text: widget.admin ? 'No bills match.' : 'No bills found', icon: Icons.receipt_long_outlined)
        else ...[
          SkGlass(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Column(children: [
              for (final s in _items)
                SaleRow(sale: s, fmt: fmt, showDay: true, showBarber: widget.admin, onTap: () => widget.onOpen(s).then((_) => _load())),
            ]),
          ),
          if (list.total > _items.length && list.items.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: OutlinedButton(
                onPressed: _more
                    ? null
                    : () {
                        setState(() => _more = true);
                        _load(page: _page + 1);
                      },
                child: const Text('Show more'),
              ),
            ),
        ],
      ]),
    );
  }
}
