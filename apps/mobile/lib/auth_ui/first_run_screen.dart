import 'dart:math';

import 'package:flutter/material.dart';

import '../core/api/api_error.dart';
import '../core/format/fmt.dart';
import '../core/ui/background.dart';
import '../core/ui/glass.dart';
import '../core/ui/haptics.dart';
import '../core/ui/photo_pick.dart';
import '../core/ui/salon_logo.dart';
import '../data/settings_api.dart';
import '../data/staff_api.dart';
import '../models/me.dart';

/// Right after a new salon signs up (any way: email, Google, Apple): 1) the salon's logo, 2) invite the team by email
/// (each gets a one-tap link that opens the app signed in), 3) done. Every step can be skipped.
class FirstRunScreen extends StatefulWidget {
  const FirstRunScreen({super.key, required this.me, required this.settings, required this.staff});
  final Me me;
  final SettingsApi settings;
  final StaffApi staff;

  @override
  State<FirstRunScreen> createState() => _FirstRunScreenState();
}

class _Invitee {
  final name = TextEditingController();
  final email = TextEditingController();
  String? error;
  bool sent = false;
  void dispose() {
    name.dispose();
    email.dispose();
  }
}

/// Invited staff sign in with their link (or an email code), so the password they're created with is random and unused.
String _randomPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  final r = Random.secure();
  return List.generate(20, (_) => chars[r.nextInt(chars.length)]).join();
}

class _FirstRunScreenState extends State<FirstRunScreen> {
  int _step = 0;
  bool _busy = false;
  String? _error;
  String? _logoUrl;
  final _rows = [_Invitee()];

  @override
  void initState() {
    super.initState();
    _logoUrl = widget.me.salon.logoUrl;
  }

  @override
  void dispose() {
    for (final r in _rows) {
      r.dispose();
    }
    super.dispose();
  }

  void _next() => setState(() {
        _step++;
        _error = null;
      });

  Future<void> _pickLogo() async {
    final choice = await choosePhoto(context, hasPhoto: false, noun: 'logo');
    if (choice is! NewPhoto || !mounted) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final url = await widget.settings.uploadLogo(choice.photo.$1, choice.photo.$2);
      if (mounted) setState(() => _logoUrl = url);
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Adds each filled row as a barber (their email is their username) and emails them an invite. A row that fails says
  /// why under it; the others still go through.
  Future<void> _invite() async {
    final todo = [for (final r in _rows) if (!r.sent && (r.name.text.trim().isNotEmpty || r.email.text.trim().isNotEmpty)) r];
    if (todo.isEmpty) return _next();
    setState(() => _busy = true);
    for (final r in todo) {
      final name = r.name.text.trim(), email = r.email.text.trim().toLowerCase();
      if (name.isEmpty || !RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$').hasMatch(email)) {
        r.error = 'Enter a name and an email';
        continue;
      }
      try {
        final s = await widget.staff.create(StaffForm(name: name, username: email, email: email, role: 'barber'), password: _randomPassword());
        await widget.staff.invite(s.id);
        r.sent = true;
        r.error = null;
      } on StaffLimit {
        r.error = 'Your plan has no room for more staff';
      } on ApiError catch (e) {
        r.error = e.message;
      }
      if (mounted) setState(() {});
    }
    if (!mounted) return;
    setState(() => _busy = false);
    if (_rows.every((r) => r.sent || (r.name.text.trim().isEmpty && r.email.text.trim().isEmpty))) {
      Haptic.success();
      _next();
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme, c = Theme.of(context).colorScheme;
    final me = widget.me;
    final Widget body = switch (_step) {
      0 => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Add your salon\'s logo', style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          Text('It shows in the app, on bills and in your team\'s emails.', style: t.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
          const SizedBox(height: 24),
          Center(child: SalonLogo(key: ValueKey(_logoUrl), slug: me.org.slug, name: me.salonName, logoUrl: _logoUrl, size: 96)),
          const SizedBox(height: 16),
          OutlinedButton.icon(onPressed: _busy ? null : _pickLogo, icon: const Icon(Icons.image_outlined), label: Text(_logoUrl == null ? 'Choose logo' : 'Change logo')),
        ]),
      1 => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Invite your team', style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          Text('Each gets an email with a link that opens SalonKit on their phone, already signed in.', style: t.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
          const SizedBox(height: 16),
          for (var i = 0; i < _rows.length; i++) _row(context, i),
          TextButton.icon(
            onPressed: _busy ? null : () => setState(() => _rows.add(_Invitee())),
            icon: const Icon(Icons.add_rounded),
            label: const Text('Add another'),
          ),
        ]),
      _ => Column(children: [
          Icon(Icons.check_circle_rounded, size: 64, color: c.primary),
          const SizedBox(height: 12),
          Text('You\'re all set', style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          Text('Your 7-day free trial has started. Ring up your first sale with New sale.', textAlign: TextAlign.center, style: t.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
        ]),
    };
    final last = _step >= 2;
    return Scaffold(
      body: SkBackground(
        child: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: SkGlass(
              padding: const EdgeInsets.all(24),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Text('Step ${min(_step + 1, 3)} of 3', style: t.labelMedium?.copyWith(color: c.onSurfaceVariant)),
                const SizedBox(height: 4),
                LinearProgressIndicator(value: (_step + 1) / 3, borderRadius: BorderRadius.circular(4)),
                const SizedBox(height: 20),
                AnimatedSwitcher(duration: const Duration(milliseconds: 200), child: KeyedSubtree(key: ValueKey(_step), child: body)),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, textAlign: TextAlign.center, style: t.bodyMedium?.copyWith(color: c.error)),
                ],
                const SizedBox(height: 24),
                FilledButton(
                  key: const ValueKey('fr-next'),
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                  onPressed: _busy ? null : (last ? () => Navigator.pop(context) : (_step == 1 ? _invite : _next)),
                  child: _busy
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                      : Text(last ? 'Start using SalonKit' : (_step == 1 ? 'Send invites' : 'Next')),
                ),
                if (!last)
                  TextButton(key: const ValueKey('fr-skip'), onPressed: _busy ? null : _next, child: Text(_step == 1 ? 'Skip, I\'ll add them later' : 'Skip')),
              ]),
            ),
          ),
        ),
      ),
    );
  }

  Widget _row(BuildContext context, int i) {
    final r = _rows[i], c = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Expanded(
            flex: 2,
            child: TextField(
              key: ValueKey('fr-name-$i'),
              controller: r.name,
              enabled: !r.sent,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(labelText: 'Name', isDense: true),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            flex: 3,
            child: TextField(
              key: ValueKey('fr-email-$i'),
              controller: r.email,
              enabled: !r.sent,
              keyboardType: TextInputType.emailAddress,
              autocorrect: false,
              decoration: InputDecoration(labelText: 'Email', isDense: true, suffixIcon: r.sent ? Icon(Icons.mark_email_read_outlined, color: c.primary) : null),
            ),
          ),
        ]),
        if (r.error != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(r.error!, style: TextStyle(color: c.error, fontSize: 12.5))),
        if (r.sent) Padding(padding: const EdgeInsets.only(top: 4), child: Text('Invite sent', style: TextStyle(color: c.primary, fontSize: 12.5))),
      ]),
    );
  }
}
