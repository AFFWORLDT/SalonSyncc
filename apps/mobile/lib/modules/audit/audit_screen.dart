import 'dart:async';

import '../../core/ui/heading.dart';
import 'package:flutter/material.dart';

import '../../core/format/fmt.dart';
import '../../core/ui/filter_chip_menu.dart';
import '../../core/ui/glass.dart';
import '../../core/ui/states.dart';
import '../../data/audit_api.dart';
import '../../data/staff_api.dart';
import '../../models/audit.dart';
import '../../models/me.dart';
import '../../models/staff.dart';
import '../dashboard/dashboard_screen.dart' show ymd;

const kEntities = [
  (null, 'Everything'),
  ('sale', 'Bills'),
  ('expense', 'Barber expenses'),
  ('company_expense', 'Company expenses'),
  ('payout', 'Barber payouts'),
  ('transfer', 'Money moves'),
  ('opening', 'Opening balances'),
  ('user', 'Staff & users'),
  ('service', 'Services'),
  ('settings', 'Settings'),
  ('whatsapp', 'WhatsApp connection'),
];

const _nouns = {
  'sale': 'bill',
  'expense': 'barber expense',
  'company_expense': 'company expense',
  'payout': 'payout',
  'transfer': 'money move',
  'opening': 'opening balance',
  'user': 'user',
  'service': 'service',
  'settings': 'settings',
  'whatsapp': 'WhatsApp connection',
};
const _verbs = {'create': 'Created', 'update': 'Edited', 'delete': 'Deleted', 'password_reset': 'Password reset', 'starter': 'Added the starter list of'};

/// Field names as the web shows them (apps/web/src/components/app/audit-diff.tsx LABELS).
const kAuditLabels = {
  'amount': 'Amount', 'barber_name': 'Barber', 'customer_label': 'Customer', 'customer_phone': 'Phone', 'payment_mode': 'Payment',
  'note': 'Note', 'commission_pct': 'Commission %', 'commission': 'Commission', 'vat_rate': 'VAT rate', 'vat_amount': 'VAT',
  'items': 'Services', 'day': 'Day', 'name': 'Name', 'username': 'Username', 'phone': 'Phone', 'role': 'Role', 'sort_order': 'Order',
  'active': 'Active', 'can_add_expense': 'Can add expenses', 'category': 'Group', 'description': 'Description', 'price': 'Price',
  'default_commission_pct': 'Default commission %', 'display_name': 'Salon name', 'timezone': 'Time zone', 'day_start_hour': 'Day starts at',
  'currency': 'Currency', 'locale': 'Number format', 'phone_country': 'Phone country code', 'bill_prefix': 'Bill prefix',
  'phone_number_id': 'WhatsApp phone number ID', 'waba_id': 'WhatsApp Business account ID', 'test_numbers': 'Test numbers',
  'wa_language': 'Template language', 'quick_amounts': 'Quick amounts',
};
const _hidden = {'barber_id'};
const _money = {'amount', 'commission', 'vat_amount', 'price', 'notify_sale_min'};

String auditLabel(String k) => kAuditLabels[k] ?? (k.isEmpty ? k : '${k[0].toUpperCase()}${k.substring(1).replaceAll('_', ' ')}');

String auditValue(Fmt fmt, String key, Object? v) {
  if (v == null || v == '') return '—';
  if (_money.contains(key) && v is int) return fmt.money(v);
  if ((key == 'commission_pct' || key == 'default_commission_pct' || key == 'vat_rate') && v is num) return '$v%';
  if (key == 'day' && v is String) return fmt.dayLabel(v);
  if ((key == 'customer_phone' || key == 'phone') && v is String) return fmt.phone(v);
  if (key == 'payment_mode') return '$v'.toUpperCase();
  if (v is bool) return v ? 'Yes' : 'No';
  if (key == 'items' && v is List) {
    return v.isEmpty ? '—' : v.map((i) => '${i['name']}${(i['qty'] ?? 1) > 1 ? ' ×${i['qty']}' : ''} ${i['price'] is int ? fmt.money(i['price'] as int) : ''}').join(', ');
  }
  if (v is List) return v.join(', ');
  return '$v';
}

String auditSummary(AuditEntry e) {
  if (e.action == 'password_reset') return 'reset the password of';
  return '${(_verbs[e.action] ?? e.action).toLowerCase()} ${_nouns[e.entity] ?? e.entity}';
}

String auditTitle(AuditEntry e) =>
    e.action == 'password_reset' ? 'Password reset for ${e.ref ?? ''}' : '${_verbs[e.action] ?? e.action} ${_nouns[e.entity] ?? e.entity}${e.ref == null ? '' : ' ${e.ref}'}';

/// Every change to bills, expenses, money, staff, services and settings: who, when and what changed. Read-only.
class AuditScreen extends StatefulWidget {
  const AuditScreen({super.key, required this.me, required this.api, required this.staff});
  final Me me;
  final AuditApi api;
  final StaffApi staff;

