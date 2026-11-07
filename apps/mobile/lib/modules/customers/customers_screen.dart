import 'dart:async';

import '../../core/ui/toggle.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/format/fmt.dart';
import '../../core/theme/app_theme.dart';
import '../../core/ui/glass.dart';
import '../../core/ui/states.dart';
import '../../data/customers_api.dart';
import '../../models/customer.dart';
import '../../models/me.dart';
import '../../models/paged.dart';
import '../../models/sale.dart';
import '../today/sale_row.dart';

String _dateTime(Fmt fmt, int ms) {
  final d = DateTime.fromMillisecondsSinceEpoch(ms);
  return '${fmt.dateLabel('${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}')} ${fmt.time(ms)}';
}

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
    try {
      final p = await widget.api.list(q: _q.text, page: page);
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
    final me = widget.me, fmt = me.fmt, t = Theme.of(context).textTheme;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
        Text('Customers', style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w600)),
        Text('Saved automatically when a barber enters a mobile number. Tap one for their visit history.', style: t.bodySmall),
        const SizedBox(height: 12),
        TextField(
          controller: _q,
          onChanged: (_) {
            _debounce?.cancel();
            _debounce = Timer(const Duration(milliseconds: 250), _load);
          },
          decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Search name or mobile'),
        ),
        const SizedBox(height: 10),
        if (_error != null && !_loaded)
          ErrorState(error: _error!, onRetry: _load)
        else if (!_loaded)
          for (var i = 0; i < 4; i++) const Padding(padding: EdgeInsets.symmetric(vertical: 6), child: SkSkeleton(height: 56))
        else ...[
          Text('$_total customers', style: t.titleSmall),
          const SizedBox(height: 6),
          if (_items.isEmpty)
            EmptyState(text: _q.text.trim().isEmpty ? 'No customers yet.' : 'No match.', icon: Icons.people_outline_rounded)
          else
            SkGlass(
              blur: false,
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Column(children: [
                for (final c in _items)
                  ListTile(
                    onTap: () => widget.onOpen(c).then((_) => _load()),
                    title: Text(c.name ?? '—'),
                    subtitle: Text([
                      if (c.phone != null) fmt.phone(c.phone!),
                      '${c.visits} visit${c.visits == 1 ? '' : 's'}',
                      if (c.lastVisitAt != null) 'last ${_dateTime(fmt, c.lastVisitAt!)}',
                    ].join(' · ')),
                    trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                      Text(fmt.money(c.spent), style: SkText.mono.copyWith(fontWeight: FontWeight.w600)),
                      const Icon(Icons.chevron_right_rounded),
                    ]),
                  ),
              ]),
            ),
          if (_total > _items.length)
            Padding(padding: const EdgeInsets.only(top: 12), child: OutlinedButton(onPressed: () => _load(page: _page + 1), child: const Text('Show more'))),
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
      ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(off ? 'No more WhatsApp reminders or announcements' : 'WhatsApp messages on')));
      _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(messageOf(e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = widget.me, fmt = me.fmt, t = Theme.of(context).textTheme, cs = Theme.of(context).colorScheme;
    final c = _c;
    Widget tile(String label, String value, [String? hint]) => SkGlass(
          blur: false,
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: t.labelMedium?.copyWith(color: cs.onSurfaceVariant)),
            const SizedBox(height: 4),
            Text(value, style: SkText.mono.copyWith(fontSize: 16, fontWeight: FontWeight.w700)),
            if (hint != null) Text(hint, style: t.bodySmall),
          ]),
        );
    String ago(int ms) {
      final days = DateTime.parse(me.today).difference(DateTime.fromMillisecondsSinceEpoch(ms)).inDays;
      return days <= 0 ? 'Today' : days == 1 ? 'Yesterday' : '$days days ago';
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Customers')),
      body: _error != null && c == null
          ? ErrorState(error: _error!, onRetry: _load)
          : c == null
              ? const Center(child: CircularProgressIndicator())
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
                    Text(c.name ?? 'No name', style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w600)),
                    Text('${c.phone == null ? 'No mobile' : fmt.phone(c.phone!)}${c.firstVisitAt == null ? '' : ' · customer since ${_dateTime(fmt, c.firstVisitAt!).split(' ').take(3).join(' ')}'}', style: t.bodySmall),
                    if (c.phone != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Wrap(spacing: 8, children: [
                          OutlinedButton.icon(onPressed: () => launchUrl(Uri.parse('tel:${c.phone}')), icon: const Icon(Icons.call_outlined), label: const Text('Call')),
                          OutlinedButton.icon(
                            onPressed: () => launchUrl(Uri.parse('https://wa.me/${_waDigits(c.phone!, me.salon.phoneCountry)}'), mode: LaunchMode.externalApplication),
                            icon: const Icon(Icons.chat_outlined),
                            label: const Text('WhatsApp'),
                          ),
                        ]),
                      ),
                    if (c.phone != null && me.features.contains('whatsapp')) ...[
                      const SizedBox(height: 12),
                      SkGlass(
                        blur: false,
                        padding: const EdgeInsets.fromLTRB(16, 6, 8, 6),
                        child: SkSwitchTile(
                          contentPadding: EdgeInsets.zero,
                          title: const Text('WhatsApp reminders and announcements'),
                          subtitle: const Text('Turn off if the customer asked not to get messages. Bills still go out.'),
                          value: !c.waOptOut,
                          onChanged: me.readOnly ? null : (on) => _optOut(!on),
                        ),
                      ),
                    ],
                    const SizedBox(height: 12),
                    Row(children: [
                      Expanded(child: tile('Visits', '${c.visits}', '${c.cashVisits} cash · ${c.cardVisits} card')),
                      const SizedBox(width: 10),
                      Expanded(child: tile('Total spent', fmt.money(c.spent))),
                    ]),
                    const SizedBox(height: 10),
                    Row(children: [
                      Expanded(child: tile('Average bill', fmt.money(c.avgBill))),
                      const SizedBox(width: 10),
                      Expanded(child: tile('Last visit', c.lastVisitAt == null ? '—' : _dateTime(fmt, c.lastVisitAt!), c.lastVisitAt == null ? null : ago(c.lastVisitAt!))),
                    ]),
                    const SizedBox(height: 12),
                    for (final (title, items) in [('Barbers', c.barbers), ('Favourite services', c.services.take(5).toList())]) ...[
                      Text(title, style: t.titleSmall),
                      const SizedBox(height: 6),
                      items.isEmpty ? const Text('—') : Wrap(spacing: 6, runSpacing: 6, children: [for (final (n, q) in items) Chip(label: Text('$n ×$q'))]),
                      const SizedBox(height: 12),
                    ],
                    Row(children: [
                      Expanded(child: Text('Visit history', style: t.titleMedium)),
                      Text('$_total bills · ${fmt.money(_sum)}', style: SkText.mono.copyWith(fontSize: 13)),
                    ]),
                    const SizedBox(height: 6),
                    if (_visits.isEmpty)
                      const EmptyState(text: 'No visits yet.')
                    else
                      SkGlass(
                        blur: false,
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        child: Column(children: [
                          for (final s in _visits) SaleRow(sale: s, fmt: fmt, showDay: true, showBarber: true, onTap: () => widget.onOpenSale(s).then((_) => _load())),
                        ]),
                      ),
                    if (_total > _visits.length) Padding(padding: const EdgeInsets.only(top: 12), child: OutlinedButton(onPressed: _more, child: const Text('Show more'))),
                  ]),
                ),
    );
  }
}
