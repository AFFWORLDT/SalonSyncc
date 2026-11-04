import 'package:flutter/material.dart';

import '../../core/format/fmt.dart';
import '../../core/ui/glass.dart';
import '../../core/ui/salon_logo.dart';
import '../../core/ui/states.dart';
import '../../data/staff_api.dart';
import '../../models/me.dart';
import '../../models/staff.dart';

String pctLabel(num p) => p == p.roundToDouble() ? '${p.round()}%' : '${p.toStringAsFixed(2).replaceFirst(RegExp(r'0$'), '')}%';

/// The salon's people: owner, admins and barbers; add, edit, reset password, make inactive, delete.
class StaffScreen extends StatefulWidget {
  const StaffScreen({super.key, required this.me, required this.api});
  final Me me;
  final StaffApi api;

  @override
  State<StaffScreen> createState() => _StaffScreenState();
}

class _StaffScreenState extends State<StaffScreen> {
  List<Staff>? _all;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final l = await widget.api.list();
      if (mounted) setState(() { _all = l; _error = null; });
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  void _toast(String s) => ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(s)));
  String _limitText() => 'Your plan allows ${widget.me.maxStaff} active staff. Upgrade your plan to add more.';

  Future<void> _form([Staff? s]) async {
    final r = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _StaffForm(api: widget.api, me: widget.me, existing: s, limitText: _limitText()),
    );
    if (r == null) return;
    _toast(r);
    _load();
  }

  Future<void> _toggle(Staff s) async {
    try {
      await widget.api.update(s.id, _formOf(s), active: !s.active);
      _toast(s.active ? '${s.name} is now inactive' : '${s.name} can sign in again');
      _load();
    } on StaffLimit {
      _toast(_limitText());
    } catch (e) {
      _toast(messageOf(e));
    }
  }

  Future<void> _reset(Staff s) async {
    final ok = await showDialog<bool>(context: context, builder: (_) => _ResetDialog(api: widget.api, staff: s));
    if (ok == true) _toast('New password set for ${s.name}. They are signed out everywhere.');
  }

  Future<void> _delete(Staff s) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('Delete ${s.name}?'),
        content: const Text('If they have any sales or expenses they are made inactive instead, so old reports stay correct.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
          FilledButton(style: FilledButton.styleFrom(backgroundColor: Theme.of(c).colorScheme.error), onPressed: () => Navigator.pop(c, true), child: const Text('Delete')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      final r = await widget.api.delete(s.id);
      _toast(r == StaffDeleted.deactivated ? '${s.name} has sales, so they were made inactive (history kept)' : '${s.name} deleted');
      _load();
    } catch (e) {
      _toast(messageOf(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = widget.me, t = Theme.of(context).textTheme;
    final all = _all;
    final active = all?.where((s) => s.active && !s.isOwner).length ?? 0;
    final max = me.maxStaff;
    final full = max != null && active >= max;
    int order(Staff a, Staff b) => a.active != b.active ? (a.active ? -1 : 1) : a.sortOrder.compareTo(b.sortOrder);
    List<Staff> group(bool Function(Staff) f) => (all ?? const <Staff>[]).where(f).toList()..sort(order);
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
        Row(children: [
          Expanded(child: Text('Staff', style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w600))),
          FilledButton.icon(onPressed: full || me.readOnly || all == null ? null : () => _form(), icon: const Icon(Icons.person_add_alt_rounded), label: const Text('Add staff')),
        ]),
        Text('Shop default commission: ${pctLabel(me.salon.defaultCommissionPct)} (change in Settings)', style: t.bodySmall),
        if (max != null && all != null) Text('$active of $max staff on your plan${full ? ' · upgrade your plan to add more' : ''}', style: t.bodySmall),
        const SizedBox(height: 12),
        if (_error != null && all == null)
          ErrorState(error: _error!, onRetry: _load)
        else if (all == null)
          for (var i = 0; i < 3; i++) const Padding(padding: EdgeInsets.symmetric(vertical: 6), child: SkSkeleton(height: 64))
        else
          for (final (title, people) in [('Owner', group((s) => s.isOwner)), ('Admins', group((s) => s.role == 'admin')), ('Barbers', group((s) => s.isBarber))])
            if (people.isNotEmpty) ...[
              Padding(padding: const EdgeInsets.fromLTRB(4, 12, 4, 6), child: Text(title, style: t.titleSmall)),
              for (final s in people) _card(context, s),
            ],
      ]),
    );
  }

  Widget _card(BuildContext context, Staff s) {
    final me = widget.me, t = Theme.of(context).textTheme, cs = Theme.of(context).colorScheme;
    final self = s.id == me.user.id;
    final pct = s.commissionPct ?? me.salon.defaultCommissionPct;
    final line = ['@${s.username}', if (s.isBarber) '${pctLabel(pct)}${s.commissionPct == null ? ' (default)' : ''}', if ((s.phone ?? '').isNotEmpty) me.fmt.phone(s.phone!)].join(' · ');
    Widget badge(String b, Color c) => Container(
          margin: const EdgeInsets.only(left: 6),
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
          decoration: BoxDecoration(color: c.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(6)),
          child: Text(b, style: t.labelSmall?.copyWith(color: c)),
        );
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Opacity(
        opacity: s.active ? 1 : 0.6,
        child: SkGlass(
          blur: false,
          padding: const EdgeInsets.fromLTRB(12, 10, 4, 10),
          child: Row(children: [
            SalonLogo(slug: me.org.slug, name: s.name, logoUrl: s.avatarUrl, size: 40),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Flexible(child: Text(s.name, style: t.titleSmall, overflow: TextOverflow.ellipsis)),
                  if (s.isOwner) badge('Owner', cs.primary) else if (s.role == 'admin') badge('Admin', cs.tertiary),
                  if (!s.active) badge('Inactive', cs.outline),
                ]),
                Text(line, style: t.bodySmall),
              ]),
            ),
            if (!me.readOnly)
              PopupMenuButton<String>(
                tooltip: 'Actions for ${s.name}',
                onSelected: (v) => switch (v) { 'edit' => _form(s), 'reset' => _reset(s), 'toggle' => _toggle(s), _ => _delete(s) },
                itemBuilder: (_) => [
                  const PopupMenuItem(value: 'edit', child: Text('Edit')),
                  if (!s.isOwner || me.user.role == 'owner') const PopupMenuItem(value: 'reset', child: Text('Reset password')),
                  if (!self && !s.isOwner) PopupMenuItem(value: 'toggle', child: Text(s.active ? 'Make inactive' : 'Make active')),
                  if (!self && !s.isOwner) const PopupMenuItem(value: 'delete', child: Text('Delete')),
                ],
              ),
          ]),
        ),
      ),
    );
  }
}

