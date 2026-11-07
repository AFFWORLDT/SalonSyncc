import 'package:flutter/material.dart';

import '../../core/ui/toast.dart';
import '../../core/ui/states.dart';
import '../../data/account_api.dart';

/// "Change password": current, new, new again. This phone stays signed in; the server signs out the others.
Future<void> showChangePassword(BuildContext context, AccountApi api) async {
  final ok = await showModalBottomSheet<bool>(context: context, isScrollControlled: true, showDragHandle: true, builder: (_) => _Sheet(api: api));
  if (ok == true && context.mounted) {
    showSkToast(context, 'Password changed', kind: ToastKind.success);
  }
}

class _Sheet extends StatefulWidget {
  const _Sheet({required this.api});
  final AccountApi api;

  @override
  State<_Sheet> createState() => _SheetState();
}

class _SheetState extends State<_Sheet> {
  final _cur = TextEditingController(), _next = TextEditingController(), _again = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [_cur, _next, _again]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (_busy) return;
    final next = _next.text;
    final problem = next.length < 6
        ? 'New password must be at least 6 characters'
        : next.length > 200
            ? 'New password must be at most 200 characters'
            : next != _again.text
                ? "Passwords don't match"
                : null;
    if (problem != null) return setState(() => _error = problem);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.api.changePassword(_cur.text, next);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = messageOf(e);
        });
      }
    }
  }

  Widget _field(String key, String label, TextEditingController c, {bool last = false}) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextField(
          key: ValueKey(key),
          controller: c,
          obscureText: true,
          autocorrect: false,
          enableSuggestions: false,
          textInputAction: last ? TextInputAction.done : TextInputAction.next,
          onSubmitted: last ? (_) => _save() : null,
          decoration: InputDecoration(labelText: label),
        ),
      );

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Change password', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 4),
          Text('Your other phones and browsers will be signed out.', style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 16),
          _field('pw-current', 'Current password', _cur),
          _field('pw-next', 'New password', _next),
          _field('pw-again', 'New password again', _again, last: true),
          if (_error != null) Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
          FilledButton(key: const ValueKey('pw-save'), onPressed: _busy ? null : _save, child: const Text('Change password')),
        ]),
      );
}