  @override
  State<AuditScreen> createState() => _AuditScreenState();
}

class _AuditScreenState extends State<AuditScreen> {
  final _q = TextEditingController();
  Timer? _debounce;
  late String _from = widget.me.today, _to = widget.me.today;
  String? _entity;
  int? _actor;
  List<Staff> _people = const [];
  List<AuditEntry> _items = const [];
  int _total = 0, _page = 1, _seq = 0;
  bool _loaded = false;
  Object? _error;

  @override
  void initState() {
    super.initState();
    widget.staff.list().then((l) => mounted ? setState(() => _people = l) : null, onError: (_) {});
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
      final p = await widget.api.list(q: _q.text, from: _from, to: _to, entity: _entity, actorId: _actor, page: page);
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

  void _set(VoidCallback change) {
    setState(change);
    _load();
  }

  Future<void> _range() async {
    final r = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime.parse(widget.me.today),
      initialDateRange: DateTimeRange(start: DateTime.parse(_from), end: DateTime.parse(_to)),
    );
    if (r != null) {
      _set(() {
        _from = ymd(r.start);
        _to = ymd(r.end);
      });
    }
  }

  String _when(int ms) {
    final fmt = widget.me.fmt;
    return '${fmt.dayLabel(fmt.ymdOf(ms))} ${fmt.time(ms)}';
  }

  void _detail(AuditEntry e) {
    final fmt = widget.me.fmt;
    final keys = e.action == 'update' ? e.changed.where((k) => !_hidden.contains(k)).toList() : (e.after ?? e.before ?? const {}).keys.where((k) => !_hidden.contains(k)).toList();
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (c) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        child: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(auditTitle(e), style: Theme.of(c).textTheme.titleLarge),
            Text('by ${e.actorName} · ${_when(e.at)}', style: Theme.of(c).textTheme.bodySmall),
            const SizedBox(height: 12),
            for (final k in keys)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  SizedBox(width: 120, child: Text(auditLabel(k), style: Theme.of(c).textTheme.labelMedium)),
                  Expanded(
                    child: e.action == 'update'
                        ? Wrap(spacing: 6, children: [
                            Text(auditValue(fmt, k, e.before?[k]), style: const TextStyle(decoration: TextDecoration.lineThrough)),
                            const Text('→'),
                            Text(auditValue(fmt, k, e.after?[k])),
                          ])
                        : Text(auditValue(fmt, k, (e.after ?? e.before)?[k]), style: TextStyle(decoration: e.action == 'delete' ? TextDecoration.lineThrough : null)),
                  ),
                ]),
              ),
          ]),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final fmt = widget.me.fmt, t = Theme.of(context).textTheme;
    final searching = _q.text.trim().isNotEmpty;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
        SkHeading('Audit log'),
        Text('Every bill, expense and setting change: who did it, when, and what changed. Nothing here can be edited.', style: t.bodySmall),
        const SizedBox(height: 12),
        TextField(
          controller: _q,
          onChanged: (_) {
            setState(() {});
            _debounce?.cancel();
            _debounce = Timer(const Duration(milliseconds: 250), _load);
          },
          decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Bill no. or name'),
        ),
        const SizedBox(height: 8),
        Wrap(spacing: 8, runSpacing: 8, children: [
          if (!searching)
            InputChip(key: const ValueKey('audit-range'), avatar: const Icon(Icons.date_range_outlined, size: 18), label: Text('${fmt.dayLabel(_from)} – ${fmt.dayLabel(_to)}'), onPressed: _range),
          ChipMenu<String?>(value: _entity, items: kEntities, onChanged: (v) => _set(() => _entity = v)),
          ChipMenu<int?>(value: _actor, items: [(null, 'Everyone'), for (final p in _people) (p.id, p.name)], onChanged: (v) => _set(() => _actor = v)),
        ]),
        const SizedBox(height: 10),
        if (_error != null && !_loaded)
          ErrorState(error: _error!, onRetry: _load)
        else if (!_loaded)
          for (var i = 0; i < 4; i++) const Padding(padding: EdgeInsets.symmetric(vertical: 6), child: SkSkeleton(height: 52))
        else ...[
          Text('$_total change${_total == 1 ? '' : 's'}', style: t.titleSmall),
          const SizedBox(height: 6),
          if (_items.isEmpty)
            const EmptyState(text: 'No changes for this filter.', icon: Icons.history_rounded)
          else
            SkGlass(
              blur: false,
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Column(children: [
                for (final e in _items)
                  ListTile(
                    onTap: () => _detail(e),
                    title: Text('${e.actorName} ${auditSummary(e)}${e.ref == null ? '' : ' ${e.ref}'}'),
                    subtitle: Text([
                      _when(e.at),
                      if (e.action == 'update' && e.changed.isNotEmpty) e.changed.where((k) => !_hidden.contains(k)).map(auditLabel).join(', '),
                    ].join(' · ')),
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
