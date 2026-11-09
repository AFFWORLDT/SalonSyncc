import 'dart:async';

import '../../core/screen_cache.dart';
import '../../core/ui/haptics.dart';
import '../../core/ui/avatar.dart';
import '../../core/ui/search_field.dart';
import '../../core/theme/scale.dart';
import '../../core/ui/stats.dart';
import '../../core/ui/toast.dart';
import '../../core/ui/heading.dart';
import '../../core/ui/toggle.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/format/fmt.dart';
import '../../core/theme/app_theme.dart';
import '../../core/ui/states.dart';
import '../../data/customers_api.dart';
import '../../models/customer.dart';
import '../../models/me.dart';
import '../../models/paged.dart';
import '../../models/sale.dart';
import '../today/sale_row.dart';


String _waDigits(String phone, String country) => phone.startsWith('+') ? phone.substring(1) : '$country${phone.replaceFirst(RegExp(r'^0'), '')}';

/// Every customer with a mobile number, newest visit first; search by name or mobile.
class CustomersScreen extends StatefulWidget {
  const CustomersScreen({super.key, required this.me, required this.api, required this.onOpen});
  final Me me;
  final CustomersApi api;
  final Future<void> Function(Customer c) onOpen;

  @override
  State<CustomersScreen> createState() => _CustomersScreenState();
}

class _CustomersScreenState extends State<CustomersScreen> {
  final _q = TextEditingController();
  Timer? _debounce;
  List<Customer> _items = const [];
  int _total = 0, _page = 1, _seq = 0;
  bool _loaded = false;
  Object? _error;

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

  Future<void> _load({int page = 1}) async {
    final n = ++_seq;
    final key = 'customers|${widget.me.org.slug}|${_q.text.trim()}';
    final cached = page == 1 ? ScreenCache.get<Paged<Customer>>(key) : null;
    if (cached != null) {
      fillFromCache(setState, () {
        _items = cached.items;
        _total = cached.total;
        _page = 1;
        _loaded = true;
      });
    }
    try {
      final p = await widget.api.list(q: _q.text, page: page);
      if (page == 1) ScreenCache.put(key, p);
      if (!mounted || n != _seq) return;
      setState(() {
        _items = page == 1 ? p.items : [..._items, ...p.items];
        _total = p.total;
        _page = page;
        _loaded = true;
        _error = null;
      });
    } catch (e) {
      if (mounted && n == _seq) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = widget.me, fmt = me.fmt;
    final cs = Theme.of(context).colorScheme;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.fromLTRB(SkSpace.gutter, SkSpace.sm, SkSpace.gutter, SkSpace.xxxl), children: [
        const SkHeading('Customers', subtitle: 'Everyone your salon has served. Tap one for their visits.'),
        SkSearchField(
          controller: _q,
          hint: 'Search name or mobile',
          onChanged: (_) {
            _debounce?.cancel();
            _debounce = Timer(const Duration(milliseconds: 250), _load);
          },
        ),
        const SizedBox(height: SkSpace.lg),
        if (_error != null && !_loaded)
          ErrorState(error: _error!, onRetry: _load)
        else if (!_loaded)
          const SkSkeletonList(count: 5, height: 60)
        else ...[
          Padding(
            padding: const EdgeInsets.only(left: SkSpace.xs, bottom: SkSpace.sm),
            child: Text('$_total customers', style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant)),
          ),
          if (_items.isEmpty)
            EmptyState(text: _q.text.trim().isEmpty ? 'No customers yet.' : 'No match.', icon: Icons.people_outline_rounded)
          else
            SkFlatList(children: [
              for (final c in _items)
                InkWell(
                  onTap: () => widget.onOpen(c).then((_) => _load()),
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(SkSpace.lg, SkSpace.md, SkSpace.md, SkSpace.md),
                    child: Row(children: [
                      SkAvatar(slug: me.org.slug, name: c.name ?? '?', size: 40),
                      const SizedBox(width: SkSpace.lg),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(c.name ?? '—', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
                          const SizedBox(height: 2),
                          Text(
                            [
                              '${c.visits} visit${c.visits == 1 ? '' : 's'}',
                              if (c.lastVisitAt != null) 'last ${fmt.dayLabel(fmt.ymdOf(c.lastVisitAt!))}',
                              if (c.phone != null) fmt.phone(c.phone!),
                            ].join(' · '),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant),
                          ),
                        ]),
                      ),
                      const SizedBox(width: SkSpace.sm),
                      Text(fmt.money(c.spent), style: SkText.mono.copyWith(fontWeight: FontWeight.w700)),
                    ]),
                  ),
                ),
            ]),
          if (_total > _items.length)
            Padding(padding: const EdgeInsets.only(top: SkSpace.md), child: Center(child: TextButton(onPressed: () => _load(page: _page + 1), child: const Text('Show more')))),
        ],
      ]),
    );
  }
}

