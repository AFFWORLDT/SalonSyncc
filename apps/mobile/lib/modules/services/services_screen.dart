import 'package:flutter/material.dart';

import '../../core/format/fmt.dart';
import '../../core/theme/app_theme.dart';
import '../../core/ui/form_sheet.dart';
import '../../core/ui/glass.dart';
import '../../core/ui/states.dart';
import '../../data/services_admin_api.dart';
import '../../models/me.dart';
import '../../models/service.dart';

/// The price list barbers pick from: groups of services; add, edit, hide, delete, or start from the starter list.
class ServicesScreen extends StatefulWidget {
  const ServicesScreen({super.key, required this.me, required this.api});
  final Me me;
  final ServicesAdminApi api;

  @override
  State<ServicesScreen> createState() => _ServicesScreenState();
}

class _ServicesScreenState extends State<ServicesScreen> {
  List<Service>? _all;
  Object? _error;
  bool _starting = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final l = await widget.api.all();
      if (mounted) {
        setState(() {
          _all = l;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  void _toast(String s) => ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(s)));

  ServiceForm _formOf(Service s, {bool? active}) =>
      ServiceForm(category: s.category, name: s.name, description: s.description, price: widget.me.fmt.toInput(s.price), sortOrder: s.sortOrder, active: active ?? s.active);

  Future<void> _edit({Service? s, String? group}) async {
    final groups = {for (final x in _all ?? const <Service>[]) x.category}.toList();
    final r = await showFormSheet(context, (_) => _ServiceSheet(api: widget.api, me: widget.me, existing: s, group: group, groups: groups));
    if (r == null) return;
    _toast(r);
    _load();
  }

  Future<void> _toggle(Service s) async {
    try {
      await widget.api.save(_formOf(s, active: !s.active), id: s.id);
    } catch (e) {
      _toast(messageOf(e));
    }
    _load();
  }

  Future<void> _delete(Service s) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('Delete ${s.name}?'),
        content: const Text('It disappears from new sales. Bills already made keep the name and price they had. To keep it for later, hide it instead.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
          FilledButton(style: FilledButton.styleFrom(backgroundColor: Theme.of(c).colorScheme.error), onPressed: () => Navigator.pop(c, true), child: const Text('Delete')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await widget.api.delete(s.id);
      _toast('${s.name} deleted. Old bills keep it.');
    } catch (e) {
      _toast(messageOf(e));
    }
    _load();
  }

  Future<void> _starter() async {
    setState(() => _starting = true);
    try {
      await widget.api.starter();
      _toast('Starter price list added. Edit the prices to match your salon.');
      await _load();
    } catch (e) {
      _toast(messageOf(e));
    } finally {
      if (mounted) setState(() => _starting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = widget.me, fmt = me.fmt, t = Theme.of(context).textTheme, ro = me.readOnly;
    final all = _all;
    final groups = <String, List<Service>>{};
    for (final s in all ?? const <Service>[]) {
      (groups[s.category] ??= []).add(s);
    }
    for (final l in groups.values) {
      l.sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
        Row(children: [
          Expanded(child: Text('Services', style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w600))),
          if (!ro && all != null && all.isNotEmpty) FilledButton.icon(onPressed: () => _edit(), icon: const Icon(Icons.add_rounded), label: const Text('Add service')),
        ]),
        Text('What barbers pick on a new sale, and what prints on the bill.', style: t.bodySmall),
        const SizedBox(height: 12),
        if (_error != null && all == null)
          ErrorState(error: _error!, onRetry: _load)
        else if (all == null)
          for (var i = 0; i < 3; i++) const Padding(padding: EdgeInsets.symmetric(vertical: 6), child: SkSkeleton(height: 90))
        else if (all.isEmpty)
          SkGlass(
            blur: false,
            child: Column(children: [
              Text('No services yet', style: t.titleMedium),
              const SizedBox(height: 6),
              const Text('Start from a ready-made price list (haircuts, beard, colour…) and change the prices, or add your own.', textAlign: TextAlign.center),
              const SizedBox(height: 14),
              if (!ro) FilledButton(onPressed: _starting ? null : _starter, child: Text(_starting ? 'Adding…' : 'Add starter price list')),
              if (!ro) TextButton(onPressed: () => _edit(), child: const Text('Add service')),
            ]),
          )
        else
          for (final e in groups.entries)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: SkGlass(
                blur: false,
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Column(children: [
                  ListTile(
                    title: Text(e.key, style: t.titleSmall),
                    trailing: ro ? null : IconButton(tooltip: 'Add to ${e.key}', onPressed: () => _edit(group: e.key), icon: const Icon(Icons.add_rounded)),
                  ),
                  for (final s in e.value)
                    Opacity(
                      opacity: s.active ? 1 : 0.55,
                      child: ListTile(
                        title: Row(children: [
                          Flexible(child: Text(s.name)),
                          if (!s.active) Padding(padding: const EdgeInsets.only(left: 6), child: Text('Hidden', style: t.labelSmall)),
                        ]),
                        subtitle: (s.description ?? '').isEmpty ? null : Text(s.description!),
                        trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                          Text(fmt.money(s.price), style: SkText.mono.copyWith(fontWeight: FontWeight.w600)),
                          if (!ro)
                            PopupMenuButton<String>(
                              tooltip: 'Actions for ${s.name}',
                              onSelected: (v) => switch (v) { 'edit' => _edit(s: s), 'toggle' => _toggle(s), _ => _delete(s) },
                              itemBuilder: (_) => [
                                const PopupMenuItem(value: 'edit', child: Text('Edit')),
                                PopupMenuItem(value: 'toggle', child: Text(s.active ? 'Hide from new sales' : 'Show again')),
                                const PopupMenuItem(value: 'delete', child: Text('Delete')),
                              ],
                            ),
                        ]),
                      ),
                    ),
                ]),
              ),
            ),
      ]),
    );
  }
}

