import 'package:flutter/material.dart';

import '../../core/ui/haptics.dart';
import '../../core/screen_cache.dart';
import '../../core/theme/scale.dart';
import '../../core/ui/stats.dart';
import '../../core/ui/toast.dart';
import '../../core/ui/heading.dart';
import '../../core/format/fmt.dart';
import '../../core/theme/app_theme.dart';
import '../../core/ui/form_sheet.dart';
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
    final key = 'services|${widget.me.org.slug}';
    final cached = ScreenCache.get<List<Service>>(key);
    if (cached != null && _all == null) fillFromCache(setState, () => _all = cached);
    try {
      final l = await widget.api.all();
      ScreenCache.put(key, l);
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

  void _toast(String s) => showSkToast(context, s);

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

  /// Services deleted a moment ago, hidden while their Undo is on screen.
  final _hidden = <int>{};

  /// Deletes with Undo instead of a question: the row goes at once, the server is told after the toast (5 s) unless
  /// Undo was tapped. Old bills keep the name and price either way.
  Future<void> _delete(Service s) async {
    Haptic.warning();
    setState(() => _hidden.add(s.id));
    var undone = false;
    showSkToast(context, '${s.name} deleted. Old bills keep it.', onUndo: () {
      undone = true;
      if (mounted) setState(() => _hidden.remove(s.id));
    });
    await Future<void>.delayed(const Duration(seconds: 5));
    if (undone) return;
    try {
      await widget.api.delete(s.id);
    } catch (e) {
      if (mounted) {
        setState(() => _hidden.remove(s.id));
        showSkToast(context, messageOf(e), kind: ToastKind.error);
      }
    }
    if (mounted) await _load();
    if (mounted) setState(() => _hidden.remove(s.id));
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
      if (!_hidden.contains(s.id)) (groups[s.category] ??= []).add(s);
    }
    for (final l in groups.values) {
      l.sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    }
    final cs = Theme.of(context).colorScheme;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.fromLTRB(SkSpace.gutter, SkSpace.sm, SkSpace.gutter, SkSpace.xxxl), children: [
        SkHeading(
          'Services',
          subtitle: 'What barbers pick on a new sale, and what prints on the bill.',
          action: !ro && all != null && all.isNotEmpty ? FilledButton.icon(onPressed: () => _edit(), icon: const Icon(Icons.add_rounded), label: const Text('Add service')) : null,
        ),
        if (_error != null && all == null)
          ErrorState(error: _error!, onRetry: _load)
        else if (all == null)
          const SkSkeletonList(count: 5, height: 60)
        else if (all.isEmpty)
          SkCard(
            padding: const EdgeInsets.all(SkSpace.xl),
            child: Column(children: [
              Text('No services yet', style: t.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
              const SizedBox(height: 6),
              const Text('Start from a ready-made price list (haircuts, beard, colour…) and change the prices, or add your own.', textAlign: TextAlign.center),
              const SizedBox(height: 14),
              if (!ro) FilledButton(onPressed: _starting ? null : _starter, child: Text(_starting ? 'Adding…' : 'Add starter price list')),
              if (!ro) TextButton(onPressed: () => _edit(), child: const Text('Add service')),
            ]),
          )
        else
          for (final e in groups.entries) ...[
            SkSection(e.key, action: ro ? null : '+ Add', actionTooltip: 'Add to ${e.key}', onAction: () => _edit(group: e.key), top: SkSpace.md),
            SkFlatList(indent: SkSpace.lg, children: [
              for (final s in e.value)
                Opacity(
                  opacity: s.active ? 1 : 0.55,
                  child: InkWell(
                    onTap: ro ? null : () => _edit(s: s),
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(SkSpace.lg, SkSpace.md, SkSpace.xs, SkSpace.md),
                      child: Row(children: [
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Row(children: [
                              Flexible(child: Text(s.name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15))),
                              if (!s.active)
                                Container(
                                  margin: const EdgeInsets.only(left: 6),
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                                  decoration: BoxDecoration(color: cs.outlineVariant.withValues(alpha: 0.4), borderRadius: BorderRadius.circular(6)),
                                  child: Text('Hidden', style: t.labelSmall),
                                ),
                            ]),
                            if ((s.description ?? '').isNotEmpty) ...[
                              const SizedBox(height: 2),
                              Text(s.description!, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
                            ],
                          ]),
                        ),
                        Text(fmt.money(s.price), style: SkText.mono.copyWith(fontWeight: FontWeight.w700)),
                        if (!ro)
                          PopupMenuButton<String>(
                            tooltip: 'Actions for ${s.name}',
                            onSelected: (v) => switch (v) { 'edit' => _edit(s: s), 'toggle' => _toggle(s), _ => _delete(s) },
                            itemBuilder: (_) => [
                              const PopupMenuItem(value: 'edit', child: Text('Edit')),
                              PopupMenuItem(value: 'toggle', child: Text(s.active ? 'Hide from new sales' : 'Show again')),
                              const PopupMenuItem(value: 'delete', child: Text('Delete')),
                            ],
                          )
                        else
                          const SizedBox(width: SkSpace.md),
                      ]),
                    ),
                  ),
                ),
            ]),
          ],
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
  late final _order = TextEditingController(text: s == null ? '' : '${s!.sortOrder}');

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
        sortOrder: int.tryParse(_order.text.trim()) ?? s?.sortOrder,
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