/// One customer: visits, spend, favourite barbers and services, WhatsApp opt-out, and every bill.
class CustomerProfile extends StatefulWidget {
  const CustomerProfile({super.key, required this.me, required this.api, required this.id, required this.onOpenSale});
  final Me me;
  final CustomersApi api;
  final int id;
  final Future<void> Function(Sale s) onOpenSale;

  @override
  State<CustomerProfile> createState() => _CustomerProfileState();
}

class _CustomerProfileState extends State<CustomerProfile> {
  CustomerDetail? _c;
  List<Sale> _visits = const [];
  int _total = 0, _sum = 0, _page = 1;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final r = await Future.wait([widget.api.detail(widget.id), widget.api.visits(widget.id)]);
      if (!mounted) return;
      final v = r[1] as Paged<Sale>;
      setState(() {
        _c = r[0] as CustomerDetail;
        _visits = v.items;
        _total = v.total;
        _sum = v.sum ?? 0;
        _page = 1;
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _more() async {
    try {
      final v = await widget.api.visits(widget.id, page: _page + 1);
      if (!mounted) return;
      setState(() {
        _visits = [..._visits, ...v.items];
        _page++;
      });
    } catch (_) {}
  }

  Future<void> _optOut(bool off) async {
    try {
      await widget.api.setOptOut(widget.id, off);
      if (!mounted) return;
      showSkToast(context, off ? 'No more WhatsApp reminders or announcements' : 'WhatsApp messages on');
      _load();
    } catch (e) {
      if (mounted) showSkToast(context, messageOf(e), kind: ToastKind.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = widget.me, fmt = me.fmt, t = Theme.of(context).textTheme, cs = Theme.of(context).colorScheme;
    final c = _c;
    String ago(int ms) {
      final days = DateTime.parse(me.today).difference(DateTime.parse(fmt.ymdOf(ms))).inDays;
      return days <= 0 ? 'Today' : days == 1 ? 'Yesterday' : '$days days ago';
    }

    Widget action(IconData icon, String label, VoidCallback onTap) => Expanded(
          child: FilledButton.tonalIcon(
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(44)),
            onPressed: () {
              Haptic.tap();
              onTap();
            },
            icon: Icon(icon, size: 18),
            label: Text(label),
          ),
        );

    return Scaffold(
      appBar: AppBar(scrolledUnderElevation: 0),
      body: _error != null && c == null
          ? ErrorState(error: _error!, onRetry: _load)
          : c == null
              ? const Padding(padding: EdgeInsets.all(SkSpace.gutter), child: SkSkeletonList(count: 4, height: 72))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(padding: const EdgeInsets.fromLTRB(SkSpace.gutter, 0, SkSpace.gutter, SkSpace.xxxl), children: [
                    // Who: initials, name, mobile and since when.
                    Row(children: [
                      SkAvatar(slug: me.org.slug, name: c.name ?? '?', size: 60),
                      const SizedBox(width: SkSpace.lg),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(c.name ?? 'No name', style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
                          const SizedBox(height: 2),
                          Text(
                            '${c.phone == null ? 'No mobile' : fmt.phone(c.phone!)}${c.firstVisitAt == null ? '' : ' · since ${fmt.dateLabel(fmt.ymdOf(c.firstVisitAt!))}'}',
                            style: t.bodySmall?.copyWith(color: cs.onSurfaceVariant),
                          ),
                        ]),
                      ),
                    ]),
                    if (c.phone != null) ...[
                      const SizedBox(height: SkSpace.lg),
                      Row(children: [
                        action(Icons.call_outlined, 'Call', () => launchUrl(Uri.parse('tel:${c.phone}'))),
                        const SizedBox(width: SkSpace.sm),
                        action(Icons.chat_outlined, 'WhatsApp', () => launchUrl(Uri.parse('https://wa.me/${_waDigits(c.phone!, me.salon.phoneCountry)}'), mode: LaunchMode.externalApplication)),
                      ]),
                    ],
                    const SizedBox(height: SkSpace.xl),
                    SkHero(label: 'Total spent', value: c.spent, format: fmt.money, notes: ['${c.visits} visit${c.visits == 1 ? '' : 's'} · ${c.cashVisits} cash · ${c.cardVisits} card']),
                    const SizedBox(height: SkSpace.lg),
                    SkStatStrip(format: fmt.money, stats: [
                      SkStat(label: 'Visits', text: '${c.visits}'),
                      SkStat(label: 'Average bill', value: c.avgBill),
                      SkStat(label: 'Last visit', text: c.lastVisitAt == null ? '—' : fmt.dayLabel(fmt.ymdOf(c.lastVisitAt!)), hint: c.lastVisitAt == null ? null : ago(c.lastVisitAt!)),
                    ]),
                    if (c.phone != null && me.features.contains('whatsapp')) ...[
                      const SizedBox(height: SkSpace.md),
                      SkFlatList(children: [
                        SkSwitchTile(
                          title: const Text('WhatsApp reminders and announcements'),
                          subtitle: const Text('Turn off if the customer asked not to get messages. Bills still go out.'),
                          value: !c.waOptOut,
                          onChanged: me.readOnly ? null : (on) => _optOut(!on),
                        ),
                      ]),
                    ],
                    for (final (title, items) in [('Barbers', c.barbers), ('Favourite services', c.services.take(5).toList())]) ...[
                      SkSection(title, top: SkSpace.lg),
                      items.isEmpty
                          ? Text('—', style: TextStyle(color: cs.onSurfaceVariant))
                          : Wrap(spacing: SkSpace.sm, runSpacing: SkSpace.sm, children: [
                              for (final (n, q) in items)
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                  decoration: BoxDecoration(color: cs.surfaceContainerHighest.withValues(alpha: 0.6), borderRadius: BorderRadius.circular(999)),
                                  child: Text('$n ×$q', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
                                ),
                            ]),
                    ],
                    Padding(
                      padding: const EdgeInsets.only(top: SkSpace.xl, bottom: SkSpace.sm),
                      child: Row(children: [
                        Expanded(child: Text('Visit history', style: t.titleMedium?.copyWith(fontWeight: FontWeight.w600))),
                        Text('$_total bills · ${fmt.money(_sum)}', style: SkText.mono.copyWith(fontSize: 13, color: cs.onSurfaceVariant)),
                      ]),
                    ),
                    if (_visits.isEmpty)
                      const EmptyState(text: 'No visits yet.')
                    else
                      SkFlatList(children: [
                        for (final s in _visits) SaleRow(sale: s, fmt: fmt, showDay: true, showBarber: true, onTap: () => widget.onOpenSale(s).then((_) => _load())),
                      ]),
                    if (_total > _visits.length) Padding(padding: const EdgeInsets.only(top: SkSpace.md), child: Center(child: TextButton(onPressed: _more, child: const Text('Show more')))),
                  ]),
                ),
    );
  }
}