/// The form as the API takes it, from a saved user (for activate / deactivate).
StaffForm _formOf(Staff s) => StaffForm(
      name: s.name,
      username: s.username,
      phone: s.phone,
      role: s.role,
      commissionPct: s.commissionPct == null ? '' : '${s.commissionPct}',
      sortOrder: s.sortOrder,
      canAddExpense: s.canAddExpense,
    );

class _StaffForm extends StatefulWidget {
  const _StaffForm({required this.api, required this.me, this.existing, required this.limitText});
  final StaffApi api;
  final Me me;
  final Staff? existing;
  final String limitText;

  @override
  State<_StaffForm> createState() => _StaffFormState();
}

class _StaffFormState extends State<_StaffForm> {
  late final Staff? s = widget.existing;
  late final _name = TextEditingController(text: s?.name ?? '');
  late final _user = TextEditingController(text: s?.username ?? '');
  final _pass = TextEditingController();
  late final _pct = TextEditingController(text: s?.commissionPct == null ? '' : '${s!.commissionPct}');
  late final _order = TextEditingController(text: s == null ? '' : '${s!.sortOrder}');
  late final _phone = TextEditingController(text: s?.phone ?? '');
  late String _role = s?.role ?? 'barber';
  late bool _canExpense = s?.canAddExpense ?? false;
  bool _userTouched = false, _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _userTouched = s != null;
    _name.addListener(() {
      if (!_userTouched) _user.text = _name.text.toLowerCase().replaceAll(RegExp(r'[^a-z0-9._\-@+]'), '');
    });
  }

  @override
  void dispose() {
    for (final c in [_name, _user, _pass, _pct, _order, _phone]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (_busy) return;
    if (_name.text.trim().isEmpty) return setState(() => _error = 'Enter a name');
    if (s == null && _pass.text.length < 4) return setState(() => _error = 'Password must be at least 4 characters');
    final f = StaffForm(
      name: _name.text,
      username: _user.text,
      phone: _phone.text,
      role: _role,
      commissionPct: _pct.text,
      sortOrder: int.tryParse(_order.text.trim()) ?? s?.sortOrder,
      canAddExpense: _role == 'barber' && _canExpense,
    );
    setState(() { _busy = true; _error = null; });
    try {
      if (s == null) {
        await widget.api.create(f, password: _pass.text);
        if (mounted) Navigator.pop(context, '${f.name.trim()} added. Share the username and password with them.');
      } else {
        await widget.api.update(s!.id, f, active: s!.active);
        if (mounted) Navigator.pop(context, 'Saved');
      }
    } on StaffLimit {
      if (mounted) setState(() { _busy = false; _error = widget.limitText; });
    } catch (e) {
      if (mounted) setState(() { _busy = false; _error = messageOf(e); });
    }
  }

  @override
  Widget build(BuildContext context) {
    final owner = s?.isOwner ?? false;
    final t = Theme.of(context).textTheme;
    InputDecoration dec(String label, [String? hint]) => InputDecoration(labelText: label, helperText: hint, helperMaxLines: 2);
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(s == null ? 'Add barber' : 'Edit ${s!.name}', style: t.titleLarge),
          Text(s == null ? 'They sign in with this username and password.' : 'Password is changed with “Reset password”.', style: t.bodySmall),
          const SizedBox(height: 14),
          TextField(key: const ValueKey('st-name'), controller: _name, textCapitalization: TextCapitalization.words, decoration: dec('Name')),
          const SizedBox(height: 10),
          TextField(
            key: const ValueKey('st-user'),
            controller: _user,
            enabled: !owner,
            autocorrect: false,
            onChanged: (_) => _userTouched = true,
            decoration: dec('Username', 'Lowercase, no spaces (an email works too)'),
          ),
          if (s == null) ...[
            const SizedBox(height: 10),
            TextField(key: const ValueKey('st-password'), controller: _pass, obscureText: true, decoration: dec('Password', 'At least 4 characters. They can change it later.')),
          ],
          const SizedBox(height: 10),
          if (!owner)
            SegmentedButton<String>(
              segments: const [ButtonSegment(value: 'barber', label: Text('Barber')), ButtonSegment(value: 'admin', label: Text('Admin'))],
              selected: {_role},
              onSelectionChanged: (v) => setState(() => _role = v.first),
            ),
          if (_role == 'barber') ...[
            const SizedBox(height: 10),
            TextField(
              controller: _pct,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: dec('Commission %', 'Empty = default ${pctLabel(widget.me.salon.defaultCommissionPct)}'),
            ),
          ],
          const SizedBox(height: 10),
          TextField(controller: _order, keyboardType: TextInputType.number, decoration: dec('Column order', s == null ? 'Position in the sheet (empty = last)' : 'Position in the sheet')),
          const SizedBox(height: 10),
          TextField(controller: _phone, keyboardType: TextInputType.phone, decoration: dec('Mobile (optional)')),
          if (_role == 'barber')
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Can add expenses'),
              subtitle: const Text('On: adds their own expense from the Today screen. Off: only you add it, from Expenses.'),
              value: _canExpense,
              onChanged: (v) => setState(() => _canExpense = v),
            ),
          if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
          const SizedBox(height: 14),
          FilledButton(onPressed: _busy ? null : _save, child: const Text('Save')),
        ]),
      ),
    );
  }
}

class _ResetDialog extends StatefulWidget {
  const _ResetDialog({required this.api, required this.staff});
  final StaffApi api;
  final Staff staff;

  @override
  State<_ResetDialog> createState() => _ResetDialogState();
}

class _ResetDialogState extends State<_ResetDialog> {
  final _pw = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _pw.dispose();
    super.dispose();
  }

  Future<void> _set() async {
    if (_busy) return;
    if (_pw.text.length < 4) return setState(() => _error = 'Password must be at least 4 characters');
    setState(() { _busy = true; _error = null; });
    try {
      await widget.api.resetPassword(widget.staff.id, _pw.text);
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() { _busy = false; _error = messageOf(e); });
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Reset password'),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('New password for ${widget.staff.name} (@${widget.staff.username}).'),
          const SizedBox(height: 12),
          TextField(key: const ValueKey('reset-pw'), controller: _pw, obscureText: true, autofocus: true, decoration: const InputDecoration(labelText: 'New password')),
          if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: _busy ? null : _set, child: const Text('Set password')),
        ],
      );
}
