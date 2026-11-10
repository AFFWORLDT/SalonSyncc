import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/ui/haptics.dart';
import '../../core/ui/states.dart';
import '../../data/account_api.dart';
import '../../models/me.dart';

/// "Delete account" (App Store rule 5.1.1(v)). Staff delete their own sign-in; the owner deletes the whole salon.
/// Typed confirmation: the salon ID (owner) or DELETE (staff). On success this phone forgets the sign-in.
/// [api] and [onDeleted] default to the signed-in session (tests pass their own).
Future<void> showDeleteAccount(BuildContext context, Me me, {AccountApi? api, Future<void> Function(bool salonGone)? onDeleted}) async {
  Haptic.warning();
  final owner = me.user.role == 'owner';
  final ok = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _Sheet(api: api ?? AccountApi(Get.find<AuthController>().api), owner: owner, slug: me.org.slug, salon: me.salonName),
  );
  if (ok == true) await (onDeleted ?? (gone) => Get.find<AuthController>().accountDeleted(salonGone: gone))(owner);
}

class _Sheet extends StatefulWidget {
  const _Sheet({required this.api, required this.owner, required this.slug, required this.salon});
  final AccountApi api;
  final bool owner;
  final String slug, salon;

  @override
  State<_Sheet> createState() => _SheetState();
}

class _SheetState extends State<_Sheet> {
  final _confirm = TextEditingController();
  bool _busy = false;
  String? _error;

  String get _word => widget.owner ? widget.slug : 'DELETE';
  bool get _matches => widget.owner ? _confirm.text.trim().toLowerCase() == _word.toLowerCase() : _confirm.text.trim().toUpperCase() == _word;

  @override
  void dispose() {
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _delete() async {
    if (_busy || !_matches) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.api.deleteAccount(_confirm.text.trim());
      Haptic.success();
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      Haptic.error();
      if (mounted) {
        setState(() {
          _busy = false;
          _error = messageOf(e);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    final points = widget.owner
        ? [
            '${widget.salon} is closed for good and everyone is signed out.',
            'Your account, your staff accounts and their personal details (email, phone, photos) are deleted.',
            'Card billing for the salon stops.',
          ]
        : [
            'You are signed out on every phone and browser.',
            'Your account and personal details (email, phone, photos) are deleted.',
            "Sales you made stay in the salon's records, under your name.",
          ];
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Icon(Icons.warning_amber_rounded, color: cs.error),
          const SizedBox(width: 8),
          Text(widget.owner ? 'Delete your salon account' : 'Delete your account', style: t.titleLarge),
        ]),
        const SizedBox(height: 12),
        for (final p in points)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Padding(padding: const EdgeInsets.only(top: 7, right: 10), child: Icon(Icons.circle, size: 6, color: cs.onSurfaceVariant)),
              Expanded(child: Text(p, style: t.bodyMedium)),
            ]),
          ),
        const SizedBox(height: 6),
        Text("This can't be undone.", style: t.bodyMedium?.copyWith(fontWeight: FontWeight.w700, color: cs.error)),
        const SizedBox(height: 16),
        Text(widget.owner ? 'Type your salon ID, ${widget.slug}, to confirm' : 'Type DELETE to confirm', style: t.bodySmall),
        const SizedBox(height: 8),
        TextField(
          key: const ValueKey('delete-confirm'),
          controller: _confirm,
          autocorrect: false,
          enableSuggestions: false,
          textCapitalization: widget.owner ? TextCapitalization.none : TextCapitalization.characters,
          onChanged: (_) => setState(() {}),
          onSubmitted: (_) => _delete(),
          decoration: InputDecoration(hintText: _word),
        ),
        const SizedBox(height: 12),
        if (_error != null) Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(_error!, style: TextStyle(color: cs.error))),
        FilledButton(
          key: const ValueKey('delete-account-yes'),
          style: FilledButton.styleFrom(backgroundColor: cs.error, foregroundColor: cs.onError, minimumSize: const Size.fromHeight(50)),
          onPressed: _busy || !_matches ? null : _delete,
          child: _busy ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Delete account'),
        ),
        const SizedBox(height: 4),
        TextButton(onPressed: _busy ? null : () => Navigator.of(context).pop(false), child: const Text('Cancel')),
      ]),
    );
  }
}
