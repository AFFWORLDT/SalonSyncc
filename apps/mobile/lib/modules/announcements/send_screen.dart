import 'package:flutter/material.dart';

import '../../core/ui/toast.dart';
import '../../core/ui/heading.dart';
import '../../core/format/fmt.dart';
import '../../core/ui/glass.dart';
import '../../core/ui/states.dart';
import '../../data/announcements_api.dart';
import '../../data/staff_api.dart';
import '../../models/announcement.dart';
import '../../models/me.dart';
import '../../models/staff.dart';

String _people(int n) => '$n ${n == 1 ? 'person' : 'people'}';

/// The admin's side of announcements: write one to everyone or one barber (a push to their phones), and what was sent.
class SendAnnouncementScreen extends StatefulWidget {
  const SendAnnouncementScreen({super.key, required this.me, required this.api, required this.staff});
  final Me me;
  final AnnouncementsApi api;
  final StaffApi staff;

  @override
  State<SendAnnouncementScreen> createState() => _SendAnnouncementScreenState();
}

class _SendAnnouncementScreenState extends State<SendAnnouncementScreen> {
  final _title = TextEditingController(), _body = TextEditingController();
  bool _everyone = true, _sending = false;
  int? _barber;
  List<Staff> _barbers = const [];
  List<Announcement>? _sent;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _title.addListener(_changed);
    _body.addListener(_changed);
    widget.staff.list().then((l) => mounted ? setState(() => _barbers = l.where((s) => s.isBarber && s.active).toList()) : null, onError: (_) {});
    _load();
  }

  void _changed() => setState(() {});

  @override
  void dispose() {
    _title.dispose();
    _body.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final l = await widget.api.list();
      if (mounted) setState(() => _sent = l);
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  bool get _ready => _title.text.trim().isNotEmpty && _body.text.trim().isNotEmpty && (_everyone || _barber != null) && !_sending && !widget.me.readOnly;

  Future<void> _send() async {
    setState(() => _sending = true);
    try {
      final a = await widget.api.send(title: _title.text, body: _body.text, barberId: _everyone ? null : _barber);
      if (!mounted) return;
      _title.clear();
      _body.clear();
      setState(() => _sent = [a, ...?_sent]);
      showSkToast(context, 'Sent to ${a.audience == 'all' ? 'everyone' : a.targetName ?? 'the barber'} · ${_people(a.recipients)}');
    } catch (e) {
      if (mounted) showSkToast(context, messageOf(e), kind: ToastKind.error);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final fmt = widget.me.fmt, t = Theme.of(context).textTheme, cs = Theme.of(context).colorScheme;
    final sent = _sent;
    String when(int ms) => '${fmt.dateLabel(fmt.ymdOf(ms))} ${fmt.time(ms)}';

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
        const SkHeading('Announcements', subtitle: 'Send a message to your team'),
        SkGlass(
          blur: false,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('New announcement', style: t.titleMedium),
            Text('A push notification to your team’s devices.', style: t.bodySmall),
            const SizedBox(height: 12),
            Text('Send to', style: t.labelLarge),
            const SizedBox(height: 6),
            SegmentedButton<bool>(
              segments: const [ButtonSegment(value: true, label: Text('Everyone')), ButtonSegment(value: false, label: Text('One barber'))],
              selected: {_everyone},
              onSelectionChanged: (s) => setState(() => _everyone = s.first),
            ),
            if (!_everyone) ...[
              const SizedBox(height: 10),
              Text('Which barber', style: t.labelLarge),
              const SizedBox(height: 6),
              _barbers.isEmpty
                  ? const Text('No active barbers yet.')
                  : Wrap(spacing: 8, runSpacing: 8, children: [
                      for (final b in _barbers) ChoiceChip(label: Text(b.name), selected: _barber == b.id, onSelected: (_) => setState(() => _barber = b.id)),
                    ]),
            ],
            const SizedBox(height: 12),
            TextField(key: const ValueKey('ann-title'), controller: _title, maxLength: 80, decoration: const InputDecoration(labelText: 'Title', hintText: 'e.g. Shop closed Friday')),
            const SizedBox(height: 6),
            TextField(
              key: const ValueKey('ann-body'),
              controller: _body,
              maxLength: 500,
              minLines: 3,
              maxLines: 6,
              decoration: const InputDecoration(labelText: 'Message', hintText: 'Write the message your team will see…'),
            ),
            const SizedBox(height: 8),
            FilledButton(onPressed: _ready ? _send : null, child: Text(_sending ? 'Sending…' : _everyone ? 'Send to everyone' : 'Send')),
          ]),
        ),
        const SizedBox(height: 18),
        Text('Sent', style: t.titleMedium),
        const SizedBox(height: 6),
        if (sent == null && _error != null)
          const EmptyState(text: 'Couldn’t load announcements.', icon: Icons.error_outline_rounded)
        else if (sent == null)
          for (var i = 0; i < 2; i++) const Padding(padding: EdgeInsets.symmetric(vertical: 6), child: SkSkeleton(height: 72))
        else if (sent.isEmpty)
          Column(children: [
            const EmptyState(text: 'No announcements yet', icon: Icons.campaign_outlined),
            Text('Your sent messages will show here.', style: t.bodySmall),
          ])
        else
          for (final a in sent)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: SkGlass(
                blur: false,
                padding: const EdgeInsets.all(14),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(child: Text(a.title, style: t.titleSmall)),
                    Chip(label: Text(a.audience == 'all' ? 'Everyone' : a.targetName ?? ''), visualDensity: VisualDensity.compact),
                  ]),
                  Text(a.body),
                  const SizedBox(height: 6),
                  Text('${when(a.createdAt)} · ${_people(a.recipients)} · by ${a.senderName}', style: t.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
                ]),
              ),
            ),
      ]),
    );
  }
}
