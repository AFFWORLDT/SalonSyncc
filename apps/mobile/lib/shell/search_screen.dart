import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../core/auth/auth_controller.dart';
import '../core/features/registry.dart';
import '../core/format/fmt.dart';
import '../core/ui/haptics.dart';
import '../core/ui/route.dart';
import '../core/ui/states.dart';
import '../data/sales_api.dart';
import '../models/sale.dart';
import '../modules/sale/bill_screen.dart';
import '../modules/today/sale_row.dart';
import 'nav.dart';

/// Search from the top bar: jump to any screen by name, and find bills by number, customer name or mobile.
Future<void> openSearch(BuildContext context, FeatureRegistry registry) =>
    Navigator.of(context).push(SkRoute<void>(builder: (_) => SearchScreen(registry: registry)));

class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key, required this.registry});
  final FeatureRegistry registry;

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final auth = Get.find<AuthController>();
  final _q = TextEditingController();
  Timer? _debounce;
  int _seq = 0;
  List<Sale>? _bills;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _q.addListener(_typed);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _q.dispose();
    super.dispose();
  }

  String _last = '';
  void _typed() {
    final q = _q.text.trim();
    if (q == _last) return;
    _last = q;
    setState(() {});
    _debounce?.cancel();
    if (q.length < 2) {
      setState(() { _bills = null; _loading = false; });
      return;
    }
    setState(() => _loading = true);
    _debounce = Timer(const Duration(milliseconds: 220), () => _find(q));
  }

  Future<void> _find(String q) async {
    final n = ++_seq;
    final me = auth.me.value!;
    try {
      final r = await SalesApi(auth.api, me.fmt).search(q: q, pageSize: 20);
      if (mounted && n == _seq) setState(() { _bills = r.items; _loading = false; });
    } catch (_) {
      if (mounted && n == _seq) setState(() { _bills = const []; _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = auth.me.value!;
    final t = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    final q = _q.text.trim().toLowerCase();
    final screens = widget.registry.visibleFor(me).where((m) => q.isEmpty || m.title.toLowerCase().contains(q)).toList();
    final bills = _bills;
    Widget label(String s) => Padding(padding: const EdgeInsets.fromLTRB(20, 18, 20, 6), child: Text(s.toUpperCase(), style: t.labelSmall?.copyWith(letterSpacing: 1, color: cs.onSurfaceVariant)));
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: TextField(
          key: const ValueKey('search-field'),
          controller: _q,
          autofocus: true,
          textInputAction: TextInputAction.search,
          decoration: InputDecoration(
            hintText: 'Search bills, customers, screens',
            border: InputBorder.none,
            enabledBorder: InputBorder.none,
            focusedBorder: InputBorder.none,
            filled: false,
            suffixIcon: _q.text.isEmpty ? null : IconButton(tooltip: 'Clear', onPressed: _q.clear, icon: const Icon(Icons.close_rounded)),
          ),
        ),
      ),
      body: ListView(padding: const EdgeInsets.only(bottom: 24), children: [
        if (q.length >= 2) ...[
          label('Bills'),
          if (_loading && bills == null)
            for (var i = 0; i < 3; i++) const Padding(padding: EdgeInsets.symmetric(horizontal: 16, vertical: 4), child: SkSkeleton(height: 56))
          else if ((bills ?? const []).isEmpty)
            Padding(padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8), child: Text('No bill matches "${_q.text.trim()}"', style: t.bodyMedium?.copyWith(color: cs.onSurfaceVariant)))
          else
            for (final s in bills!)
              SaleRow(
                sale: s,
                fmt: me.fmt,
                showDay: true,
                showBarber: true,
                onTap: () => openBill(context, me: me, sales: SalesApi(auth.api, me.fmt), sale: s),
              ),
        ],
        if (screens.isNotEmpty) ...[
          label(q.isEmpty ? 'Go to' : 'Screens'),
          for (final m in screens)
            ListTile(
              leading: Icon(m.icon),
              title: Text(m.title),
              trailing: const Icon(Icons.north_east_rounded, size: 18),
              onTap: () {
                Haptic.tap();
                Navigator.of(context).pop();
                openModule(m.id);
              },
            ),
        ],
      ]),
    );
  }
}
