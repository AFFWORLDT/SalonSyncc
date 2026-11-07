import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/format/fmt.dart';
import '../../core/ui/glass.dart';
import '../../core/ui/salon_logo.dart';
import '../../core/ui/states.dart';
import '../../data/settings_api.dart';
import '../../models/me.dart';

/// Picks the salon logo, resized so the upload stays under the API's 200 KB; null when cancelled.
typedef PickLogo = Future<(List<int>, String)?> Function();

Future<(List<int>, String)?> _pickLogo() async {
  final f = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 512, maxHeight: 512, imageQuality: 85);
  if (f == null) return null;
  final type = f.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
  return (await f.readAsBytes(), type);
}

String _hourLabel(int h) => '${h % 12 == 0 ? 12 : h % 12}:00 ${h < 12 ? 'AM' : 'PM'}';

/// The salon's settings, as on the web: billing, WhatsApp, reviews, the thank-you message, notifications, region and
/// salon details. One "Save settings" sends every setting (the API replaces them all).
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key, required this.me, required this.api, required this.onSaved, this.pickLogo = _pickLogo});
  final Me me;
  final SettingsApi api;

  /// Re-reads /api/me after a save so the rest of the app uses the new settings.
  final Future<void> Function() onSaved;
  final PickLogo pickLogo;

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  Map<String, dynamic>? _s;
  final _text = <String, TextEditingController>{};
  Object? _loadError;
  String? _error;
  bool _saving = false;

  Fmt get fmt => widget.me.fmt;
  bool _has(String f) => widget.me.features.contains(f);

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in _text.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final s = await widget.api.get();
      if (!mounted) return;
      setState(() {
        _s = s;
        _numeric = {for (final e in s.entries) if (e.value is num) e.key};
        _loadError = null;
      });
    } catch (e) {
      if (mounted) setState(() => _loadError = e);
    }
  }

  /// The settings that are numbers, as loaded — so a field typed wrong once still goes back as a number when fixed.
  Set<String> _numeric = const {};

  /// "12,5" (comma keyboards) reads as 12.5.
  static num? _num(String t) => num.tryParse(t.trim().replaceAll(',', '.'));

  /// One controller per text setting, filled from the loaded value; edits write back into the settings.
  TextEditingController _c(String key, [String Function(Object?)? show]) => _text.putIfAbsent(key, () {
        final v = _s![key];
        final c = TextEditingController(text: show != null ? show(v) : (v == null ? '' : '$v'));
        return c;
      });

  /// What the field holds, as the setting's type: numbers stay numbers, empty text becomes null for optional text.
  void _commitText() {
    final s = _s!;
    for (final e in _text.entries) {
      final k = e.key, t = e.value.text;
      if (k == 'quick_amounts') {
        s[k] = [for (final p in t.split(RegExp(r'[,\s]+'))) if (num.tryParse(p) case final n? when n > 0) n == n.roundToDouble() ? n.toInt() : n];
      } else if (k == 'notify_sale_min') {
        // Minor units; empty or 0 = every sale.
        s[k] = t.trim().isEmpty || _num(t) == 0 ? 0 : (fmt.fromInput(t.replaceAll(',', '.')) ?? t);
      } else if (_numeric.contains(k)) {
        s[k] = _num(t) ?? t; // the server's words explain a bad number
      } else if (s[k] == null && t.trim().isEmpty) {
        s[k] = null;
      } else {
        s[k] = t;
      }
    }
  }

  Future<void> _save() async {
    if (_saving) return;
    _commitText();
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final saved = await widget.api.save(_s!);
      await widget.onSaved();
      if (!mounted) return;
      setState(() {
        _s = {..._s!, ...saved};
        _saving = false;
      });
      ScaffoldMessenger.maybeOf(context)?.showSnackBar(const SnackBar(content: Text('Settings saved')));
    } catch (e) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = messageOf(e);
        });
      }
    }
  }

  void _toast(String s) => ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(s)));

  Future<void> _logo() async {
    final picked = await widget.pickLogo();
    if (picked == null) return;
    final (bytes, type) = picked;
    if (bytes.length > 200 * 1024) return _toast('Logo is too large (max 200 KB)');
    try {
      final url = await widget.api.uploadLogo(bytes, type);
      setState(() => _s!['logo_url'] = url);
      _toast('Logo saved');
      await widget.onSaved();
    } catch (e) {
      _toast(messageOf(e));
    }
  }

  Future<void> _removeLogo() async {
    try {
      await widget.api.removeLogo();
      setState(() => _s!['logo_url'] = null);
      _toast('Logo removed');
      await widget.onSaved();
    } catch (e) {
      _toast(messageOf(e));
    }
  }

  // ---- field helpers ----

  Widget _field(String key, String label, {String? hint, int? maxLength, TextInputType? keyboard, int maxLines = 1, String Function(Object?)? show, TextDirection? dir}) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: TextField(
          key: ValueKey('set-$key'),
          controller: _c(key, show),
          keyboardType: keyboard,
          maxLength: maxLength,
          minLines: 1,
          maxLines: maxLines,
          textDirection: dir,
          onChanged: key == 'thank_you_text' ? (_) => setState(() {}) : null,
          decoration: InputDecoration(labelText: label, helperText: hint, helperMaxLines: 3, counterText: ''),
        ),
      );

  Widget _switch(String key, String label, [String? sub]) => SwitchListTile(
        contentPadding: EdgeInsets.zero,
        title: Text(label),
        subtitle: sub == null ? null : Text(sub),
        value: _s![key] == true,
        onChanged: (v) => setState(() => _s![key] = v),
      );

  Widget _pick<T>(String key, String label, List<(T, String)> items) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: DropdownButtonFormField<T>(
          initialValue: items.any((x) => x.$1 == _s![key]) ? _s![key] as T : null,
          decoration: InputDecoration(labelText: label),
          items: [for (final (v, l) in items) DropdownMenuItem(value: v, child: Text(l))],
          onChanged: (v) => setState(() => _s![key] = v),
        ),
      );

  List<(int, String)> get _hours => [for (var h = 0; h < 24; h++) (h, _hourLabel(h))];

  Widget _section(String title, List<Widget> children, {String? sub}) => Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: SkGlass(
          blur: false,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            if (sub != null) Text(sub, style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 12),
            ...children,
          ]),
        ),
      );

  String get _preview {
    final tpl = _text['thank_you_text']?.text ?? '${_s!['thank_you_text'] ?? ''}';
    final vars = {'name': 'Ali', 'amount': fmt.money(2500), 'salon': '${_s!['display_name'] ?? ''}', 'barber': 'Sonu', 'link': 'https://${widget.me.org.slug}.salonkit.online/r/?t=…'};
    return tpl.replaceAllMapped(RegExp(r'\{(\w+)\}'), (m) => vars[m[1]] ?? m[0]!).replaceAll(RegExp(r'\s{2,}'), ' ').trim();
  }

  @override
  Widget build(BuildContext context) {
    final s = _s, t = Theme.of(context).textTheme;
    if (s == null) {
      return _loadError != null ? ErrorState(error: _loadError!, onRetry: _load) : const Center(child: CircularProgressIndicator());
    }
    final money = TextInputType.numberWithOptions(decimal: true);
    const number = TextInputType.number;
    return ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
      Text('Settings', style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w600)),
      const SizedBox(height: 12),
      _section('Billing', sub: 'Applies to new sales. Old sales keep the commission and VAT they were made with.', [
        _field('default_commission_pct', 'Default commission %', keyboard: money, hint: 'Used for barbers without their own % (set per barber on the Barbers page).'),
        _field('quick_amounts', 'Quick amounts (${fmt.currency})', hint: 'Buttons on the New sale screen, separated by commas.', show: (v) => v is List ? v.join(', ') : ''),
        _switch('vat_enabled', 'VAT on receipts', 'On: receipts are tax invoices with TRN and VAT included in the price. Off: simple receipt.'),
        if (s['vat_enabled'] == true) ...[
          _field('vat_rate', 'VAT %', keyboard: money),
          _field('trn', s['phone_country'] == '971' ? 'TRN (15 digits)' : 'Tax registration no.', maxLength: 40),
        ],
      ]),
      if (_has('whatsapp')) _WhatsAppSection(me: widget.me, api: widget.api, settings: s, field: _field, switchTile: _switch, pick: _pick, hours: _hours, onChanged: () => setState(() {})),
      _section('Reviews & links', sub: 'Links customers get from you. Each must start with https://', [
        _field('google_review_url', 'Google review link', keyboard: TextInputType.url, hint: 'Where "Rate your visit" sends happy customers'),
        _field('google_maps_url', 'Google Maps link', keyboard: TextInputType.url, hint: 'Directions to the salon; a button on the bill link'),
        _field('instagram_url', 'Instagram link', keyboard: TextInputType.url, hint: 'On the PDF bill'),
      ]),
      _section('WhatsApp thank-you', [
        _field('thank_you_text', 'Message', maxLines: 4, hint: 'You can use {name} {amount} {salon} {barber} {link}'),
        Text('Preview', style: t.labelLarge),
        const SizedBox(height: 4),
        Text(_preview),
      ]),
      if (_has('push'))
        _section('Notifications', [
          _switch('notify_sales', 'New bill created'),
          if (s['notify_sales'] == true)
            _field('notify_sale_min', 'Only sales of at least (${fmt.currency})', keyboard: money, hint: 'Empty = every sale', show: (v) => v is int && v > 0 ? fmt.toInput(v) : ''),
          _switch('notify_summary', 'End-of-day summary'),
          if (s['notify_summary'] == true) _pick<int>('summary_hour', 'Send at', _hours),
          _switch('notify_reminder', 'Reminder to barbers'),
          if (s['notify_reminder'] == true) _pick<int>('reminder_hour', 'Send at', _hours),
          _switch('notify_barber_changes', 'Tell a barber when you change or delete their sale'),
        ]),
      _section('Region', [
        _field('timezone', 'Time zone', hint: 'e.g. Asia/Dubai'),
        _pick<int>('day_start_hour', 'Day starts at', [for (var h = 0; h <= 12; h++) (h, _hourLabel(h))]),
        _field('currency', 'Currency', maxLength: 3),
        _field('locale', 'Number format', hint: 'e.g. en-AE'),
        _field('phone_country', 'Phone country code', keyboard: number, maxLength: 4),
        _field('bill_prefix', 'Bill number prefix', maxLength: 6),
      ]),
      _section('Salon details', sub: 'Shown on receipts.', [
        Row(children: [
          SalonLogo(slug: widget.me.org.slug, name: '${s['display_name'] ?? ''}', logoUrl: s['logo_url'] as String?, size: 56),
          const SizedBox(width: 12),
          OutlinedButton(onPressed: widget.me.readOnly ? null : _logo, child: Text(s['logo_url'] == null ? 'Upload logo' : 'Change logo')),
          if (s['logo_url'] != null) TextButton(onPressed: widget.me.readOnly ? null : _removeLogo, child: const Text('Remove')),
        ]),
        Padding(padding: const EdgeInsets.only(top: 4, bottom: 10), child: Text('PNG, JPEG or WebP, up to 200 KB. PNGs up to 512 × 512 px.', style: t.bodySmall)),
        _field('display_name', 'Salon name', maxLength: 80),
        _field('salon_name_ar', 'Name in Arabic', dir: TextDirection.rtl),
        _field('tagline', 'Tagline'),
        _field('address', 'Address', maxLines: 2),
        _field('phone', 'Phone', keyboard: TextInputType.phone),
        _field('licence_no', 'Licence no.'),
        _field('receipt_footer', 'Receipt footer', maxLines: 2),
      ]),
      if (_error != null) Padding(padding: const EdgeInsets.only(bottom: 10), child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
      FilledButton(
        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
        onPressed: _saving || widget.me.readOnly ? null : _save,
        child: Text(_saving ? 'Saving…' : 'Save settings'),
      ),
    ]);
  }
}