class _ServiceSheet extends StatefulWidget {
  const _ServiceSheet({required this.api, required this.me, this.existing, this.group, required this.groups});
  final ServicesAdminApi api;
  final Me me;
  final Service? existing;
  final String? group;
  final List<String> groups;

  @override
  State<_ServiceSheet> createState() => _ServiceSheetState();
}

class _ServiceSheetState extends State<_ServiceSheet> with FormSheetState {
  late final Service? s = widget.existing;
  late final _group = TextEditingController(text: s?.category ?? widget.group ?? '');
  late final _name = TextEditingController(text: s?.name ?? '');
  late final _desc = TextEditingController(text: s?.description ?? '');
  late final _price = TextEditingController(text: s == null ? '' : widget.me.fmt.toInput(s!.price));
  late final _order = TextEditingController(text: '${s?.sortOrder ?? 0}');

  @override
  void dispose() {
    for (final c in [_group, _name, _desc, _price, _order]) {
      c.dispose();
    }
    super.dispose();
  }

  /// The form as typed now (read when Save is tapped, not when the sheet was drawn).
  ServiceForm get _form => ServiceForm(
        category: _group.text,
        name: _name.text,
        description: _desc.text,
        price: _price.text,
        sortOrder: int.tryParse(_order.text.trim()) ?? 0,
        active: s?.active ?? true,
      );

  @override
  Widget build(BuildContext context) {
    return FormSheet(
      title: s == null ? 'Add service' : 'Edit ${s!.name}',
      subtitle: 'New prices apply to new sales; old bills keep theirs.',
      error: error,
      fields: [
        TextField(key: const ValueKey('svc-group'), controller: _group, decoration: const InputDecoration(labelText: 'Group', helperText: 'Pick one or type a new group')),
        if (widget.groups.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Wrap(spacing: 6, children: [for (final g in widget.groups) ActionChip(label: Text(g), onPressed: () => setState(() => _group.text = g))]),
          ),
        const SizedBox(height: 10),
        TextField(key: const ValueKey('svc-name'), controller: _name, maxLength: 80, decoration: const InputDecoration(labelText: 'Name', counterText: '')),
        const SizedBox(height: 10),
        TextField(controller: _desc, maxLength: 160, decoration: const InputDecoration(labelText: 'Short description (optional)', counterText: '')),
        const SizedBox(height: 10),
        TextField(
          key: const ValueKey('svc-price'),
          controller: _price,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(labelText: 'Price (${widget.me.fmt.currency})'),
        ),
        const SizedBox(height: 10),
        TextField(controller: _order, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Order', helperText: 'Lower shows first')),
      ],
      actions: [
        FilledButton(
          onPressed: busy
              ? null
              : () {
                  final f = _form;
                  run(() => widget.api.save(f, id: s?.id), s == null ? '${f.name.trim()} added' : 'Service saved');
                },
          child: Text(s == null ? 'Add service' : 'Save'),
        ),
      ],
    );
  }
}
