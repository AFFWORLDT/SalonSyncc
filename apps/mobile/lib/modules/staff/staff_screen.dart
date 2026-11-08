import 'dart:typed_data';

import '../../core/screen_cache.dart';
import '../../core/ui/form_sheet.dart';
import '../../core/ui/toast.dart';
import '../../core/ui/avatar.dart';
import '../../core/ui/heading.dart';
import '../../core/ui/toggle.dart';
import 'package:flutter/material.dart';

import '../../core/format/fmt.dart';
import '../../core/ui/glass.dart';
import '../../core/ui/haptics.dart';
import '../../core/ui/photo_pick.dart';
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
    final key = 'staff|${widget.me.org.slug}';
    final cached = ScreenCache.get<List<Staff>>(key);
    if (cached != null && _all == null) fillFromCache(setState, () => _all = cached);
    try {
      final l = await widget.api.list();
      ScreenCache.put(key, l);
      if (mounted) setState(() { _all = l; _error = null; });
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  void _toast(String s) => showSkToast(context, s);
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

  Future<void> _invite(Staff s) async {
    try {
      final to = await widget.api.invite(s.id);
      _toast('Invite sent to $to. They tap the link on their phone to join.');
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
          Expanded(child: SkHeading('Staff')),
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
            SkAvatar(slug: me.org.slug, name: s.name, url: s.avatarUrl, size: 44),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Flexible(child: Text(s.name, style: t.titleSmall, overflow: TextOverflow.ellipsis)),
                  if (s.isOwner) badge('Owner', cs.primary) else if (s.role == 'admin') badge('Admin', cs.tertiary),
                  if (!s.active) badge('Inactive', cs.outline),
                ]),
                Text(line, style: t.bodySmall),
                // Who gets the daily / monthly report by email.
                Row(children: [
                  Icon((s.email ?? '').isEmpty ? Icons.mail_outline_rounded : Icons.mark_email_read_outlined, size: 14, color: (s.email ?? '').isEmpty ? cs.onSurfaceVariant.withValues(alpha: 0.6) : cs.primary),
                  const SizedBox(width: 4),
                  Flexible(
                    child: Text(
                      (s.email ?? '').isEmpty ? 'No email · add one for their reports' : s.email!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: t.bodySmall?.copyWith(color: (s.email ?? '').isEmpty ? cs.onSurfaceVariant.withValues(alpha: 0.7) : cs.primary),
                    ),
                  ),
                ]),
              ]),
            ),
            if (!me.readOnly)
              PopupMenuButton<String>(
                tooltip: 'Actions for ${s.name}',
                onSelected: (v) => switch (v) { 'edit' => _form(s), 'invite' => _invite(s), 'reset' => _reset(s), 'toggle' => _toggle(s), _ => _delete(s) },
                itemBuilder: (_) => [
                  const PopupMenuItem(value: 'edit', child: Text('Edit')),
                  if (!self && s.active && (s.email ?? '').isNotEmpty) const PopupMenuItem(value: 'invite', child: Text('Send invite email')),
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
      email: s.email,
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
  late final _email = TextEditingController(text: s?.email ?? '');
  bool _sendInvite = true;
  late String _role = s?.role ?? 'barber';
  late bool _canExpense = s?.canAddExpense ?? false;
  bool _userTouched = false, _busy = false;
  String? _error;

  /// A photo picked in this form (sent on Save), or the current one removed.
  PickedPhoto? _photo;
  bool _removePhoto = false;

  /// The owner's photo is only theirs to change.
  bool get _canPhoto => !(s?.isOwner ?? false) || s!.id == widget.me.user.id;

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
    for (final c in [_name, _user, _pass, _pct, _order, _phone, _email]) {
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
      email: _email.text,
      role: _role,
      commissionPct: _pct.text,
      sortOrder: int.tryParse(_order.text.trim()) ?? s?.sortOrder,
      canAddExpense: _role == 'barber' && _canExpense,
    );
    setState(() { _busy = true; _error = null; });
    try {
      final saved = s == null ? await widget.api.create(f, password: _pass.text) : await widget.api.update(s!.id, f, active: s!.active);
      final photoNote = await _savePhoto(saved.id);
      final inviteNote = _canInvite && _sendInvite ? await _inviteNote(saved.id) : '';
      if (!mounted) return;
      Haptic.success();
      Navigator.pop(
        context,
        s == null
            ? '${f.name.trim()} added.${inviteNote.isEmpty ? ' Share the username and password with them.' : inviteNote}$photoNote'
            : 'Saved.$inviteNote$photoNote',
      );
    } on StaffLimit {
      if (mounted) setState(() { _busy = false; _error = widget.limitText; });
    } catch (e) {
      if (mounted) setState(() { _busy = false; _error = messageOf(e); });
    }
  }

  /// A new email (new staff, or an email added or changed): offer to email them an invite link.
  bool get _canInvite {
    final e = _email.text.trim().toLowerCase();
    return e.contains('@') && e != (s?.email ?? '').toLowerCase();
  }

  Future<String> _inviteNote(int id) async {
    try {
      return ' Invite sent to ${await widget.api.invite(id)}.';
    } catch (e) {
      return ' (invite not sent: ${messageOf(e)})';
    }
  }

  /// Uploads or removes the photo after the details are saved; a failure here doesn't undo them, it's only reported.
  Future<String> _savePhoto(int id) async {
    try {
      if (_photo != null) {
        await widget.api.setPhoto(id, _photo!.$1, _photo!.$2);
      } else if (_removePhoto) {
        await widget.api.clearPhoto(id);
      }
      return '';
    } catch (e) {
      return ' (photo not saved: ${messageOf(e)})';
    }
  }

  Future<void> _pickPhoto() async {
    Haptic.tap();
    final has = _photo != null || (!_removePhoto && s?.avatarUrl != null);
    final c = await choosePhoto(context, hasPhoto: has);
    if (!mounted || c == null) return;
    setState(() => switch (c) {
          NewPhoto(:final photo) => (_photo = photo, _removePhoto = false),
          RemovePhoto() => (_photo = null, _removePhoto = s?.avatarUrl != null),
        });
  }

  Widget _photoRow(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    const size = 72.0;
    final name = _name.text.trim().isEmpty ? (s?.name ?? '') : _name.text.trim();
    final Widget face = _photo != null
        ? ClipOval(child: Image.memory(Uint8List.fromList(_photo!.$1), width: size, height: size, fit: BoxFit.cover))
        : SkAvatar(slug: widget.me.org.slug, name: name, url: _removePhoto ? null : s?.avatarUrl, size: size);
    final has = _photo != null || (!_removePhoto && s?.avatarUrl != null);
    return Row(children: [
      InkWell(
        key: const ValueKey('st-photo'),
        onTap: _busy ? null : _pickPhoto,
        customBorder: const CircleBorder(),
        child: Stack(clipBehavior: Clip.none, children: [
          face,
          Positioned(
            right: -4,
            bottom: -4,
            child: Container(
              padding: const EdgeInsets.all(5),
              decoration: BoxDecoration(color: cs.primary, shape: BoxShape.circle, border: Border.all(color: cs.surface, width: 2)),
              child: Icon(Icons.photo_camera_rounded, size: 14, color: cs.onPrimary),
            ),
          ),
        ]),
      ),
      const SizedBox(width: 16),
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          TextButton(
            style: TextButton.styleFrom(padding: EdgeInsets.zero, visualDensity: VisualDensity.compact),
            onPressed: _busy ? null : _pickPhoto,
            child: Text(has ? 'Change photo' : 'Add photo'),
          ),
          Text('Shown on the sale screen and the team list', style: Theme.of(context).textTheme.bodySmall),
        ]),
      ),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final owner = s?.isOwner ?? false;
    InputDecoration dec(String label, [String? hint]) => InputDecoration(labelText: label, helperText: hint, helperMaxLines: 2);
    return FormSheet(
      title: s == null ? 'Add staff' : 'Edit ${s!.name}',
      subtitle: s == null ? 'They sign in with this username and password.' : 'Password is changed with “Reset password”.',
      error: _error,
      fields: [
          if (_canPhoto) ...[_photoRow(context), const SizedBox(height: 16)],
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
              decoration: dec('Commission %', 'Leave empty to use the shop default (${pctLabel(widget.me.salon.defaultCommissionPct)})'),
            ),
          ],
          const SizedBox(height: 10),
          TextField(controller: _order, keyboardType: TextInputType.number, decoration: dec('Order on the daily sheet', s == null ? 'Their column number; leave empty to add them last' : 'Their column number, from the left')),
          const SizedBox(height: 10),
          TextField(controller: _phone, keyboardType: TextInputType.phone, decoration: dec('Mobile (optional)')),
          const SizedBox(height: 10),
          TextField(
            key: const ValueKey('st-email'),
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            autocorrect: false,
            onChanged: (_) => setState(() {}),
            decoration: dec('Email (optional)', 'Their daily and monthly report, announcements, and a note when you change their sale'),
          ),
          if (_canInvite)
            SkSwitchTile(
              key: const ValueKey('st-invite'),
              contentPadding: EdgeInsets.zero,
              title: const Text('Email them an invite'),
              subtitle: const Text('A link that opens the app on their phone, already signed in. No salon ID or password to type.'),
              value: _sendInvite,
              onChanged: (v) => setState(() => _sendInvite = v),
            ),
          if (_role == 'barber')
            SkSwitchTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Can add expenses'),
              subtitle: const Text('On: adds their own expense from the Today screen. Off: only you add it, from Expenses.'),
              value: _canExpense,
              onChanged: (v) => setState(() => _canExpense = v),
            ),
      ],
      actions: [FilledButton(key: const ValueKey('st-save'), onPressed: _busy ? null : _save, child: Text(_busy ? 'Saving…' : 'Save'))],
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