typedef _Field = Widget Function(String key, String label, {String? hint, int? maxLength, TextInputType? keyboard, int maxLines, String Function(Object?)? show, TextDirection? dir});
typedef _Switch = Widget Function(String key, String label, [String? sub]);
typedef _Pick = Widget Function<T>(String key, String label, List<(T, String)> items);

/// WhatsApp Business: connect the salon's number; when connected, bills, reminders, rating requests and templates.
class _WhatsAppSection extends StatefulWidget {
  const _WhatsAppSection({required this.me, required this.api, required this.settings, required this.field, required this.switchTile, required this.pick, required this.hours, required this.onChanged});
  final Me me;
  final SettingsApi api;
  final Map<String, dynamic> settings;
  final _Field field;
  final _Switch switchTile;
  final _Pick pick;
  final List<(int, String)> hours;
  final VoidCallback onChanged;

  @override
  State<_WhatsAppSection> createState() => _WhatsAppSectionState();
}

class _WhatsAppSectionState extends State<_WhatsAppSection> {
  final _pid = TextEditingController(), _waba = TextEditingController(), _token = TextEditingController(), _tests = TextEditingController();
  bool _hasToken = false, _busy = false;
  String? _error;

  bool get _ready => widget.settings['wa_ready'] == true;

  @override
  void initState() {
    super.initState();
    widget.api.waConfig().then((c) {
      if (!mounted || c == null) return;
      setState(() {
        _pid.text = '${c['phone_number_id'] ?? ''}';
        _waba.text = '${c['waba_id'] ?? ''}';
        _tests.text = (c['test_numbers'] is List ? (c['test_numbers'] as List).join(', ') : '');
        _hasToken = c['has_token'] == true;
      });
    }, onError: (_) {});
  }

  @override
  void dispose() {
    for (final c in [_pid, _waba, _token, _tests]) {
      c.dispose();
    }
    super.dispose();
  }

  void _toast(String s) => ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(s)));

  Future<void> _connect() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final tests = _tests.text.split(RegExp(r'[,\s]+')).where((x) => x.isNotEmpty).toList();
      await widget.api.saveWa(phoneNumberId: _pid.text, wabaId: _waba.text, token: _token.text, testNumbers: tests.isEmpty ? null : tests);
      widget.settings['wa_ready'] = true;
      widget.onChanged();
      _toast('WhatsApp connected');
    } catch (e) {
      if (mounted) setState(() => _error = messageOf(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _disconnect() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Disconnect WhatsApp?'),
        content: const Text('Bills, reminders and campaigns stop going out from this number until you connect again.'),
        actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Disconnect'))],
      ),
    );
    if (ok != true) return;
    try {
      await widget.api.removeWa();
      widget.settings['wa_ready'] = false;
      widget.onChanged();
      _toast('WhatsApp disconnected');
    } catch (e) {
      _toast(messageOf(e));
    }
  }

  Future<void> _run(Future<Map<String, dynamic>> Function() call, String label, String none) async {
    try {
      final r = await call();
      _toast((r['due'] ?? 0) == 0 ? none : '$label: ${r['sent'] ?? 0} sent, ${r['skipped'] ?? 0} skipped, ${r['failed'] ?? 0} failed');
    } catch (e) {
      _toast(messageOf(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.settings, t = Theme.of(context).textTheme, ratings = widget.me.features.contains('ratings');
    final f = widget.field;
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: SkGlass(
        blur: false,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('WhatsApp Business', style: t.titleMedium),
          Text(
            _ready
                ? 'Messages go from the salon\'s WhatsApp number using templates approved by Meta. Save to apply changes.'
                : "Connect the salon's WhatsApp Business number to send bills, reminders and rating requests.",
            style: t.bodySmall,
          ),
          const SizedBox(height: 12),
          Text(_ready ? 'Connected number' : 'Connect your WhatsApp Business number', style: t.titleSmall),
          const SizedBox(height: 8),
          TextField(controller: _pid, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Phone number ID')),
          const SizedBox(height: 8),
          TextField(controller: _waba, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'WhatsApp Business account ID')),
          const SizedBox(height: 8),
          TextField(
            controller: _token,
            obscureText: true,
            decoration: InputDecoration(
              labelText: 'Access token',
              helperMaxLines: 2,
              helperText: _hasToken ? 'A token is saved. Type it again to change any of these settings.' : 'From Meta Business settings → System users.',
            ),
          ),
          const SizedBox(height: 8),
          TextField(controller: _tests, decoration: const InputDecoration(labelText: 'Test numbers (optional)', helperText: 'While set, only these numbers get messages. Separate with commas.', helperMaxLines: 2)),
          if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
          const SizedBox(height: 8),
          Row(children: [
            FilledButton(onPressed: _busy || widget.me.readOnly ? null : _connect, child: Text(_ready ? 'Save WhatsApp settings' : 'Connect')),
            if (_ready) TextButton(onPressed: widget.me.readOnly ? null : _disconnect, child: const Text('Disconnect')),
          ]),
          if (_ready) ...[
            const Divider(height: 28),
            widget.switchTile('wa_bill_auto', 'Send bills on WhatsApp'),
            widget.switchTile('wa_reminder_enabled', 'Visit reminders'),
            if (s['wa_reminder_enabled'] == true) ...[
              f('wa_reminder_days', 'Days after the last visit', keyboard: TextInputType.number),
              widget.pick<int>('wa_reminder_hour', 'Send at', widget.hours),
              Align(
                alignment: Alignment.centerLeft,
                child: OutlinedButton(onPressed: () => _run(widget.api.runReminders, 'Reminders', 'No customers are due for a reminder today'), child: const Text('Send due reminders now')),
              ),
            ],
            if (ratings) ...[
              widget.switchTile('wa_feedback_enabled', 'Ask for a rating'),
              if (s['wa_feedback_enabled'] == true) ...[
                widget.pick<int>('wa_feedback_delay_min', 'Send it', const [(0, 'Right after the bill'), (30, '30 minutes after'), (60, '1 hour after'), (120, '2 hours after'), (180, '3 hours after'), (240, '4 hours after'), (720, '12 hours after')]),
                widget.pick<int>('wa_feedback_reminder_min', 'If not rated', const [(0, 'No reminder'), (60, 'One reminder after 1 hour'), (120, 'One reminder after 2 hours'), (180, 'One reminder after 3 hours'), (360, 'One reminder after 6 hours')]),
                Align(
                  alignment: Alignment.centerLeft,
                  child: OutlinedButton(onPressed: () => _run(widget.api.runFeedback, 'Rating requests', 'No bills are due for a rating request yet'), child: const Text('Send due requests now')),
                ),
              ],
            ],
            ExpansionTile(
              tilePadding: EdgeInsets.zero,
              title: const Text('Message templates (advanced)'),
              children: [
                f('wa_bill_template', 'Bill'),
                f('wa_bill_pdf_template', 'Bill with PDF'),
                f('wa_reminder_template', 'Visit reminder'),
                f('wa_feedback_template', 'Rating request'),
                f('wa_feedback_reminder_template', 'Rating reminder'),
                widget.pick<String>('wa_language', 'Template language', const [('en', 'en'), ('en_US', 'en_US')]),
                f('wa_rating_image_url', 'Rating picture', keyboard: TextInputType.url),
                f('wa_rating_reminder_image_url', 'Rating reminder picture', keyboard: TextInputType.url),
                f('wa_fresh_cut_image_url', 'Visit reminder picture', keyboard: TextInputType.url),
              ],
            ),
          ],
        ]),
      ),
    );
  }
}
